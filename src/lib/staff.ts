import { isAdminEmail } from "./admin";
import type { DbUser } from "./db";

/**
 * IdP "platform staff" —may mint ops Telegram link codes on /account.
 * Env allow-list admins (`IDP_ADMIN_EMAILS`) always qualify; others need `is_staff`.
 */
export function isPlatformStaff(user: DbUser | null | undefined): boolean {
  if (!user) return false;
  if (user.is_staff === 1) return true;
  return isAdminEmail(user.email);
}
