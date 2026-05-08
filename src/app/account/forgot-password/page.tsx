import { cookies, headers } from "next/headers";

import { ForgotPasswordClient } from "./forgot-password-client";
import { resolveIdpLocale } from "@/lib/i18n/idp-locale";
import { idpUiLocaleCookieAttributes } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const hdrs = await headers();
  const jar = await cookies();
  const locale = resolveIdpLocale({
    cookieLocale: jar.get(idpUiLocaleCookieAttributes().name)?.value ?? null,
    acceptLanguage: hdrs.get("accept-language"),
  });

  return <ForgotPasswordClient locale={locale} />;
}
