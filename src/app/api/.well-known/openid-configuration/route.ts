import { NextRequest, NextResponse } from "next/server";
import { getMetadataApiOrigin, getPublicIssuer, getRequestPublicIssuer } from "@/lib/public-url";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // OIDC: `iss` in ID tokens MUST equal the `issuer` field here (OpenID Discovery).
  // Use env-derived issuer only — not `getRequestPublicIssuer` alone — or Clara/NextAuth
  // fetches discovery via HTTPS (forwarded host) while the token POST hits loopback
  // (no forwarded host) and `openid-client` rejects the callback with OAuthCallbackError.
  const issuerIdentifier = getPublicIssuer();
  const browserBase = getRequestPublicIssuer(req);
  const api = getMetadataApiOrigin(req);
  return NextResponse.json({
    issuer: issuerIdentifier,
    authorization_endpoint: `${browserBase}/oauth2/authorize`,
    token_endpoint: `${api}/oauth2/token`,
    userinfo_endpoint: `${api}/oauth2/userinfo`,
    jwks_uri: `${api}/oauth2/jwks`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    id_token_signing_alg_values_supported: ["RS256"],
    scopes_supported: ["openid", "email", "profile", "mcp:ecosystem"],
    subject_types_supported: ["public"],
  });
}
