import type { NextRequest } from "next/server";
import { cookies } from "next/headers";

import { isAdminEmail } from "./admin";
import { findUserBySub } from "./db";
import { IDP_IMPERSONATOR_COOKIE, IDP_SESSION_COOKIE, verifySession } from "./session";

function pickCookieValue(
  req: NextRequest | undefined,
  headerStore: Awaited<ReturnType<typeof cookies>>,
  name: string,
): string | undefined {
  const fromRequest = req?.cookies?.get(name)?.value;
  const fromHeader = headerStore.get(name)?.value;
  // `NextRequest.cookies` is sometimes present but empty on POST while `cookies()` still
  // reflects the incoming `Cookie` header — merge per name.
  const raw = (fromRequest && fromRequest.length > 0 ? fromRequest : undefined) ?? fromHeader;
  return raw && raw.length > 0 ? raw : undefined;
}

/**
 * Which IdP `sub` owns business-ops Telegram linking for this request.
 * When impersonating, `idp_session` is the victim; use the impersonator (real operator).
 *
 * @param req - Pass the route's `NextRequest` so we can merge `req.cookies` with
 *   `cookies()` (covers runtimes where one is empty and the other is not).
 */
export async function resolveOpsTelegramOwnerSub(req?: NextRequest): Promise<string | null> {
  const headerStore = await cookies();

  const imp = verifySession(pickCookieValue(req, headerStore, IDP_IMPERSONATOR_COOKIE));
  if (imp) {
    const admin = await findUserBySub(imp);
    if (admin && isAdminEmail(admin.email)) return admin.sub;
    if (admin && !isAdminEmail(admin.email)) return null;
    // Valid-looking impersonator cookie but user row missing — fall through to session.
  }

  return verifySession(pickCookieValue(req, headerStore, IDP_SESSION_COOKIE)) || null;
}
