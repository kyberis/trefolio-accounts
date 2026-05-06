import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AuthorizeBrandHeader,
  AuthorizePageFooter,
  appKeyFromHint,
} from "@/components/Brand";
import { EmailConfirmedCountdown } from "@/components/EmailConfirmedCountdown";
import { IdpLanguageSwitch } from "@/components/IdpLanguageSwitch";
import { resolveIdpLocale } from "@/lib/i18n/idp-locale";
import { getIdpUiCopy } from "@/lib/i18n/idp-messages";
import { idpUiLocaleCookieAttributes } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function EmailConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" ? next.trim() : "";
  if (!nextPath.startsWith("/oauth2/authorize?")) {
    redirect("/");
  }

  const hdrs = await headers();
  const jar = await cookies();
  const locale = resolveIdpLocale({
    cookieLocale: jar.get(idpUiLocaleCookieAttributes().name)?.value ?? null,
    acceptLanguage: hdrs.get("accept-language"),
  });
  const t = getIdpUiCopy(locale);

  const appKey = appKeyFromHint(undefined);

  return (
    <div className="page-shell" data-authorize-app={appKey}>
      <main className="page-main">
        <div className="card-narrow">
          <IdpLanguageSwitch nextPath={nextPath} current={locale} label={t.languageLabel} />
          <div style={{ textAlign: "center" }}>
            <AuthorizeBrandHeader app={appKey} />
          </div>
          <div className="heading-stack">
            <h1>{t.emailConfirmedTitle}</h1>
            <p>{t.emailConfirmedSubtitle}</p>
          </div>
          <div className="card" style={{ textAlign: "center" }}>
            <p style={{ margin: "0 0 8px", fontSize: 44, lineHeight: 1 }} aria-hidden="true">
              ✓
            </p>
            <EmailConfirmedCountdown
              nextPath={nextPath}
              seconds={5}
              countdownBefore={t.emailConfirmedCountdownBefore}
              countdownAfter={t.emailConfirmedCountdownAfter}
            />
          </div>
        </div>
      </main>
      <AuthorizePageFooter
        app={appKey}
        privacyLabel={t.footerPrivacy}
        termsLabel={t.footerTerms}
        contactLabel={t.footerContact}
      />
    </div>
  );
}
