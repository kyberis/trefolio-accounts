/**
 * Email verification for IdP-hosted password signup/sign-in.
 *
 * In **production**, outbound verification mail is sent via Resend (`RESEND_API_KEY`)
 * unless `IDP_SKIP_VERIFICATION_EMAIL=true`.
 *
 * Non-production (and optional prod skip): mail is not sent; password signup
 * behaves as immediately verified so local dev stays frictionless.
 */
export function idpSkipsVerificationEmail(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.IDP_SKIP_VERIFICATION_EMAIL === "true";
}
