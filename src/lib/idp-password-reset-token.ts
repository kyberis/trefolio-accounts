import { SignJWT, jwtVerify } from "jose";

const TTL_SECONDS = 60 * 60; // 1 hour

function signingSecret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.IDP_PASSWORD_RESET_SECRET ||
      process.env.IDP_EMAIL_VERIFICATION_SECRET ||
      process.env.IDP_SESSION_SECRET ||
      process.env.IDP_CLIENT_SECRET_TREFOLIO ||
      "dev-idp-session-secret",
  );
}

export async function createIdpPasswordResetJwt(args: {
  sub: string;
  email: string;
}): Promise<string> {
  return new SignJWT({
    purpose: "idp_password_reset",
    email: args.email,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(args.sub)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(signingSecret());
}

export async function verifyIdpPasswordResetJwt(token: string): Promise<{
  sub: string;
  email: string;
} | null> {
  try {
    const { payload } = await jwtVerify(token, signingSecret(), {
      algorithms: ["HS256"],
    });
    if (payload.purpose !== "idp_password_reset") return null;
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    if (!sub || !email) return null;
    return { sub, email };
  } catch {
    return null;
  }
}
