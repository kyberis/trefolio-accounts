"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  findUserByEmail,
  recordIdpAuthAttemptFailure,
  recordIdpAuthAttemptSuccess,
} from "@/lib/db";
import { idpSkipsVerificationEmail } from "@/lib/idp-email-policy";
import { idpSafeInternalPath } from "@/lib/idp-safe-next";
import { sessionCookieAttributes, signSession } from "@/lib/session";

function bounce(error: string, next: string): never {
  redirect(`/sign-in?error=${encodeURIComponent(error)}&next=${encodeURIComponent(next)}`);
}

/**
 * Password-only path to set `idp_session` without an OAuth client round-trip.
 * Google / passkey-first accounts must use /oauth2/authorize via trefolio (etc.).
 */
export async function signInEstablishSession(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const next = idpSafeInternalPath(String(formData.get("next") || "/account"));

  if (!email || !password) {
    bounce("missing_fields", next);
  }

  const user = await findUserByEmail(email);
  if (!user) {
    bounce("invalid_credentials", next);
  }

  const hasPasswordLogin =
    Boolean(user.password_hash?.trim()) || Boolean(user.password_plain?.trim());
  if (!hasPasswordLogin) {
    bounce("oauth_only", next);
  }

  let valid = false;
  if (user.password_hash) {
    valid = await bcrypt.compare(password, user.password_hash);
  } else {
    valid = user.password_plain === password;
  }
  if (!valid) {
    void recordIdpAuthAttemptFailure(user.sub).catch(() => {});
    bounce("invalid_credentials", next);
  }
  void recordIdpAuthAttemptSuccess(user.sub).catch(() => {});

  if (!idpSkipsVerificationEmail() && user.email_verified !== 1) {
    bounce("email_unverified", next);
  }

  const jar = await cookies();
  const attrs = sessionCookieAttributes();
  jar.set(attrs.name, signSession(user.sub), {
    httpOnly: attrs.httpOnly,
    sameSite: attrs.sameSite,
    path: attrs.path,
    maxAge: attrs.maxAge,
    secure: attrs.secure,
  });

  redirect(next);
}
