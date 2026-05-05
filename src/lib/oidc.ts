import { SignJWT, importPKCS8, importSPKI, exportJWK, type KeyLike } from "jose";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getEntitlement, findUserBySub } from "./db";

const ISSUER = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3300";
const KID = process.env.IDP_RS256_KID || "trefolio-idp-dev-2026";

let _privateKey: KeyLike | null = null;
let _publicKey: KeyLike | null = null;

async function loadKeys(): Promise<void> {
  if (_privateKey && _publicKey) return;
  const privPem = readFileSync(resolve(process.cwd(), "idp-private.pem"), "utf-8");
  const pubPem = readFileSync(resolve(process.cwd(), "idp-public.pem"), "utf-8");
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
}

export async function buildIdToken({ sub, aud, nonce }: BuildIdTokenArgs): Promise<string> {
  await loadKeys();
  const user = findUserBySub(sub);
  const ent = getEntitlement(sub);
  const isPro = ent.plan === "pro" && (!ent.pro_until || new Date(ent.pro_until) > new Date());

  const claims: Record<string, unknown> = {
    email: user?.email ?? null,
    email_verified: true,
    name: user?.name ?? "",
    pro_until: ent.pro_until,
    entitlements: {
      trefolio_pro: isPro,
      clara_daily_limit: isPro ? 200 : 30,
      will_daily_limit: isPro ? 200 : 30,
    },
  };
  if (nonce) claims.nonce = nonce;

  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: KID })
    .setIssuer(ISSUER)
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
  name: string;
}

export const STATIC_CLIENTS: OidcClient[] = [
  {
    clientId: "trefolio",
    clientSecret: process.env.IDP_CLIENT_SECRET_TREFOLIO || "dev-trefolio-secret",
    redirectUris: [
      "http://localhost:3000/api/auth/oidc/callback",
      "http://localhost:3010/api/auth/oidc/callback",
      "https://trefolio.com/api/auth/oidc/callback",
    ],
    name: "trefolio",
  },
  {
    clientId: "clara",
    clientSecret: process.env.IDP_CLIENT_SECRET_CLARA || "dev-clara-secret",
    redirectUris: [
      "http://localhost:3001/api/auth/callback/trefolio-id",
      "https://clara.trefolio.com/api/auth/callback/trefolio-id",
    ],
    name: "Clara",
  },
  {
    clientId: "will",
    clientSecret: process.env.IDP_CLIENT_SECRET_WILL || "dev-will-secret",
    redirectUris: [
      "http://localhost:3002/api/auth/callback/trefolio-id",
      "https://will.trefolio.com/api/auth/callback/trefolio-id",
    ],
    name: "Will",
  },
];

export function findClient(clientId: string): OidcClient | null {
  return STATIC_CLIENTS.find((c) => c.clientId === clientId) ?? null;
}
