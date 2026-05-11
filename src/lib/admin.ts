import { cookies } from "next/headers";

import { findUserBySub, type DbUser } from "./db";
import { IDP_IMPERSONATOR_COOKIE, IDP_SESSION_COOKIE, verifySession } from "./session";

/**
 * IdP-side admin guard.
 *
 * The unified accounts service has its own admin surface (`/admin/*`) so a
 * single operator can see every user in the IdP plus their linked accounts in
 * trefolio, Clara, and Will.
 *
 * Membership is gated by a comma-separated `IDP_ADMIN_EMAILS` env var.
 * Any signed-in IdP user (valid `idp_session` cookie) whose email matches one
 * of the allow-listed addresses is treated as admin. Demoting an admin
 * therefore requires removing them from the env var — by design.
 */

function getAdminEmails(): ReadonlySet<string> {
  const raw = process.env.IDP_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().has(email.toLowerCase());
}

export interface IdpAdminContext {
  user: DbUser;
}

/**
 * Resolve the admin context for the current request, or `null` if the caller
 * is not signed in / not an admin. We never redirect from here so callers can
 * decide whether to render a 403 or push to the login page.
 */
export async function getIdpAdmin(): Promise<IdpAdminContext | null> {
  const store = await cookies();
  const sub = verifySession(store.get(IDP_SESSION_COOKIE)?.value);
  if (!sub) return null;
  const user = await findUserBySub(sub);
  if (!user) return null;
  if (!isAdminEmail(user.email)) return null;
  return { user };
}

/**
 * Operator UI context for /agents: normal admin session, or real operator while
 * impersonating (session cookie holds the victim).
 */
export async function getIdpOperatorUiContext(): Promise<{
  user: DbUser;
  impersonating: boolean;
} | null> {
  const adminCtx = await getIdpAdmin();
  if (adminCtx) return { user: adminCtx.user, impersonating: false };

  const store = await cookies();
  const sessionSub = verifySession(store.get(IDP_SESSION_COOKIE)?.value);
  const impSub = verifySession(store.get(IDP_IMPERSONATOR_COOKIE)?.value);
  if (!impSub) return null;
  // Impersonation always pairs a valid victim `idp_session` with `idp_impersonator`.
  // Without both, drop through so we do not show operator chrome while APIs 401.
  if (!sessionSub) return null;

  const operator = await findUserBySub(impSub);
  if (!operator || !isAdminEmail(operator.email)) return null;
  return { user: operator, impersonating: true };
}

/**
 * Public marker (visible to admin pages so they can render "no admins yet"
 * helper text). Never expose the actual email list to non-admin viewers.
 */
export function hasAdminConfigured(): boolean {
  return getAdminEmails().size > 0;
}
