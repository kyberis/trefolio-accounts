import type { NextRequest } from "next/server";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * Env-only issuer for UI copy and code paths that have no Request (e.g. WebAuthn).
 */
export function getPublicIssuer(): string {
  const raw =
    process.env.IDP_ISSUER ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_BASE_URL ||
    "http://localhost:3300";
  return trimTrailingSlash(raw);
}

/**
 * Issuer for OIDC metadata and signed ID tokens. Prefer `X-Forwarded-Host` /
 * `X-Forwarded-Proto` (Caddy, Vercel) so JWT `iss` matches `IDP_BASE_URL` on
 * relying parties when the IdP is reached at `https://user.trefolio-dev.com`
 * while `IDP_ISSUER` is still unset or points at `localhost`.
 */
export function getRequestPublicIssuer(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (host) {
    const protoHeader = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const proto =
      protoHeader || (req.nextUrl.protocol === "https:" ? "https" : "http");
    return trimTrailingSlash(`${proto}://${host}`);
  }
  return getPublicIssuer();
}
