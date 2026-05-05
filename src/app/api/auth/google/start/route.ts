import { NextRequest, NextResponse } from "next/server";

import { findClient } from "@/lib/oidc";
import {
  googleAuthorizeUrl,
  isGoogleConfigured,
} from "@/lib/google";
import {
  OIDC_PENDING_COOKIE,
  makePending,
  newCsrf,
  pendingCookieAttributes,
} from "@/lib/oidc-pending";

export const dynamic = "force-dynamic";

/**
 * Begin the "Sign in with Google" flow.
 *
 * Two callers:
 * - From `/oauth2/authorize`: the link includes the in-flight OIDC params
 *   (`client_id`, `redirect_uri`, `code_challenge`, …). We stash them in
 *   the `oidc_pending` cookie so the callback can resume the OIDC dance.
 * - From any IdP-internal page (`/account/*`, `/admin/*`): no OIDC params
 *   are needed; we just want to mint an `idp_session` cookie and bounce
 *   back via `?next=/some/path`.
 */
export async function GET(req: NextRequest) {
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      { error: "google_not_configured" },
      { status: 503 },
    );
  }

  const sp = req.nextUrl.searchParams;
  const csrf = newCsrf();

  // OIDC-mid-flight branch. We only set the pending cookie when the params
  // look like a real client request; otherwise we leave it unset and the
  // callback falls back to redirecting to `next` (or `/`).
  const clientId = sp.get("client_id") || "";
  const redirectUri = sp.get("redirect_uri") || "";
  const client = clientId ? findClient(clientId) : null;
  const validClient =
    client && redirectUri && client.redirectUris.includes(redirectUri);

  let cookieValue: string | null = null;
  if (validClient) {
    const made = makePending({
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: sp.get("code_challenge") || "",
      code_challenge_method: sp.get("code_challenge_method") || "S256",
      nonce: sp.get("nonce") || undefined,
      state: sp.get("state") || undefined,
      app_hint: sp.get("app_hint") || undefined,
      csrf,
    });
    cookieValue = made.value;
  }

  // Non-OIDC branch: still HMAC-protect a state with `next` so we can
  // safely redirect back to a same-origin path after Google.
  if (!validClient) {
    const next = sp.get("next") || "/";
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
    const made = makePending({
      client_id: "",
      redirect_uri: "",
      code_challenge: "",
      code_challenge_method: "",
      app_hint: safeNext, // reuse field as safe-next holder
      csrf,
    });
    cookieValue = made.value;
  }

  const url = googleAuthorizeUrl(csrf);
  const res = NextResponse.redirect(url);
  if (cookieValue) {
    const attrs = pendingCookieAttributes();
    res.cookies.set(OIDC_PENDING_COOKIE, cookieValue, {
      httpOnly: attrs.httpOnly,
      sameSite: attrs.sameSite,
      path: attrs.path,
      maxAge: attrs.maxAge,
      secure: attrs.secure,
    });
  }
  return res;
}
