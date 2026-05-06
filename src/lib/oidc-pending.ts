import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Short-lived signed cookie that stashes the in-flight OIDC authorize
 * parameters while the user takes a side-trip (Google sign-in, passkey
 * authentication, …). When they come back, we read the cookie, mint a
 * fresh authorization code, and bounce them to the original `redirect_uri`.
 *
 * Format: `<base64url(json)>.<hmacSha256Base64Url(payload)>`.
 *   payload = { client_id, redirect_uri, code_challenge,
 *               code_challenge_method, nonce, state, app_hint,
 *               screen_hint, signup, exp, csrf }
 *
 * The `csrf` field doubles as the OAuth `state` value we send to Google /
 * the WebAuthn challenge id, so we can verify the round-trip wasn't
 * tampered with.
 */
export const OIDC_PENDING_COOKIE = "oidc_pending";
const TTL_SECONDS = 10 * 60;

function getSecret(): string {
  return (
    process.env.IDP_SESSION_SECRET ||
    process.env.IDP_CLIENT_SECRET_TREFOLIO ||
    "dev-idp-session-secret"
  );
}

function hmac(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export interface PendingOidc {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  nonce?: string;
  state?: string;
  app_hint?: string;
  /** IdP authorize UI: show signup-first when "signup". */
  screen_hint?: string;
  /** IdP authorize UI: "1" = signup-first (alias of screen_hint=signup). */
  signup?: string;
  /** Preferred UI language for this pending flow (en, de, es, fr, it). */
  ui_locale?: string;
  /** epoch seconds */
  exp: number;
  csrf: string;
}

export function newCsrf(): string {
  return randomBytes(18).toString("base64url");
}

export function makePending(
  args: Omit<PendingOidc, "exp" | "csrf"> & { csrf?: string },
): { value: string; pending: PendingOidc } {
  const pending: PendingOidc = {
    client_id: args.client_id,
    redirect_uri: args.redirect_uri,
    code_challenge: args.code_challenge,
    code_challenge_method: args.code_challenge_method,
    nonce: args.nonce,
    state: args.state,
    app_hint: args.app_hint,
    screen_hint: args.screen_hint,
    signup: args.signup,
    ui_locale: args.ui_locale,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    csrf: args.csrf ?? newCsrf(),
  };
  const payload = Buffer.from(JSON.stringify(pending)).toString("base64url");
  return { value: `${payload}.${hmac(payload)}`, pending };
}

export function readPending(value: string | undefined | null): PendingOidc | null {
  if (!value) return null;
  const idx = value.lastIndexOf(".");
  if (idx <= 0 || idx === value.length - 1) return null;
  const payload = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  const expected = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let decoded: PendingOidc;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof decoded.exp !== "number" || decoded.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return decoded;
}

export function pendingCookieAttributes(): {
  name: string;
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  maxAge: number;
  secure: boolean;
} {
  return {
    name: OIDC_PENDING_COOKIE,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
    secure: process.env.NODE_ENV === "production",
  };
}
