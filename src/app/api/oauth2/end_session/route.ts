import { NextRequest, NextResponse } from "next/server";
import { STATIC_CLIENTS } from "@/lib/oidc";
import {
  IDP_IMPERSONATOR_COOKIE,
  IDP_SESSION_COOKIE,
  idpCookieAttributes,
  sessionCookieAttributes,
} from "@/lib/session";

/**
 * RP-initiated logout with single-sign-out (front-channel logout).
 *
 * 1. Clears the IdP session cookie so subsequent /oauth2/authorize calls
 *    require a fresh login.
 * 2. Renders an HTML page with hidden `<iframe>`s pointing at every
 *    registered client's `frontchannelLogoutUri`. Each iframe loads a
 *    public route in that product app that clears its own session
 *    cookies — so the browser ends up logged out everywhere.
 * 3. After ~2 seconds (enough for the iframes to issue their requests),
 *    JS + a `<meta http-equiv="refresh">` fallback redirect the user to
 *    the validated `post_logout_redirect_uri` (or the IdP root).
 *
 * The same handler is exposed as both GET and POST per OIDC RP-Initiated
 * Logout 1.0.
 */
export const dynamic = "force-dynamic";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Validate `post_logout_redirect_uri` against the registered clients'
 * URIs (origin must match either a redirect URI or another front-channel
 * URI). This blocks open-redirect abuse without forcing every product to
 * register dedicated post-logout URIs.
 */
function safePostLogoutRedirect(raw: string | null, state: string | null): string {
  if (!raw) return "/";
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "/";
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return "/";

  const okOrigin = STATIC_CLIENTS.some((c) => {
    const all = [...c.redirectUris, ...c.frontchannelLogoutUris];
    return all.some((u) => {
      try {
        return new URL(u).origin === parsed.origin;
      } catch {
        return false;
      }
    });
  });
  if (!okOrigin) return "/";

  if (state) parsed.searchParams.set("state", state);
  return parsed.toString();
}

async function handle(req: NextRequest) {
  const url = new URL(req.url);
  const postLogoutRedirect = safePostLogoutRedirect(
    url.searchParams.get("post_logout_redirect_uri"),
    url.searchParams.get("state"),
  );

  // Include every front-channel URL whose locality (dev/local vs prod)
  // matches the current request, so dev runs only ping localhost and
  // prod runs only ping the public hosts. Multiple URLs per client are
  // fine: the cookie-bearing browser will only succeed on origins it
  // actually has cookies for; the rest fail silently.
  const reqIsLocal =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname.endsWith(".local");

  const fcUris: string[] = [];
  for (const client of STATIC_CLIENTS) {
    for (const u of client.frontchannelLogoutUris) {
      try {
        const parsed = new URL(u);
        const isLocal =
          parsed.hostname === "localhost" ||
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname.endsWith(".local");
        if (isLocal === reqIsLocal) fcUris.push(u);
      } catch {
        // skip malformed URIs
      }
    }
  }

  const iframes = fcUris
    .map(
      (u) =>
        `    <iframe src="${escapeHtml(u)}" sandbox="allow-same-origin allow-scripts" loading="eager" aria-hidden="true" tabindex="-1"></iframe>`,
    )
    .join("\n");

  const safeRedirect = escapeHtml(postLogoutRedirect);
  const safeRedirectJs = JSON.stringify(postLogoutRedirect);

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Signing out — trefolio</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="2;url=${safeRedirect}">
  <style>
    :root { color-scheme: light dark; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #fafafa;
      color: #1f2937;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #0b0c0f; color: #e5e7eb; }
    }
    .card {
      max-width: 380px;
      padding: 32px 28px;
      text-align: center;
    }
    h1 { font-size: 18px; margin: 0 0 6px; font-weight: 700; }
    p { margin: 0 0 18px; color: #6b7280; font-size: 14px; line-height: 1.5; }
    @media (prefers-color-scheme: dark) {
      p { color: #9ca3af; }
    }
    .spinner {
      width: 28px; height: 28px; margin: 0 auto 16px;
      border-radius: 50%;
      border: 3px solid rgba(16,185,129,0.2);
      border-top-color: #10b981;
      animation: spin 700ms linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .iframes { position: fixed; width: 0; height: 0; border: 0; visibility: hidden; }
    .iframes iframe { width: 0; height: 0; border: 0; }
    a { color: #10b981; text-decoration: none; font-weight: 600; font-size: 13px; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <main class="card" role="status" aria-live="polite">
    <div class="spinner" aria-hidden="true"></div>
    <h1>Signing you out of all trefolio products…</h1>
    <p>This closes your session on trefolio, Clara, and Will at the same time.</p>
    <a href="${safeRedirect}">Continue now</a>
  </main>
  <div class="iframes" aria-hidden="true">
${iframes}
  </div>
  <script>
    (function () {
      var target = ${safeRedirectJs};
      // Give the iframes ~1.6s to send their cookie-clearing requests
      // before we navigate away. Same-origin browsers process this
      // synchronously enough that 1.6s is plenty.
      setTimeout(function () { window.location.replace(target); }, 1600);
    })();
  </script>
</body>
</html>`;

  const res = new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
    },
  });
  const attrs = sessionCookieAttributes();
  res.cookies.set(IDP_SESSION_COOKIE, "", {
    httpOnly: attrs.httpOnly,
    sameSite: attrs.sameSite,
    path: attrs.path,
    secure: attrs.secure,
    maxAge: 0,
  });
  const imp = idpCookieAttributes(IDP_IMPERSONATOR_COOKIE);
  res.cookies.set(IDP_IMPERSONATOR_COOKIE, "", {
    httpOnly: imp.httpOnly,
    sameSite: imp.sameSite,
    path: imp.path,
    secure: imp.secure,
    maxAge: 0,
  });
  return res;
}

export const GET = handle;
export const POST = handle;
