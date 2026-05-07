import type { NextRequest, NextResponse } from "next/server";

import type { IdpLocale } from "@/lib/i18n/idp-locale";
import { ecosystemCookieDomainFromHost, TREFOLIO_UI_LOCALE_COOKIE } from "@/lib/i18n/ecosystem-ui-locale";

const TTL = 60 * 60 * 24 * 365;

/** Use from Route Handlers that already build a `NextResponse`. */
export function appendTrefolioEcosystemUiLocaleCookieOnResponse(
  req: NextRequest,
  res: NextResponse,
  locale: IdpLocale,
): void {
  const host =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || "";
  const domain = ecosystemCookieDomainFromHost(host);
  res.cookies.set(TREFOLIO_UI_LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: TTL,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
    ...(domain ? { domain } : {}),
  });
}
