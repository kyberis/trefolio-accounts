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

  // NextAuth (and most OIDC clients) authenticate with HTTP Basic by default;
  // fall back to body params for clients that send credentials there.
  let basicId: string | undefined;
  let basicSecret: string | undefined;
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = Buffer.from(authHeader.slice(6).trim(), "base64").toString("utf-8");
      const idx = decoded.indexOf(":");
      if (idx >= 0) {
        basicId = decodeURIComponent(decoded.slice(0, idx));
        basicSecret = decodeURIComponent(decoded.slice(idx + 1));
      }
    } catch {
      // ignore malformed header; will fail invalid_client below
    }
  }

  const code = body.code;
  const redirectUri = body.redirect_uri;
  const clientId = basicId || body.client_id;
  const clientSecret = basicSecret || body.client_secret;
  const codeVerifier = body.code_verifier;

  const client = findClient(clientId);
  if (!client) return NextResponse.json({ error: "invalid_client" }, { status: 401 });
  if (clientSecret !== client.clientSecret) {
    return NextResponse.json({ error: "invalid_client", error_description: "client_secret mismatch" }, { status: 401 });
  }

  const stored = await consumeAuthCode(code);
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
