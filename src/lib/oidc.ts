import { SignJWT, importPKCS8, importSPKI, exportJWK, type KeyLike } from "jose";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getEntitlement, findUserBySub } from "./db";
import { getPublicIssuer } from "./public-url";

const KID = process.env.IDP_RS256_KID || "trefolio-idp-dev-2026";

let _privateKey: KeyLike | null = null;
let _publicKey: KeyLike | null = null;

/**
 * RS256 keys for ID tokens + JWKS.
 *
 * - **Production (Vercel):** set `IDP_PRIVATE_KEY_PEM` and `IDP_PUBLIC_KEY_PEM`
 *   to the full PEM text (PKCS#8 private + SPKI public). Gitignored
 *   `idp-*.pem` files are not deployed.
 * - **Local:** omit env vars and place `idp-private.pem` / `idp-public.pem` in
 *   the project root (see README), or paste PEMs into `.env.local`.
 */
function readPemPair(): { priv: string; pub: string } {
  const envPriv = process.env.IDP_PRIVATE_KEY_PEM?.trim();
  const envPub = process.env.IDP_PUBLIC_KEY_PEM?.trim();
  if (envPriv && envPub) {
    return {
      priv: envPriv.replace(/\\n/g, "\n"),
      pub: envPub.replace(/\\n/g, "\n"),
    };
  }
  const cwd = process.cwd();
  try {
    return {
      priv: readFileSync(resolve(cwd, "idp-private.pem"), "utf-8"),
      pub: readFileSync(resolve(cwd, "idp-public.pem"), "utf-8"),
    };
  } catch {
    throw new Error(
      "IdP RSA keys missing: set IDP_PRIVATE_KEY_PEM and IDP_PUBLIC_KEY_PEM on the server (required on Vercel), or add idp-private.pem + idp-public.pem for local dev.",
    );
  }
}

async function loadKeys(): Promise<void> {
  if (_privateKey && _publicKey) return;
  const { priv: privPem, pub: pubPem } = readPemPair();
  _privateKey = await importPKCS8(privPem, "RS256");
  _publicKey = await importSPKI(pubPem, "RS256");
}

export async function getPublicJwk() {
  await loadKeys();
  const jwk = await exportJWK(_publicKey!);
  return { ...jwk, alg: "RS256", use: "sig", kid: KID };
}

export function verifyPkce(verifier: string, challenge: string, method: string): boolean {
  if (method === "plain") return verifier === challenge;
  if (method !== "S256") return false;
  const expected = createHash("sha256").update(verifier).digest("base64url");
  return expected === challenge;
}

export function newAuthCode(): string {
  return randomBytes(24).toString("base64url");
}

interface BuildIdTokenArgs {
  sub: string;
  aud: string;
  nonce?: string | null;
  /** Defaults to env issuer; pass request-derived issuer so `iss` matches client `IDP_BASE_URL`. */
  issuer?: string;
}

export async function buildIdToken({ sub, aud, nonce, issuer }: BuildIdTokenArgs): Promise<string> {
  await loadKeys();
  const user = await findUserBySub(sub);
  const ent = await getEntitlement(sub);
  const isPro = ent.plan === "pro" && (!ent.pro_until || new Date(ent.pro_until) > new Date());

  const claims: Record<string, unknown> = {
    email: user?.email ?? null,
    email_verified: Boolean(user?.email_verified),
    name: user?.name ?? "",
    picture: user?.avatar_url?.trim() ? user.avatar_url.trim() : null,
    tax_residency: user?.tax_residency?.trim() ? user.tax_residency.trim() : null,
    pro_until: ent.pro_until,
    entitlements: {
      trefolio_pro: isPro,
      clara_daily_limit: isPro ? 200 : 30,
      will_daily_limit: isPro ? 200 : 30,
    },
  };
  if (nonce) claims.nonce = nonce;

  const iss = issuer ?? getPublicIssuer();

  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: KID })
    .setIssuer(iss)
    .setSubject(sub)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(_privateKey!);
}

export interface OidcClient {
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
  /**
   * Front-channel logout URLs the IdP loads as hidden iframes during
   * `/api/oauth2/end_session`, so logging out of any one product also
   * clears the other products' local sessions in the same browser.
   */
  frontchannelLogoutUris: string[];
  name: string;
}

export const STATIC_CLIENTS: OidcClient[] = [
  {
    clientId: "trefolio",
    clientSecret: process.env.IDP_CLIENT_SECRET_TREFOLIO || "dev-trefolio-secret",
    redirectUris: [
      "http://localhost:3000/api/auth/oidc/callback",
      "http://localhost:3010/api/auth/oidc/callback",
      "http://127.0.0.1:3000/api/auth/oidc/callback",
      "http://127.0.0.1:3010/api/auth/oidc/callback",
      "https://trefolio-dev.com/api/auth/oidc/callback",
      "https://trefolio.com/api/auth/oidc/callback",
      "https://www.trefolio.com/api/auth/oidc/callback",
    ],
    frontchannelLogoutUris: [
      "http://localhost:3000/api/auth/idp-logout",
      "http://localhost:3010/api/auth/idp-logout",
      "http://127.0.0.1:3000/api/auth/idp-logout",
      "http://127.0.0.1:3010/api/auth/idp-logout",
      "https://trefolio-dev.com/api/auth/idp-logout",
      "https://trefolio.com/api/auth/idp-logout",
      "https://www.trefolio.com/api/auth/idp-logout",
    ],
    name: "trefolio",
  },
  {
    clientId: "clara",
    clientSecret: process.env.IDP_CLIENT_SECRET_CLARA || "dev-clara-secret",
    redirectUris: [
      "http://localhost:3001/api/auth/callback/trefolio-id",
      "https://clara.trefolio-dev.com/api/auth/callback/trefolio-id",
      "https://clara.trefolio.com/api/auth/callback/trefolio-id",
    ],
    frontchannelLogoutUris: [
      "http://localhost:3001/api/auth/idp-logout",
      "https://clara.trefolio-dev.com/api/auth/idp-logout",
      "https://clara.trefolio.com/api/auth/idp-logout",
    ],
    name: "Clara",
  },
  {
    clientId: "will",
    clientSecret: process.env.IDP_CLIENT_SECRET_WILL || "dev-will-secret",
    redirectUris: [
      "http://localhost:3200/api/auth/callback/trefolio-id",
      "https://will.trefolio-dev.com/api/auth/callback/trefolio-id",
      "https://will.trefolio.com/api/auth/callback/trefolio-id",
    ],
    frontchannelLogoutUris: [
      "http://localhost:3200/api/auth/idp-logout",
      "https://will.trefolio-dev.com/api/auth/idp-logout",
      "https://will.trefolio.com/api/auth/idp-logout",
    ],
    name: "Will",
  },
  {
    clientId: "claude-mcp",
    clientSecret: process.env.IDP_CLIENT_SECRET_CLAUDE_MCP || "dev-claude-mcp-secret",
    redirectUris: [
      "https://claude.ai/api/mcp/auth_callback",
      "http://localhost:3118/callback",
      "http://127.0.0.1:3118/callback",
    ],
    frontchannelLogoutUris: [],
    name: "Claude (MCP Connectors)",
  },
];

export function findClient(clientId: string): OidcClient | null {
  return STATIC_CLIENTS.find((c) => c.clientId === clientId) ?? null;
}
