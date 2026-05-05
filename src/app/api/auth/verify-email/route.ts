import { NextRequest, NextResponse } from "next/server";

import { updateUserBySub } from "@/lib/db";
import {
  authorizePathFromResumeJson,
  verifyIdpEmailVerificationJwt,
} from "@/lib/idp-verification-token";
import {
  IDP_PENDING_OAUTH_RESUME_COOKIE,
  IDP_SESSION_COOKIE,
  sessionCookieAttributes,
  signSession,
} from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const base = new URL(req.url).origin;

  if (!token) {
    return NextResponse.redirect(new URL("/oauth2/authorize?error=invalid_token", base));
  }

  const parsed = await verifyIdpEmailVerificationJwt(token);
  if (!parsed) {
    return NextResponse.redirect(new URL("/oauth2/authorize?error=invalid_token", base));
  }

  const nextPath = authorizePathFromResumeJson(parsed.resumeJson);
  if (!nextPath) {
    return NextResponse.redirect(new URL("/oauth2/authorize?error=invalid_token", base));
  }

  await updateUserBySub(parsed.sub, { email_verified: 1 });

  const confirmUrl = new URL("/account/email-confirmed", base);
  confirmUrl.searchParams.set("next", nextPath);

  const res = NextResponse.redirect(confirmUrl);
  const attrs = sessionCookieAttributes();
  res.cookies.set(IDP_SESSION_COOKIE, signSession(parsed.sub), {
    httpOnly: attrs.httpOnly,
    sameSite: attrs.sameSite,
    path: attrs.path,
    maxAge: attrs.maxAge,
    secure: attrs.secure,
  });
  res.cookies.set(IDP_PENDING_OAUTH_RESUME_COOKIE, "", {
    path: "/",
    maxAge: 0,
  });
  return res;
}
