import { NextRequest, NextResponse } from "next/server";

import {
  createUser,
  findUserByEmail,
  findUserByGoogleId,
  saveAuthCode,
  updateUserBySub,
} from "@/lib/db";
import { exchangeGoogleCode, isGoogleConfigured } from "@/lib/google";
import { findClient, newAuthCode } from "@/lib/oidc";
import { normalizeIdpLocale } from "@/lib/i18n/idp-locale";
import {
  OIDC_PENDING_COOKIE,
  pendingCookieAttributes,
  readPending,
} from "@/lib/oidc-pending";
import {
  IDP_SESSION_COOKIE,
  sessionCookieAttributes,
  signSession,
} from "@/lib/session";

export const dynamic = "force-dynamic";

function clearPendingCookie(res: NextResponse): void {
  const attrs = pendingCookieAttributes();
  res.cookies.set(OIDC_PENDING_COOKIE, "", {
    httpOnly: attrs.httpOnly,
    sameSite: attrs.sameSite,
    path: attrs.path,
    secure: attrs.secure,
    maxAge: 0,
  });
}

function setSessionCookie(res: NextResponse, sub: string): void {
  const attrs = sessionCookieAttributes();
  res.cookies.set(attrs.name, signSession(sub), {
    httpOnly: attrs.httpOnly,
    sameSite: attrs.sameSite,
    path: attrs.path,
    maxAge: attrs.maxAge,
    secure: attrs.secure,
  });
}

export async function GET(req: NextRequest) {
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      { error: "google_not_configured" },
      { status: 503 },
    );
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  // The user might cancel on Google. Bounce them back to the originating
  // OIDC authorize page so they can try a different method.
  const pending = readPending(req.cookies.get(OIDC_PENDING_COOKIE)?.value);

  if (error || !code || !state) {
    const target = pending?.client_id
      ? rebuildAuthorizeUrl(pending, error || "google_cancelled")
      : "/";
    const res = NextResponse.redirect(new URL(target, req.url));
    clearPendingCookie(res);
    return res;
  }
  if (!pending || pending.csrf !== state) {
    const res = NextResponse.redirect(new URL("/?err=google_state", req.url));
    clearPendingCookie(res);
    return res;
  }

  let profile;
  try {
    profile = await exchangeGoogleCode(code);
  } catch (e) {
    console.error("[google] token exchange failed", e);
    const target = pending.client_id
      ? rebuildAuthorizeUrl(pending, "google_exchange_failed")
      : "/?err=google_exchange";
    const res = NextResponse.redirect(new URL(target, req.url));
    clearPendingCookie(res);
    return res;
  }

  // Resolve / link / create the local IdP user. Order matters:
  // 1. Match by Google `sub` first — most reliable.
  // 2. Otherwise, match by email (link existing email-only user, e.g.
  //    a migrated trefolio account that hasn't used Google yet).
  // 3. Otherwise, provision a brand-new IdP user. Email is auto-verified
  //    iff Google says so.
  let user = await findUserByGoogleId(profile.sub);
  if (!user) {
    user = await findUserByEmail(profile.email);
    if (user) {
      await updateUserBySub(user.sub, {
        google_id: profile.sub,
        email_verified: profile.emailVerified || user.email_verified === 1 ? 1 : 0,
        name: user.name || profile.name || "",
      });
      // Refresh fields for ID token claims.
      user = {
        ...user,
        google_id: profile.sub,
        name: user.name || profile.name || "",
        email_verified:
          profile.emailVerified || user.email_verified === 1 ? 1 : 0,
      };
    } else {
      user = await createUser({
        email: profile.email,
        name: profile.name || profile.email.split("@")[0],
        googleId: profile.sub,
        emailVerified: profile.emailVerified,
        locale: normalizeIdpLocale(pending.ui_locale),
      });
    }
  }

  // Resolve final redirect target.
  let target: string;
  if (pending.client_id) {
    const client = findClient(pending.client_id);
    if (!client || !client.redirectUris.includes(pending.redirect_uri)) {
      target = "/?err=invalid_client";
    } else {
      const oidcCode = newAuthCode();
      await saveAuthCode({
        code: oidcCode,
        sub: user.sub,
        clientId: client.clientId,
        redirectUri: pending.redirect_uri,
        codeChallenge: pending.code_challenge,
        codeChallengeMethod: pending.code_challenge_method,
        nonce: pending.nonce,
      });
      const cb = new URL(pending.redirect_uri);
      cb.searchParams.set("code", oidcCode);
      if (pending.state) cb.searchParams.set("state", pending.state);
      target = cb.toString();
    }
  } else {
    // Non-OIDC branch: `app_hint` was repurposed as a safe-next path.
    const safeNext =
      pending.app_hint && pending.app_hint.startsWith("/") &&
      !pending.app_hint.startsWith("//")
        ? pending.app_hint
        : "/";
    target = safeNext;
  }

  const res = NextResponse.redirect(target);
  setSessionCookie(res, user.sub);
  clearPendingCookie(res);
  return res;
}

function rebuildAuthorizeUrl(
  pending: ReturnType<typeof readPending> & object,
  error: string,
): string {
  const sp = new URLSearchParams();
  if (pending.client_id) sp.set("client_id", pending.client_id);
  if (pending.redirect_uri) sp.set("redirect_uri", pending.redirect_uri);
  sp.set("response_type", "code");
  sp.set("scope", "openid email profile");
  if (pending.code_challenge) sp.set("code_challenge", pending.code_challenge);
  if (pending.code_challenge_method)
    sp.set("code_challenge_method", pending.code_challenge_method);
  if (pending.nonce) sp.set("nonce", pending.nonce);
  if (pending.state) sp.set("state", pending.state);
  if (pending.app_hint) sp.set("app_hint", pending.app_hint);
  if (pending.screen_hint) sp.set("screen_hint", pending.screen_hint);
  if (pending.signup) sp.set("signup", pending.signup);
  if (pending.ui_locale) sp.set("ui_locales", pending.ui_locale);
  sp.set("error", error);
  return `/oauth2/authorize?${sp.toString()}`;
}
