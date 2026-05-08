"use client";

import Link from "next/link";
import { useState } from "react";

import {
  AuthorizeBrandHeader,
  AuthorizePageFooter,
  appKeyFromHint,
} from "@/components/Brand";
import { IdpLanguageSwitch } from "@/components/IdpLanguageSwitch";
import type { IdpLocale } from "@/lib/i18n/idp-locale";
import { getIdpUiCopy } from "@/lib/i18n/idp-messages";

const FORGOT_PATH = "/account/forgot-password";

type Outcome = "idle" | "sent_inbox" | "sent_suppressed";

export function ForgotPasswordClient({ locale }: { locale: IdpLocale }) {
  const t = getIdpUiCopy(locale);
  const appKey = appKeyFromHint(undefined);
  const [email, setEmail] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        mail_suppressed?: boolean;
      };
      if (res.status === 400 && data.error === "invalid_email") {
        setError(t.forgotPasswordInvalidEmail);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        if (data.error === "email_send_failed") {
          setError(`${t.forgotPasswordSendFailed}${data.message ? `\n\n(${data.message})` : ""}`);
        } else {
          setError(t.forgotPasswordNetworkError);
        }
        setLoading(false);
        return;
      }
      if (data.mail_suppressed) {
        setOutcome("sent_suppressed");
      } else {
        setOutcome("sent_inbox");
      }
    } catch {
      setError(t.forgotPasswordNetworkError);
    } finally {
      setLoading(false);
    }
  }

  const heading =
    outcome === "sent_suppressed"
      ? t.forgotPasswordMailSuppressedTitle
      : outcome === "sent_inbox"
        ? t.forgotPasswordSentTitle
        : t.forgotPasswordTitle;

  const subtext =
    outcome === "sent_suppressed"
      ? t.forgotPasswordMailSuppressedBody
      : outcome === "sent_inbox"
        ? t.forgotPasswordSentBody
        : t.forgotPasswordSubtitle;

  return (
    <div className="page-shell" data-authorize-app={appKey}>
      <main className="page-main">
        <div className="card-narrow">
          <IdpLanguageSwitch nextPath={FORGOT_PATH} current={locale} label={t.languageLabel} />
          <div style={{ textAlign: "center" }}>
            <AuthorizeBrandHeader app={appKey} />
          </div>
          <div className="heading-stack">
            <h1>{heading}</h1>
            <p style={outcome !== "idle" ? { whiteSpace: "pre-wrap" } : undefined}>{subtext}</p>
          </div>
          {outcome !== "idle" ? (
            <div className="form-stack">
              <Link href="/oauth2/authorize" className="btn btn-primary btn-block">
                {t.forgotPasswordBackToSignIn}
              </Link>
            </div>
          ) : (
            <form className="form-stack" onSubmit={onSubmit}>
              <label className="field">
                <span>{t.emailLabel}</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder={t.emailPlaceholder}
                  className="input"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                />
              </label>
              {error ? (
                <div className="alert alert-error" role="alert" style={{ whiteSpace: "pre-wrap" }}>
                  {error}
                </div>
              ) : null}
              <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                {loading ? t.forgotPasswordSending : t.forgotPasswordSubmit}
              </button>
              <Link href="/oauth2/authorize" className="btn btn-secondary btn-block">
                {t.forgotPasswordBackToSignIn}
              </Link>
            </form>
          )}
          <p className="legal" style={{ marginTop: 20 }}>
            {t.legalIntro}{" "}
            <a href="https://trefolio.com/terms" target="_blank" rel="noopener noreferrer">
              {t.legalTerms}
            </a>{" "}
            {t.legalAnd}{" "}
            <a href="https://trefolio.com/privacy" target="_blank" rel="noopener noreferrer">
              {t.legalPrivacy}
            </a>
            .
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
