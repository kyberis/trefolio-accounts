import { timingSafeEqual } from "node:crypto";

/**
 * Shared secret for Clara / Will / trefolio to call `POST /api/v1/pat/introspect`.
 * Set the same value on every deployment (Vercel env).
 */
export function getPatIntrospectionSecret(): string | null {
  const s = process.env.TREFOLIO_PAT_INTROSPECTION_SECRET?.trim();
  return s || null;
}

/** True when the request carries the service bearer matching the configured secret. */
export function isPatIntrospectionAuthorized(request: Request): boolean {
  const secret = getPatIntrospectionSecret();
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  const [scheme, ...rest] = auth.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return false;
  const token = rest.join(" ").trim();
  if (!token || token.length !== secret.length) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
