import { cookies, headers } from "next/headers";

import type { IdpLocale } from "@/lib/i18n/idp-locale";
import { ecosystemCookieDomainFromHost, TREFOLIO_UI_LOCALE_COOKIE } from "@/lib/i18n/ecosystem-ui-locale";

const TTL = 60 * 60 * 24 * 365;

/**
 * Mirror the IdP UI language into the ecosystem cookie so trefolio / Clara /
 * Will see the same choice on the next OAuth hop (shared `Domain` on prod).
 */
export async function persistTrefolioEcosystemUiLocaleCookie(locale: IdpLocale): Promise<void> {
  const jar = await cookies();
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host")?.split(",")[0]?.trim() || hdrs.get("host") || "";
  const domain = ecosystemCookieDomainFromHost(host);
  jar.set(TREFOLIO_UI_LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: TTL,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
    ...(domain ? { domain } : {}),
  });
}
