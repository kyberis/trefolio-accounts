import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AuthorizePageFooter,
  AuthorizeBrandHeader,
  appKeyFromHint,
} from "@/components/Brand";
import { CheckEmailActions } from "@/components/CheckEmailActions";
import { idpUiLocaleCookieAttributes } from "@/lib/session";
import { resolveIdpLocale } from "@/lib/i18n/idp-locale";
import { getIdpUiCopy } from "@/lib/i18n/idp-messages";
import { IdpLanguageSwitch } from "@/components/IdpLanguageSwitch";

export const dynamic = "force-dynamic";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const { e } = await searchParams;
  const email = typeof e === "string" ? decodeURIComponent(e).trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    redirect("/");
  }

  const hdrs = await headers();
  const jar = await cookies();
  const locale = resolveIdpLocale({
    cookieLocale: jar.get(idpUiLocaleCookieAttributes().name)?.value ?? null,
    acceptLanguage: hdrs.get("accept-language"),
  });
  const t = getIdpUiCopy(locale);
  const nextPath = "/account/check-email?" + new URLSearchParams({ e: email }).toString();

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
            <h1>{t.checkEmailTitle}</h1>
            <p>{t.checkEmailSubtitle}</p>
          </div>
          <div className="card">
            <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--text-muted)" }}>
              {t.checkEmailBody1}{" "}
              <strong style={{ color: "var(--text)" }}>{email}</strong> {t.checkEmailBody2}{" "}
              <strong>{t.checkEmailVerifyWord}</strong>. {t.checkEmailBody3}{" "}
              <strong>{t.checkEmailHost}</strong> {t.checkEmailBody4}
            </p>
            <CheckEmailActions
              email={email}
              labels={{
                resendSent: t.resendSent,
                resendError: t.resendError,
                resendSending: t.resendSending,
                resendCooldownPrefix: t.resendCooldownPrefix,
                resendCooldownSuffix: t.resendCooldownSuffix,
                resendButton: t.resendButton,
              }}
            />
          </div>
          <p className="legal">
            {t.wrongInbox}{" "}
            <Link href="/oauth2/authorize">{t.startOver}</Link>
          </p>
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
