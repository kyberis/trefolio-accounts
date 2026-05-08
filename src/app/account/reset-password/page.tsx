import { cookies, headers } from "next/headers";

import { ResetPasswordClient } from "./reset-password-client";
import { resolveIdpLocale } from "@/lib/i18n/idp-locale";
import { idpUiLocaleCookieAttributes } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const hdrs = await headers();
  const jar = await cookies();
  const locale = resolveIdpLocale({
    cookieLocale: jar.get(idpUiLocaleCookieAttributes().name)?.value ?? null,
    acceptLanguage: hdrs.get("accept-language"),
  });

  const raw = typeof token === "string" ? token.trim() : "";
  return <ResetPasswordClient locale={locale} token={raw || null} />;
}
