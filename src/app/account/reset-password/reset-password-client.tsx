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

const RESET_BASE = "/account/reset-password";

function resetPathWithToken(token: string): string {
  return `${RESET_BASE}?token=${encodeURIComponent(token)}`;
}

export function ResetPasswordClient({
  locale,
  token,
}: {
  locale: IdpLocale;
  token: string | null;
}) {
  const t = getIdpUiCopy(locale);
  const appKey = appKeyFromHint(undefined);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedToken = token?.trim() ?? "";
  const missing = !trimmedToken;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (missing) return;
    setError(null);
    if (password !== passwordConfirm) {
      setError(t.errPasswordMismatch);
      return;
    }
    if (password.length < 8) {
      setError(t.errPasswordTooShort);
      return;
    }
    if (password.length > 72) {
      setError(t.errPasswordTooLong);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: trimmedToken, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        if (data.error === "password_too_short") {
          setError(t.errPasswordTooShort);
        } else if (data.error === "password_too_long") {
          setError(t.errPasswordTooLong);
        } else if (data.error === "invalid_token") {
          setError(t.resetPasswordMissingToken);
        } else {
          setError(t.resetPasswordNetworkError);
        }
        setLoading(false);
        return;
      }
      setDone(true);
    } catch {
      setError(t.resetPasswordNetworkError);
    } finally {
      setLoading(false);
    }
  }

  const langNext = trimmedToken ? resetPathWithToken(trimmedToken) : RESET_BASE;

  return (
    <div className="page-shell" data-authorize-app={appKey}>
      <main className="page-main">
        <div className="card-narrow">
          <IdpLanguageSwitch nextPath={langNext} current={locale} label={t.languageLabel} />
          <div style={{ textAlign: "center" }}>
            <AuthorizeBrandHeader app={appKey} />
          </div>
          <div className="heading-stack">
            <h1>{done ? t.resetPasswordSuccessTitle : t.resetPasswordTitle}</h1>
            <p>{done ? t.resetPasswordSuccessBody : t.resetPasswordSubtitle}</p>
          </div>
          {missing ? (
            <div className="alert alert-error" role="alert">
              {t.resetPasswordMissingToken}
            </div>
          ) : done ? (
            <div className="form-stack">
              <Link href="/oauth2/authorize" className="btn btn-primary btn-block">
                {t.resetPasswordBackToSignIn}
              </Link>
            </div>
          ) : (
            <form className="form-stack" onSubmit={onSubmit}>
              <label className="field">
                <span>{t.passwordLabel}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={72}
                  placeholder={t.passwordPlaceholderNew}
                  className="input"
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                />
              </label>
              <label className="field">
                <span>{t.passwordRepeat}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={72}
                  placeholder={t.passwordRepeatPlaceholder}
                  className="input"
                  value={passwordConfirm}
                  onChange={(ev) => setPasswordConfirm(ev.target.value)}
                />
              </label>
              {error ? (
                <div className="alert alert-error" role="alert">
                  {error}
                </div>
              ) : null}
              <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                {loading ? t.resetPasswordSubmitting : t.resetPasswordSubmit}
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
