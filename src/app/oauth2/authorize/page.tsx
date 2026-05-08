import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import bcrypt from "bcryptjs";
import {
  AppIcon,
  AuthorizeBrandHeader,
  AuthorizePageFooter,
  appKeyFromHint,
} from "@/components/Brand";
import { findClient, newAuthCode } from "@/lib/oidc";
import {
  createUser,
  deleteUserBySub,
  findUserByEmail,
  findUserBySub,
  recordIdpAuthAttemptFailure,
  recordIdpAuthAttemptSuccess,
  saveAuthCode,
  updateUserBySub,
} from "@/lib/db";
import { idpSkipsVerificationEmail } from "@/lib/idp-email-policy";
import { sendIdpVerificationEmail } from "@/lib/idp-verification-email";
import {
  buildOAuthResumeJson,
  createIdpEmailVerificationJwt,
} from "@/lib/idp-verification-token";
import type { SP } from "@/lib/oauth-resume";
import { isGoogleConfigured } from "@/lib/google";
import { getPublicIssuer } from "@/lib/public-url";
import { normalizeIdpLocale, resolveIdpLocale } from "@/lib/i18n/idp-locale";
import { TREFOLIO_UI_LOCALE_COOKIE } from "@/lib/i18n/ecosystem-ui-locale";
import { persistTrefolioEcosystemUiLocaleCookie } from "@/lib/i18n/persist-trefolio-ui-locale-cookie";
import { getIdpUiCopy, type IdpUiCopy } from "@/lib/i18n/idp-messages";
import { PasskeySignInButton } from "@/components/PasskeySignInButton";
import { PasswordField } from "@/components/PasswordField";
import { IdpLanguageSwitch } from "@/components/IdpLanguageSwitch";
import {
  IDP_SESSION_COOKIE,
  idpUiLocaleCookieAttributes,
  pendingResumeCookieAttributes,
  sessionCookieAttributes,
  signSession,
  verifySession,
} from "@/lib/session";
import { isBlockedEmailDomain } from "@/lib/blocked-email-domains";

export const dynamic = "force-dynamic";

const isProd = process.env.NODE_ENV === "production";

/**
 * Build the URL the "Continue with Google" link points at. We forward
 * every in-flight OIDC param so the Google callback can resume the flow
 * via the `oidc_pending` cookie.
 */
function buildGoogleStartUrl(sp: SP, uiLocale: string): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && v) out.set(k, v);
  }
  out.set("ui_locale", uiLocale);
  return `/api/auth/google/start?${out.toString()}`;
}

/** Same authorize URL with signup mode (full registration form). Stale `error` is dropped. */
function buildSignupAuthorizeUrl(sp: SP): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "error") continue;
    if (typeof v === "string" && v) out.set(k, v);
  }
  out.set("signup", "1");
  if (!out.get("response_type")) out.set("response_type", "code");
  if (!out.get("scope")) out.set("scope", "openid email profile");
  if (sp.ui_locales) out.set("ui_locales", sp.ui_locales);
  return `/oauth2/authorize?${out.toString()}`;
}

function wantsSignupFirst(sp: SP): boolean {
  if ((sp.screen_hint || "").toLowerCase() === "signup") return true;
  return sp.signup === "1";
}

function authorizeSpToPath(sp: SP): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "error") continue;
    if (typeof v === "string" && v.trim()) u.set(k, v);
  }
  const s = u.toString();
  return s ? `/oauth2/authorize?${s}` : "/oauth2/authorize";
}

function authorizeErrorMessage(t: IdpUiCopy, sp: SP, code: string): string {
  const signupFirst = wantsSignupFirst(sp);
  switch (code) {
    case "invalid_credentials":
      return signupFirst ? t.errInvalidCredentialsSignup : t.errInvalidCredentialsLogin;
    case "password_mismatch":
      return t.errPasswordMismatch;
    case "password_too_short":
      return t.errPasswordTooShort;
    case "verification_email_failed":
      return t.errVerificationEmailFailed;
    case "blocked_email_domain":
      return t.errBlockedEmailDomain;
    case "invalid_client":
      return t.errInvalidClient;
    default:
      return code;
  }
}

