import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * IdP-side single-sign-on session cookie.
 *
 * The cookie is read by `/oauth2/authorize` (GET) — when present and valid,
 * we skip the login form and immediately mint a fresh authorization code.
 * That gives the user a true SSO experience: log in once on the IdP and
 * any other registered client (Clara, Will, …) signs the user in without
 * showing another password prompt.
 *
 * Format: `<sub>.<hmacSha256Base64Url(sub)>` — no expiry baked into the
 * payload itself; we rely on the cookie `Max-Age` (7 days) for that.
 *
 * `IDP_SESSION_SECRET` should be a long, random string in production. In
 * dev we fall back to a deterministic-but-non-empty default so things just
 * work after `npm run dev`.
 */
export const IDP_SESSION_COOKIE = "idp_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  return (
    process.env.IDP_SESSION_SECRET ||
    process.env.IDP_CLIENT_SECRET_TREFOLIO ||
    "dev-idp-session-secret"
  );
}

function hmac(sub: string): string {
  return createHmac("sha256", getSecret()).update(sub).digest("base64url");
}

export function signSession(sub: string): string {
  return `${sub}.${hmac(sub)}`;
}

export function verifySession(value: string | undefined | null): string | null {
  if (!value) return null;
  const idx = value.lastIndexOf(".");
  if (idx <= 0 || idx === value.length - 1) return null;
  const sub = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  const expected = hmac(sub);
  // Use constant-time compare to avoid timing oracles.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return sub;
}

export function sessionCookieAttributes(): {
  name: string;
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  maxAge: number;
  secure: boolean;
} {
  return {
    name: IDP_SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    secure: process.env.NODE_ENV === "production",
  };
}
