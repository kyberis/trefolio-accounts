import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";

import {
  findPasskeyById,
  findUserBySub,
  recordIdpAuthAttemptFailure,
  recordIdpAuthAttemptSuccess,
  saveAuthCode,
  updatePasskeyCounter,
} from "@/lib/db";
import { findClient, newAuthCode } from "@/lib/oidc";
import {
  IDP_SESSION_COOKIE,
  sessionCookieAttributes,
  signSession,
} from "@/lib/session";
import { getWebAuthnConfig } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

const CHALLENGE_COOKIE = "idp_passkey_login_challenge";

interface Body {
  credential?: unknown;
  oidc?: {
    client_id?: string;
    redirect_uri?: string;
    code_challenge?: string;
    code_challenge_method?: string;
    nonce?: string;
    state?: string;
  };
}

/**
 * Verify a `navigator.credentials.get()` response. On success:
 * - Bump the credential counter (counter regression is fatal).
 * - Mint an `idp_session` cookie for the resolved user.
 * - If the caller is mid-OIDC flow, mint an authorization code and return
 *   the redirect URL for the client app's callback. Otherwise return
 *   `{ ok: true }` so the page can navigate to its own destination.
 */
export async function POST(req: NextRequest) {
  const store = await cookies();
  const challenge = store.get(CHALLENGE_COOKIE)?.value;
  if (!challenge) {
    return NextResponse.json({ error: "no_challenge" }, { status: 400 });
  }
  // Single-use challenge.
  store.set(CHALLENGE_COOKIE, "", { path: "/", maxAge: 0 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const cred = body.credential as { id?: string } & Record<string, unknown>;
  if (!cred?.id || typeof cred.id !== "string") {
    return NextResponse.json({ error: "missing_credential" }, { status: 400 });
  }

  const passkey = await findPasskeyById(cred.id);
  if (!passkey) {
    return NextResponse.json({ error: "unknown_credential" }, { status: 401 });
  }
  const user = await findUserBySub(passkey.sub);
  if (!user) {
    void recordIdpAuthAttemptFailure(passkey.sub).catch(() => {});
    return NextResponse.json({ error: "unknown_user" }, { status: 401 });
  }

  const { rpID, origin } = getWebAuthnConfig();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: cred as unknown as Parameters<
        typeof verifyAuthenticationResponse
      >[0]["response"],
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.id,
        publicKey: Buffer.from(passkey.public_key, "base64url"),
        counter: passkey.counter,
        transports: passkey.transports as AuthenticatorTransport[],
      },
    });
  } catch (e) {
    void recordIdpAuthAttemptFailure(passkey.sub).catch(() => {});
    return NextResponse.json(
      {
        error: "verification_failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 401 },
    );
  }
  if (!verification.verified) {
    void recordIdpAuthAttemptFailure(passkey.sub).catch(() => {});
    return NextResponse.json({ error: "not_verified" }, { status: 401 });
  }

  await updatePasskeyCounter(
    passkey.id,
    verification.authenticationInfo.newCounter,
  );

  void recordIdpAuthAttemptSuccess(user.sub).catch(() => {});

  // Issue the IdP session cookie *before* minting an OIDC code so the
  // user lands on their destination already signed in.
  const sessionAttrs = sessionCookieAttributes();
  store.set(sessionAttrs.name, signSession(user.sub), {
    httpOnly: sessionAttrs.httpOnly,
    sameSite: sessionAttrs.sameSite,
    path: sessionAttrs.path,
    maxAge: sessionAttrs.maxAge,
    secure: sessionAttrs.secure,
  });

  // OIDC continuation branch.
  if (body.oidc?.client_id && body.oidc.redirect_uri) {
    const client = findClient(body.oidc.client_id);
    if (!client || !client.redirectUris.includes(body.oidc.redirect_uri)) {
      return NextResponse.json({ error: "invalid_client" }, { status: 400 });
    }
    const oidcCode = newAuthCode();
    await saveAuthCode({
      code: oidcCode,
      sub: user.sub,
      clientId: client.clientId,
      redirectUri: body.oidc.redirect_uri,
      codeChallenge: body.oidc.code_challenge || "",
      codeChallengeMethod: body.oidc.code_challenge_method || "S256",
      nonce: body.oidc.nonce,
    });
    const cb = new URL(body.oidc.redirect_uri);
    cb.searchParams.set("code", oidcCode);
    if (body.oidc.state) cb.searchParams.set("state", body.oidc.state);
    return NextResponse.json({ ok: true, redirectTo: cb.toString() });
  }

  return NextResponse.json({ ok: true, sub: user.sub });
}
