import type { NextRequest } from "next/server";
import { cookies, headers } from "next/headers";

import { isAdminEmail } from "./admin";
import { findUserBySub } from "./db";
import { IDP_IMPERSONATOR_COOKIE, IDP_SESSION_COOKIE, verifySession } from "./session";

/**
 * Last-resort parse when `NextRequest.cookies` / `cookies()` miss values that are still
 * present on the raw `Cookie` header (observed on some POST route invocations).
 */
function parseCookieFromHeader(cookieHeader: string | null | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const segments = cookieHeader.split(";").map((s) => s.trim());
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    const eq = seg.indexOf("=");
    if (eq <= 0) continue;
    const k = seg.slice(0, eq).trim();
    if (k !== name) continue;
    let v = seg.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
      v = v.slice(1, -1).replace(/\\"/g, '"');
    }
    return v.length > 0 ? v : undefined;
  }
  return undefined;
}

function pickCookieValue(
  req: NextRequest | undefined,
  headerStore: Awaited<ReturnType<typeof cookies>>,
  name: string,
  rawCookieHeader: string | null | undefined,
): string | undefined {
  const fromRequest = req?.cookies?.get(name)?.value;
  const fromHeader = headerStore.get(name)?.value;
  const fromRaw = parseCookieFromHeader(rawCookieHeader, name);
  return (
    (fromRequest && fromRequest.length > 0 ? fromRequest : undefined) ??
    (fromHeader && fromHeader.length > 0 ? fromHeader : undefined) ??
    (fromRaw && fromRaw.length > 0 ? fromRaw : undefined)
  );
}

/**
 * Which IdP `sub` owns business-ops Telegram linking for this request.
 * When impersonating, `idp_session` is the victim; use the impersonator (real operator).
 *
 * @param req - Pass the route's `NextRequest` so we can merge `req.cookies` with
 *   `cookies()` and fall back to raw `Cookie` parsing (covers broken cookie stores on POST).
 */
export async function resolveOpsTelegramOwnerSub(req?: NextRequest): Promise<string | null> {
  const headerStore = await cookies();
  const rawCookieHeader = req?.headers.get("cookie") ?? (await headers()).get("cookie");

  const sessionSub = verifySession(
    pickCookieValue(req, headerStore, IDP_SESSION_COOKIE, rawCookieHeader),
  );
  const imp = verifySession(
    pickCookieValue(req, headerStore, IDP_IMPERSONATOR_COOKIE, rawCookieHeader),
  );

  if (imp) {
    if (!sessionSub) return null;
    const admin = await findUserBySub(imp);
    if (admin && isAdminEmail(admin.email)) return admin.sub;
    if (admin && !isAdminEmail(admin.email)) return null;
  }

  return sessionSub || null;
}
