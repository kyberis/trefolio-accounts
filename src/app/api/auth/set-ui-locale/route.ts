import { NextRequest, NextResponse } from "next/server";

import { isIdpLocale } from "@/lib/i18n/idp-locale";
import { appendTrefolioEcosystemUiLocaleCookieOnResponse } from "@/lib/i18n/append-trefolio-ecosystem-ui-locale-cookie";
import { idpUiLocaleCookieAttributes } from "@/lib/session";

export const dynamic = "force-dynamic";

function safeInternalPath(next: string | null): string {
  const n = (next || "/").trim();
  if (!n.startsWith("/") || n.startsWith("//")) return "/oauth2/authorize";
  return n;
}

/**
 * Sets the IdP UI / email language cookie and redirects back (typically to
 * `/oauth2/authorize?…` with the same OAuth query string).
 */
export async function GET(req: NextRequest) {
  const locale = req.nextUrl.searchParams.get("locale") || "";
  if (!isIdpLocale(locale)) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  const next = safeInternalPath(req.nextUrl.searchParams.get("next"));
  const res = NextResponse.redirect(new URL(next, req.url));
  const attrs = idpUiLocaleCookieAttributes();
  res.cookies.set(attrs.name, locale, {
    httpOnly: attrs.httpOnly,
    sameSite: attrs.sameSite,
    path: attrs.path,
    maxAge: attrs.maxAge,
    secure: attrs.secure,
  });
  appendTrefolioEcosystemUiLocaleCookieOnResponse(req, res, locale);
  return res;
}
