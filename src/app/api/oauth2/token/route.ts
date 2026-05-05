import { NextRequest, NextResponse } from "next/server";
import { consumeAuthCode } from "@/lib/db";
import { findClient, verifyPkce, buildIdToken } from "@/lib/oidc";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") || "";
  let body: Record<string, string> = {};
  if (ct.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    body = Object.fromEntries(new URLSearchParams(text));
  } else if (ct.includes("application/json")) {
    body = await req.json();
  }

  const grantType = body.grant_type;
  if (grantType !== "authorization_code") {
    return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
  }

  const code = body.code;
  const redirectUri = body.redirect_uri;
  const clientId = body.client_id;
  const clientSecret = body.client_secret;
  const codeVerifier = body.code_verifier;

  const client = findClient(clientId);
  if (!client) return NextResponse.json({ error: "invalid_client" }, { status: 401 });
  if (clientSecret !== client.clientSecret) {
    return NextResponse.json({ error: "invalid_client", error_description: "client_secret mismatch" }, { status: 401 });
  }

  const stored = consumeAuthCode(code);
  if (!stored) return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  if (stored.client_id !== clientId) return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  if (stored.redirect_uri !== redirectUri) return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  if (!verifyPkce(codeVerifier || "", stored.code_challenge, stored.code_challenge_method)) {
    return NextResponse.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, { status: 400 });
  }

  const idToken = await buildIdToken({ sub: stored.sub, aud: clientId, nonce: stored.nonce });
  const accessToken = "dev-access-" + randomBytes(16).toString("base64url") + "." + stored.sub;

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 900,
    id_token: idToken,
    scope: stored.scope,
  });
}