function GoogleGlyph() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.71H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.708A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.708V4.96H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.04l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.96L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

function readOidcParamsFromForm(formData: FormData): SP {
  const loc = normalizeIdpLocale(String(formData.get("__locale") || ""));
  return {
    client_id: String(formData.get("__client_id") || ""),
    redirect_uri: String(formData.get("__redirect_uri") || ""),
    state: String(formData.get("__state") || ""),
    nonce: String(formData.get("__nonce") || "") || undefined,
    code_challenge: String(formData.get("__code_challenge") || ""),
    code_challenge_method: String(formData.get("__code_challenge_method") || "S256"),
    response_type: "code",
    scope: "openid email profile",
    app_hint: String(formData.get("__app_hint") || "") || undefined,
    screen_hint: String(formData.get("__screen_hint") || "") || undefined,
    signup: String(formData.get("__signup") || "") || undefined,
    prompt: String(formData.get("__prompt") || "") || undefined,
    ui_locales: loc,
  };
}

function redirectAuthorizeError(sp: SP, error: string) {
  const usp = new URLSearchParams();
  if (sp.client_id) usp.set("client_id", sp.client_id);
  if (sp.redirect_uri) usp.set("redirect_uri", sp.redirect_uri);
  if (sp.state) usp.set("state", sp.state);
  if (sp.nonce) usp.set("nonce", sp.nonce);
  if (sp.code_challenge) usp.set("code_challenge", sp.code_challenge);
  if (sp.code_challenge_method) usp.set("code_challenge_method", sp.code_challenge_method);
  usp.set("response_type", "code");
  usp.set("scope", sp.scope || "openid email profile");
  if (sp.app_hint) usp.set("app_hint", sp.app_hint);
  if (sp.screen_hint) usp.set("screen_hint", sp.screen_hint);
  if (sp.signup) usp.set("signup", sp.signup);
  if (sp.prompt) usp.set("prompt", sp.prompt);
  if (sp.ui_locales) usp.set("ui_locales", sp.ui_locales);
  usp.set("error", error);
  redirect(`/oauth2/authorize?${usp.toString()}`);
}

