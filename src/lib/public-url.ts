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

/**
 * Origin for machine-facing OIDC endpoints in discovery (`token`, `userinfo`, `jwks`).
 *
 * When clients fetch `/.well-known/openid-configuration` over **loopback** (no
 * `X-Forwarded-Host`), listing HTTPS `user.trefolio-dev.com` for those endpoints
 * forces Node to trust Caddy's CA. Optional **`IDP_SERVER_ORIGIN`** (e.g.
 * `http://127.0.0.1:3300`) rewrites only those three URLs while **`issuer`** and
 * **`authorization_endpoint`** stay on the public issuer (browser).
 *
 * When metadata is requested **through** Caddy/Vercel, forwarded headers are set
 * and this returns the same origin as {@link getRequestPublicIssuer} so external
 * callers see a single HTTPS issuer.
 */
export function getMetadataApiOrigin(req: NextRequest): string {
  const issuer = getRequestPublicIssuer(req);
  const forwarded = Boolean(req.headers.get("x-forwarded-host")?.trim());
  const split = process.env.IDP_SERVER_ORIGIN?.trim().replace(/\/+$/, "");
  if (split && !forwarded) return split;
  return issuer;
}
