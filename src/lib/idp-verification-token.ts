import { SignJWT, jwtVerify } from "jose";

import type { SP } from "@/lib/oauth-resume";

const TTL_SECONDS = 60 * 60 * 24; // 24 hours — match trefolio verification mail

function signingSecret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.IDP_EMAIL_VERIFICATION_SECRET ||
      process.env.IDP_SESSION_SECRET ||
      process.env.IDP_CLIENT_SECRET_TREFOLIO ||
      "dev-idp-session-secret",
  );
}

export async function createIdpEmailVerificationJwt(args: {
  sub: string;
  email: string;
  resumeJson: string;
}): Promise<string> {
  return new SignJWT({
    purpose: "idp_email_verification",
    email: args.email,
    resume: args.resumeJson,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(args.sub)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(signingSecret());
}

export async function verifyIdpEmailVerificationJwt(token: string): Promise<{
  sub: string;
  email: string;
  resumeJson: string;
} | null> {
  try {
    const { payload } = await jwtVerify(token, signingSecret(), {
      algorithms: ["HS256"],
    });
    if (payload.purpose !== "idp_email_verification") return null;
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    const resume =
      typeof payload.resume === "string" ? payload.resume : "";
    if (!sub || !email || !resume) return null;
    return { sub, email, resumeJson: resume };
  } catch {
    return null;
  }
}

/** Build compact JSON stored in the JWT and in the pending-oauth cookie. */
export function buildOAuthResumeJson(sp: SP): string {
  const r: Record<string, string> = {
    client_id: sp.client_id || "",
    redirect_uri: sp.redirect_uri || "",
    state: sp.state || "",
    code_challenge: sp.code_challenge || "",
    code_challenge_method: sp.code_challenge_method || "S256",
    response_type: "code",
    scope: sp.scope || "openid email profile",
  };
  if (sp.nonce) r.nonce = sp.nonce;
  if (sp.app_hint) r.app_hint = sp.app_hint;
  if (sp.screen_hint) r.screen_hint = sp.screen_hint;
  if (sp.signup) r.signup = sp.signup;
  if (sp.prompt) r.prompt = sp.prompt;
  if (sp.ui_locales) r.ui_locales = sp.ui_locales;
  return JSON.stringify(r);
}

/** Turn stored resume JSON into `/oauth2/authorize?…` path + query (same-origin). */
export function authorizePathFromResumeJson(resumeJson: string): string | null {
  try {
    const o = JSON.parse(resumeJson) as Record<string, string>;
    if (!o.client_id || !o.redirect_uri || !o.code_challenge) return null;
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) {
      if (v !== undefined && v !== "") usp.set(k, v);
    }
    return `/oauth2/authorize?${usp.toString()}`;
  } catch {
    return null;
  }
}
