import { SignJWT, jwtVerify } from "jose";

import { getPublicIssuer } from "@/lib/public-url";

const PURPOSE = "idp_registration_approval";
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

/**
 * When true (default), new IdP users cannot complete OIDC until an operator
 * approves them. Set `REGISTRATION_REQUIRES_APPROVAL=false` for open self-host.
 */
export function requiresRegistrationApproval(): boolean {
  const v = process.env.REGISTRATION_REQUIRES_APPROVAL?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return true;
}

export function isRegistrationApproved(user: {
  registration_approved_at?: string | null;
}): boolean {
  if (!requiresRegistrationApproval()) return true;
  const at = user.registration_approved_at;
  return typeof at === "string" && at.trim().length > 0;
}

function signingSecret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.IDP_REGISTRATION_APPROVAL_SECRET ||
      process.env.IDP_EMAIL_VERIFICATION_SECRET ||
      process.env.IDP_SESSION_SECRET ||
      process.env.IDP_CLIENT_SECRET_TREFOLIO ||
      "dev-idp-session-secret",
  );
}

export async function createRegistrationApprovalJwt(args: {
  sub: string;
  email: string;
}): Promise<string> {
  return new SignJWT({
    purpose: PURPOSE,
    email: args.email,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(args.sub)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(signingSecret());
}

export async function verifyRegistrationApprovalJwt(token: string): Promise<{
  sub: string;
  email: string;
} | null> {
  try {
    const { payload } = await jwtVerify(token, signingSecret(), {
      algorithms: ["HS256"],
    });
    if (payload.purpose !== PURPOSE) return null;
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    if (!sub || !email) return null;
    return { sub, email };
  } catch {
    return null;
  }
}

export function buildRegistrationApproveUrl(token: string): string {
  const issuer = getPublicIssuer().replace(/\/+$/, "");
  return `${issuer}/api/auth/approve-registration?token=${encodeURIComponent(token)}`;
}

/** ISO timestamp to store when creating an auto-approved user (env off). */
export function registrationApprovedAtForCreate(): string | null {
  return requiresRegistrationApproval() ? null : new Date().toISOString();
}
