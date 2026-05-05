/**
 * Email verification for IdP-hosted signup/login.
 *
 * Today password signups on `/oauth2/authorize` do not send a confirmation
 * email. When a verification flow is added, gate outbound mail with
 * `idpSkipsVerificationEmail()` so local/dev stacks stay quiet unless opted in.
 */
export function idpSkipsVerificationEmail(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.IDP_SKIP_VERIFICATION_EMAIL === "true";
}
