import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const issuer = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3300";
  return NextResponse.json({
    issuer,
    authorization_endpoint: `${issuer}/oauth2/authorize`,
    token_endpoint: `${issuer}/api/oauth2/token`,
    userinfo_endpoint: `${issuer}/api/oauth2/userinfo`,
    jwks_uri: `${issuer}/api/oauth2/jwks`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    id_token_signing_alg_values_supported: ["HS256"],
    scopes_supported: ["openid", "email", "profile"],
    subject_types_supported: ["public"],
  });
}
