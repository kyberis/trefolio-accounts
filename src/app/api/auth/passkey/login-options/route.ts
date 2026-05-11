import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";

import { getWebAuthnConfig } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

const CHALLENGE_COOKIE = "idp_passkey_login_challenge";

/**
 * Mint a discoverable-credential challenge ("usernameless" passkey login).
 * We do NOT scope `allowCredentials` because the user hasn't told us who
 * they are yet — the platform authenticator picks the right credential.
 *
 * The challenge is stored in an HttpOnly cookie that the verify endpoint
 * pops + checks. Cookies are scoped to the IdP origin, so a passkey
 * cannot be replayed across other tools by accident.
 */
export async function POST() {
  const { rpID } = getWebAuthnConfig();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials: [],
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
