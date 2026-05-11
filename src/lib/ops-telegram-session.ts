import { cookies } from "next/headers";

import { isAdminEmail } from "./admin";
import { findUserBySub } from "./db";
import { IDP_IMPERSONATOR_COOKIE, IDP_SESSION_COOKIE, verifySession } from "./session";

/**
 * Which IdP `sub` owns business-ops Telegram linking for this request.
 * When impersonating, `idp_session` is the victim; use the impersonator (real operator).
 */
export async function resolveOpsTelegramOwnerSub(): Promise<string | null> {
  const jar = await cookies();
  const imp = verifySession(jar.get(IDP_IMPERSONATOR_COOKIE)?.value);
  if (imp) {
    const admin = await findUserBySub(imp);
    if (admin && isAdminEmail(admin.email)) return admin.sub;
    return null;
  }
  const sub = verifySession(jar.get(IDP_SESSION_COOKIE)?.value);
  return sub || null;
}
