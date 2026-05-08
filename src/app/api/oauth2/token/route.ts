import { NextRequest, NextResponse } from "next/server";
import {
  accountsAuthProbeLog,
  accountsAuthProbeWarn,
  subTail,
} from "@/lib/auth-probe-log";
import { consumeAuthCode } from "@/lib/db";
import { findClient, verifyPkce, buildIdToken } from "@/lib/oidc";
import { getPublicIssuer } from "@/lib/public-url";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

function clientIdTail(id: string | undefined): string | undefined {
  if (!id) return undefined;
  if (id.length <= 12) return "***";
  return `…${id.slice(-10)}`;
}

export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") || "";
  let body: Record<string, string> = {};
  if (ct.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    body = Object.fromEntries(new URLSearchParams(text));
  } else if (ct.includes("application/json")) {
    body = await req.json();
  }

  accountsAuthProbeLog("oauth2.token.request", {
    contentTypeFamily: ct.includes("json") ? "json" : ct.includes("urlencoded") ? "form" : "other",
    grantType: body.grant_type ?? "(missing)",
    hasCode: Boolean(body.code),
    hasRedirectUri: Boolean(body.redirect_uri),
    hasCodeVerifier: Boolean(body.code_verifier),
    viaBasicAuth: req.headers.get("authorization")?.toLowerCase().startsWith("basic ") ?? false,
  });

  const grantType = body.grant_type;
  if (grantType !== "authorization_code") {
    accountsAuthProbeWarn("oauth2.token.unsupported_grant", {
      grantType: grantType ?? "(missing)",
    });
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
  if (!client) {
    accountsAuthProbeWarn("oauth2.token.invalid_client", {
      reason: "unknown_client_id",
      clientIdTail: clientIdTail(clientId),
    });
    return NextResponse.json({ error: "invalid_client" }, { status: 401 });
  }
  if (clientSecret !== client.clientSecret) {
    accountsAuthProbeWarn("oauth2.token.invalid_client", {
      reason: "client_secret_mismatch",
      clientIdTail: clientIdTail(clientId),
    });
    return NextResponse.json({ error: "invalid_client", error_description: "client_secret mismatch" }, { status: 401 });
  }

  const stored = await consumeAuthCode(code);
  if (!stored) {
    accountsAuthProbeWarn("oauth2.token.invalid_grant", {
      reason: "unknown_or_expired_code",
      clientIdTail: clientIdTail(clientId),
    });
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }
  if (stored.client_id !== clientId) {
    accountsAuthProbeWarn("oauth2.token.invalid_grant", {
      reason: "code_client_mismatch",
      clientIdTail: clientIdTail(clientId),
    });
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }
  if (stored.redirect_uri !== redirectUri) {
    accountsAuthProbeWarn("oauth2.token.invalid_grant", {
      reason: "redirect_uri_mismatch",
      clientIdTail: clientIdTail(clientId),
    });
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }
  if (!verifyPkce(codeVerifier || "", stored.code_challenge, stored.code_challenge_method)) {
    accountsAuthProbeWarn("oauth2.token.invalid_grant", {
      reason: "pkce_failed",
      clientIdTail: clientIdTail(clientId),
      challengeMethod: stored.code_challenge_method,
    });
    return NextResponse.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, { status: 400 });
  }

  // Must match `issuer` in `/.well-known/openid-configuration` (see that route).
  const idToken = await buildIdToken({
    sub: stored.sub,
    aud: clientId,
    nonce: stored.nonce,
    issuer: getPublicIssuer(),
  });
  const accessToken = "dev-access-" + randomBytes(16).toString("base64url") + "." + stored.sub;

  accountsAuthProbeLog("oauth2.token.issued", {
    subTail: subTail(stored.sub),
    clientIdTail: clientIdTail(clientId),
    scope: stored.scope,
  });

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 900,
    id_token: idToken,
    scope: stored.scope,
  });
}
