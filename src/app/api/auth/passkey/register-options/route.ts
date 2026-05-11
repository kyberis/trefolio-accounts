import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateRegistrationOptions } from "@simplewebauthn/server";

import { findUserBySub, listPasskeysForSub } from "@/lib/db";
import {
  IDP_SESSION_COOKIE,
  verifySession,
} from "@/lib/session";
import { getWebAuthnConfig } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

const CHALLENGE_COOKIE = "idp_passkey_reg_challenge";

/**
 * Mint a registration challenge for the currently signed-in IdP user.
 * The challenge is stored in an HttpOnly cookie that the verify endpoint
 * pops + checks. We exclude already-enrolled credentials so the platform
 * authenticator nudges the user to enroll a *new* one.
 */
export async function POST() {
  const store = await cookies();
  const sub = verifySession(store.get(IDP_SESSION_COOKIE)?.value);
  if (!sub) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const user = await findUserBySub(sub);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { rpID, rpName } = getWebAuthnConfig();
  const existing = await listPasskeysForSub(sub);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(user.sub),
    userName: user.email,
    userDisplayName: user.name || user.email,
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({
      id: p.id,
      transports: p.transports as AuthenticatorTransport[],
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  const res = NextResponse.json(options);
  res.cookies.set(CHALLENGE_COOKIE, options.challenge, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 5,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
