import { createRemoteJWKSet, jwtVerify } from "jose";

import { getPublicIssuer } from "./public-url";

/**
 * Google OAuth 2.0 / OIDC integration for the IdP.
 *
 * Flow:
 * 1. Client opens `/oauth2/authorize?client_id=…&redirect_uri=…` (the
 *    product app's OIDC request).
 * 2. User clicks "Sign in with Google" → Server Action redirects to
 *    `googleAuthorizeUrl()` after stashing the original OIDC params in a
 *    short-lived signed cookie (`oidc_pending`).
 * 3. Google redirects back to `/api/auth/google/callback?code=…&state=…`.
 *    We verify state, exchange the code for an id_token, verify its
 *    signature against Google's JWKS, then either find/create the local
 *    IdP user, set the `idp_session` cookie, mint an OIDC code, and
 *    redirect to the original `redirect_uri`.
 *
 * Production redirect URI: `${IDP_ISSUER}/api/auth/google/callback`.
 * Add it to the Google OAuth client's "Authorized redirect URIs".
 */

const GOOGLE_AUTHZ = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs";

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getGoogleRedirectUri(): string {
  return `${getPublicIssuer()}/api/auth/google/callback`;
}

/**
 * Build the URL we redirect the browser to so the user can pick a Google
 * account. `state` MUST match what we re-check on the callback to prevent
 * CSRF; we keep it opaque (random) and stash everything else in a cookie.
 */
export function googleAuthorizeUrl(state: string, uiLocaleHint?: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: getGoogleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    access_type: "online",
  });
  const hl = (uiLocaleHint || "").trim().toLowerCase();
  if (hl === "de" || hl === "es" || hl === "fr" || hl === "it" || hl === "en") {
    params.set("hl", hl);
  }
  return `${GOOGLE_AUTHZ}?${params.toString()}`;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (_jwks) return _jwks;
  _jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS));
  return _jwks;
}

/**
 * Exchange the auth code Google redirected with for tokens, then verify the
 * `id_token` against Google's JWKS. Returns a thin profile keyed by Google
 * `sub`. Throws on any signature / claim mismatch.
 */
export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: getGoogleRedirectUri(),
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`google_token_exchange_failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { id_token?: string };
  if (!json.id_token) throw new Error("google_token_missing_id_token");

  const { payload } = await jwtVerify(json.id_token, getJwks(), {
    audience: process.env.GOOGLE_CLIENT_ID,
    issuer: ["https://accounts.google.com", "accounts.google.com"],
  });

  const sub = String(payload.sub || "");
  const email = String(payload.email || "").toLowerCase();
  if (!sub || !email) throw new Error("google_id_token_missing_claims");

  return {
    sub,
    email,
    emailVerified: Boolean(payload.email_verified),
    name: typeof payload.name === "string" ? payload.name : null,
    picture: typeof payload.picture === "string" ? payload.picture : null,
  };
}
