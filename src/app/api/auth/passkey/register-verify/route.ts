import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyRegistrationResponse } from "@simplewebauthn/server";

import { findUserBySub, insertPasskey } from "@/lib/db";
import {
  IDP_SESSION_COOKIE,
  verifySession,
} from "@/lib/session";
import { getWebAuthnConfig } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

const CHALLENGE_COOKIE = "idp_passkey_reg_challenge";

interface Body {
  credential?: unknown;
  deviceName?: string;
}

/**
 * Verify a `navigator.credentials.create()` response and persist the new
 * passkey. The challenge stored in the `idp_passkey_reg_challenge` cookie
 * is consumed (cleared) on every call to prevent replay.
 */
export async function POST(req: NextRequest) {
  const store = await cookies();
  const sub = verifySession(store.get(IDP_SESSION_COOKIE)?.value);
  if (!sub) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const user = await findUserBySub(sub);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const challenge = store.get(CHALLENGE_COOKIE)?.value;
  if (!challenge) {
    return NextResponse.json({ error: "no_challenge" }, { status: 400 });
  }
  // Single-use: clear immediately, regardless of verify result.
  store.set(CHALLENGE_COOKIE, "", { path: "/", maxAge: 0 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!body.credential || typeof body.credential !== "object") {
    return NextResponse.json({ error: "missing_credential" }, { status: 400 });
  }

  const { rpID, origin } = getWebAuthnConfig();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.credential as Parameters<
        typeof verifyRegistrationResponse
      >[0]["response"],
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: "verification_failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 400 },
    );
  }
  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "not_verified" }, { status: 400 });
  }

  const { credential, credentialBackedUp } = verification.registrationInfo;
  const transports = Array.isArray((body.credential as any).response?.transports)
    ? ((body.credential as any).response.transports as string[])
    : [];

  await insertPasskey({
    id: credential.id,
    sub: user.sub,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports,
    backedUp: Boolean(credentialBackedUp),
    deviceName: (body.deviceName || "").slice(0, 60),
  });

  return NextResponse.json({ ok: true, id: credential.id });
}
