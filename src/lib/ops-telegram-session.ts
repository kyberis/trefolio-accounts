import type { NextRequest } from "next/server";
import { cookies } from "next/headers";

import { isAdminEmail } from "./admin";
import { findUserBySub } from "./db";
import { IDP_IMPERSONATOR_COOKIE, IDP_SESSION_COOKIE, verifySession } from "./session";

type CookieJar = Pick<Awaited<ReturnType<typeof cookies>>, "get">;

async function readCookieJar(req?: NextRequest): Promise<CookieJar> {
  if (req?.cookies) return req.cookies;
  return await cookies();
}

/**
 * Which IdP `sub` owns business-ops Telegram linking for this request.
 * When impersonating, `idp_session` is the victim; use the impersonator (real operator).
 *
 * Pass the route's `NextRequest` so cookies are read from the incoming request (some
 * runtimes do not reliably attach `cookies()` from `next/headers` to POST handlers).
 */
export async function resolveOpsTelegramOwnerSub(req?: NextRequest): Promise<string | null> {
  const jar = await readCookieJar(req);
  const imp = verifySession(jar.get(IDP_IMPERSONATOR_COOKIE)?.value);
  if (imp) {
    const admin = await findUserBySub(imp);
    if (admin && isAdminEmail(admin.email)) return admin.sub;
    return null;
  }
  const sub = verifySession(jar.get(IDP_SESSION_COOKIE)?.value);
  return sub || null;
}