async function handleSubmit(formData: FormData) {
  "use server";
  const intent = String(formData.get("intent") || "login");
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const passwordConfirm = String(formData.get("password_confirm") || "");
  const name = String(formData.get("name") || "");
  const params = readOidcParamsFromForm(formData);
  const formLocale = normalizeIdpLocale(params.ui_locales);
  const cookieStoreLocale = await cookies();
  const uiA = idpUiLocaleCookieAttributes();
  cookieStoreLocale.set(uiA.name, formLocale, {
    httpOnly: uiA.httpOnly,
    sameSite: uiA.sameSite,
    path: uiA.path,
    maxAge: uiA.maxAge,
    secure: uiA.secure,
  });
  await persistTrefolioEcosystemUiLocaleCookie(formLocale);

  const skipVerify = idpSkipsVerificationEmail();
  const resumeJson = buildOAuthResumeJson(params);

  const client = findClient(params.client_id || "");
  if (!client || !params.redirect_uri || !client.redirectUris.includes(params.redirect_uri)) {
    redirect(`/oauth2/authorize?error=invalid_client`);
  }

  if (intent === "signup") {
    if (password.length < 8) {
      redirectAuthorizeError(params, "password_too_short");
    }
    if (password !== passwordConfirm) {
      redirectAuthorizeError(params, "password_mismatch");
    }
  }

  let user = await findUserByEmail(email);

  if (!user) {
    if (intent !== "signup") {
      redirectAuthorizeError(params, "invalid_credentials");
    }
    if (isBlockedEmailDomain(email)) {
      redirectAuthorizeError(params, "blocked_email_domain");
    }
    if (!skipVerify) {
      const created = await createUser({
        email,
        name: name || email.split("@")[0],
        passwordPlain: password,
        emailVerified: false,
        locale: formLocale,
      });
      const token = await createIdpEmailVerificationJwt({
        sub: created.sub,
        email: created.email,
        resumeJson,
      });
      const sent = await sendIdpVerificationEmail(created.email, token, formLocale);
      if (!sent.success) {
        await deleteUserBySub(created.sub);
        redirectAuthorizeError(params, "verification_email_failed");
      }
      const jar = await cookies();
      const pr = pendingResumeCookieAttributes();
      jar.set(pr.name, resumeJson, {
        httpOnly: pr.httpOnly,
        sameSite: pr.sameSite,
        path: pr.path,
        maxAge: pr.maxAge,
        secure: pr.secure,
      });
      redirect(`/account/check-email?e=${encodeURIComponent(email)}`);
    }
    user = await createUser({
      email,
      name: name || email.split("@")[0],
      passwordPlain: password,
      emailVerified: true,
      locale: formLocale,
    });
  } else {
    let valid = false;
    if (user.password_hash) {
      valid = await bcrypt.compare(password, user.password_hash);
    } else {
      valid = user.password_plain === password;
    }
    if (!valid) {
      void recordIdpAuthAttemptFailure(user.sub).catch(() => {});
      redirectAuthorizeError(params, "invalid_credentials");
    }
    void recordIdpAuthAttemptSuccess(user.sub).catch(() => {});
  }

  if (!skipVerify && user.email_verified !== 1) {
    await updateUserBySub(user.sub, { locale: formLocale });
    const token = await createIdpEmailVerificationJwt({
      sub: user.sub,
      email: user.email,
      resumeJson,
    });
    const sent = await sendIdpVerificationEmail(user.email, token, formLocale);
    if (!sent.success) {
      redirectAuthorizeError(params, "verification_email_failed");
    }
    const jar = await cookies();
    const pr = pendingResumeCookieAttributes();
    jar.set(pr.name, resumeJson, {
      httpOnly: pr.httpOnly,
      sameSite: pr.sameSite,
      path: pr.path,
      maxAge: pr.maxAge,
      secure: pr.secure,
    });
    redirect(`/account/check-email?e=${encodeURIComponent(email)}`);
  }

  const code = newAuthCode();
  await saveAuthCode({
    code,
    sub: user.sub,
    clientId: client!.clientId,
    redirectUri: params.redirect_uri!,
    codeChallenge: params.code_challenge || "",
    codeChallengeMethod: params.code_challenge_method || "S256",
    nonce: params.nonce,
  });

  const cookieStore = await cookies();
  const attrs = sessionCookieAttributes();
  cookieStore.set(attrs.name, signSession(user.sub), {
    httpOnly: attrs.httpOnly,
    sameSite: attrs.sameSite,
    path: attrs.path,
    maxAge: attrs.maxAge,
    secure: attrs.secure,
  });

  const cb = new URL(params.redirect_uri!);
  cb.searchParams.set("code", code);
  if (params.state) cb.searchParams.set("state", params.state);
  redirect(cb.toString());
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const hdrs = await headers();
  const jar = await cookies();
  const locale = resolveIdpLocale({
    uiLocalesParam: sp.ui_locales,
    cookieLocale:
      jar.get(idpUiLocaleCookieAttributes().name)?.value ??
      jar.get(TREFOLIO_UI_LOCALE_COOKIE)?.value ??
      null,
    acceptLanguage: hdrs.get("accept-language"),
  });
  const t = getIdpUiCopy(locale);
  const nextPath = authorizeSpToPath(sp);
  const client = findClient(sp.client_id || "");
  const validClient =
    client && sp.redirect_uri && client.redirectUris.includes(sp.redirect_uri);
  const appKey = appKeyFromHint(sp.app_hint || sp.client_id);
  const promptLogin = sp.prompt === "login";
  const signupFirst = wantsSignupFirst(sp);
  const signupAuthorizeHref = validClient ? buildSignupAuthorizeUrl(sp) : "";

  // True SSO: existing IdP session → mint code and HTTP-redirect to the client's
  // callback (same as password login). Client-side countdown was unreliable across
  // browsers/embeddings; server redirect always crosses user.* → trefolio-dev.com.
  // Use `prompt=login` on the authorize request to force the login form (e.g. another account).
  if (validClient && !sp.error && !promptLogin) {
    const cookieStore = await cookies();
    const sub = verifySession(cookieStore.get(IDP_SESSION_COOKIE)?.value);
    if (sub) {
      const user = await findUserBySub(sub);
      if (user && user.email_verified === 1) {
        const code = newAuthCode();
        await saveAuthCode({
          code,
          sub: user.sub,
          clientId: client!.clientId,
          redirectUri: sp.redirect_uri!,
          codeChallenge: sp.code_challenge || "",
          codeChallengeMethod: sp.code_challenge_method || "S256",
          nonce: sp.nonce,
        });
        const cb = new URL(sp.redirect_uri!);
        cb.searchParams.set("code", code);
        if (sp.state) cb.searchParams.set("state", sp.state);
        redirect(cb.toString());
      }
    }
  }

  return (
    <div className="page-shell" data-authorize-app={appKey}>
      <main className="page-main">
        <div className="card-narrow">
          <IdpLanguageSwitch nextPath={nextPath} current={locale} label={t.languageLabel} />
          <div style={{ textAlign: "center" }}>
            <AuthorizeBrandHeader app={appKey} />
          </div>
          <div className="heading-stack">
            <h1>{signupFirst ? t.headingSignup : t.headingLogin}</h1>
            <p>{signupFirst ? t.subtitleSignup : t.subtitleLogin}</p>
          </div>

          <div className="card">
            {validClient && (
              <div className="continue-pill">
                <AppIcon app={appKey} size={22} />
                <span>
                  {t.continueToPrefix} <strong>{client!.name}</strong>
                </span>
              </div>
            )}

            {!validClient && (
              <div className="alert alert-warning" style={{ marginBottom: 16 }}>
                {t.invalidClientBanner}
              </div>
            )}

            {sp.error && (
              <div className="alert alert-error" style={{ marginBottom: 16 }}>
                {authorizeErrorMessage(t, sp, sp.error)}
              </div>
            )}

            {validClient && (
              <form action={handleSubmit} className="form-stack">
                <input type="hidden" name="__locale" value={locale} />
                <input type="hidden" name="__client_id" value={sp.client_id || ""} />
                <input type="hidden" name="__redirect_uri" value={sp.redirect_uri || ""} />
                <input type="hidden" name="__state" value={sp.state || ""} />
                <input type="hidden" name="__nonce" value={sp.nonce || ""} />
                <input type="hidden" name="__code_challenge" value={sp.code_challenge || ""} />
                <input
                  type="hidden"
                  name="__code_challenge_method"
                  value={sp.code_challenge_method || "S256"}
                />
                <input type="hidden" name="__app_hint" value={sp.app_hint || ""} />
                <input type="hidden" name="__screen_hint" value={sp.screen_hint || ""} />
                <input type="hidden" name="__signup" value={sp.signup || ""} />
                <input type="hidden" name="__prompt" value={sp.prompt || ""} />

                <div className="form-stack" style={{ gap: 8, marginBottom: 4 }}>
                  {isGoogleConfigured() && (
                    <a
                      href={buildGoogleStartUrl(sp, locale)}
                      className="btn btn-google btn-block"
                    >
                      <GoogleGlyph />
                      <span>{t.googleCta}</span>
                    </a>
                  )}
                  <PasskeySignInButton
                    clientId={sp.client_id || ""}
                    redirectUri={sp.redirect_uri || ""}
                    state={sp.state || ""}
                    nonce={sp.nonce || ""}
                    codeChallenge={sp.code_challenge || ""}
                    codeChallengeMethod={sp.code_challenge_method || "S256"}
                    appHint={sp.app_hint || ""}
                    passkeyLabel={t.passkeySignIn}
                    passkeyWaitingLabel={t.passkeyWaiting}
                  />
                  <div className="divider">
                    <span>{t.dividerEmail}</span>
                  </div>
                </div>

                {signupFirst ? (
                  <>
                    <label className="field">
                      <span>{t.nameLabel}</span>
                      <input
                        name="name"
                        type="text"
                        autoComplete="name"
                        placeholder={t.namePlaceholder}
                        className="input"
                      />
                    </label>
                    <label className="field">
                      <span>{t.emailLabel}</span>
                      <input
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        placeholder={t.emailPlaceholder}
                        defaultValue={isProd ? "" : "dev@trefolio.test"}
                        className="input"
                      />
                    </label>
                    <label className="field">
                      <span>{t.passwordLabel}</span>
                      <PasswordField
                        name="password"
                        autoComplete="new-password"
                        required
                        placeholder={t.passwordPlaceholderNew}
                        defaultValue={isProd ? "" : "password123"}
                      />
                    </label>
                    <label className="field">
                      <span>{t.passwordRepeat}</span>
                      <PasswordField
                        name="password_confirm"
                        autoComplete="new-password"
                        required
                        placeholder={t.passwordRepeatPlaceholder}
                        defaultValue={isProd ? "" : "password123"}
                      />
                    </label>
                    <button
                      type="submit"
                      name="intent"
                      value="signup"
                      className="btn btn-primary btn-block"
                    >
                      {t.createAccount}
                    </button>
                    <div className="divider">
                      <span>{t.alreadyHaveAccount}</span>
                    </div>
                    <button
                      type="submit"
                      name="intent"
                      value="login"
                      className="btn btn-secondary btn-block"
                    >
                      {t.signIn}
                    </button>
                  </>
                ) : (
                  <>
                    <label className="field">
                      <span>{t.emailLabel}</span>
                      <input
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        placeholder={t.emailPlaceholder}
                        defaultValue={isProd ? "" : "dev@trefolio.test"}
                        className="input"
                      />
                    </label>
                    <label className="field">
                      <span>{t.passwordLabel}</span>
                      <PasswordField
                        name="password"
                        autoComplete="current-password"
                        required
                        placeholder={t.passwordPlaceholderLogin}
                        defaultValue={isProd ? "" : "password123"}
                      />
                    </label>
                    <p style={{ textAlign: "right", margin: "-4px 0 4px" }}>
                      <a href="/account/forgot-password" className="divider-link">
                        {t.forgotPasswordLink}
                      </a>
                    </p>
                    <button
                      type="submit"
                      name="intent"
                      value="login"
                      className="btn btn-primary btn-block"
                    >
                      {t.signInButton}
                    </button>
                    <div className="divider">
                      <a href={signupAuthorizeHref} className="divider-link">
                        {t.newHere}
                      </a>
                    </div>
                    <a
                      href={signupAuthorizeHref}
                      className="btn btn-secondary btn-block"
                    >
                      {t.createNewAccount}
                    </a>
                  </>
                )}
              </form>
            )}
          </div>

          {!isProd && validClient && (
            <p className="legal" style={{ marginTop: 14 }}>
              {t.devSeeds} <code>dev@trefolio.test</code> / <code>password123</code>
            </p>
          )}

          <p className="legal">
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

      {!isProd && (
        <p
          style={{
            textAlign: "center",
            color: "var(--text-faint)",
            fontSize: 11,
            margin: "0 0 12px",
          }}
        >
          identity service: <code>{getPublicIssuer()}</code>
        </p>
      )}
    </div>
  );
}
