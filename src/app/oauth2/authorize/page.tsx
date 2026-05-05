import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import {
  AppIcon,
  AuthorizeBrandHeader,
  AuthorizePageFooter,
  appKeyFromHint,
} from "@/components/Brand";
import { findClient, newAuthCode } from "@/lib/oidc";
import { findUserByEmail, findUserBySub, saveAuthCode, createUser } from "@/lib/db";
import { isGoogleConfigured } from "@/lib/google";
import { getPublicIssuer } from "@/lib/public-url";
import { PasskeySignInButton } from "@/components/PasskeySignInButton";
import { PasswordField } from "@/components/PasswordField";
import {
  IDP_SESSION_COOKIE,
  sessionCookieAttributes,
  signSession,
  verifySession,
} from "@/lib/session";

export const dynamic = "force-dynamic";

const isProd = process.env.NODE_ENV === "production";

interface SP {
  client_id?: string;
  redirect_uri?: string;
  response_type?: string;
  scope?: string;
  state?: string;
  nonce?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  app_hint?: string;
  /**
   * Non-standard IdP UI hint. When `signup`, the authorize page opens in
   * "create account" mode (also accepts `signup=1`).
   */
  screen_hint?: string;
  /** Non-standard alias for `screen_hint=signup`. */
  signup?: string;
  error?: string;
  prompt?: string;
}

/**
 * Build the URL the "Continue with Google" link points at. We forward
 * every in-flight OIDC param so the Google callback can resume the flow
 * via the `oidc_pending` cookie.
 */
function buildGoogleStartUrl(sp: SP): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && v) out.set(k, v);
  }
  return `/api/auth/google/start?${out.toString()}`;
}

function wantsSignupFirst(sp: SP): boolean {
  if ((sp.screen_hint || "").toLowerCase() === "signup") return true;
  return sp.signup === "1";
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
    user = await createUser({
      email,
      name: name || email.split("@")[0],
      passwordPlain: password,
      // No confirmation email is sent from this path yet; keep verified so
      // OIDC clients stay usable. Gate future Resend calls with
      // idpSkipsVerificationEmail() in accounts mail helpers only.
      emailVerified: true,
    });
  } else {
    let valid = false;
    if (user.password_hash) {
      valid = await bcrypt.compare(password, user.password_hash);
    } else {
      valid = user.password_plain === password;
    }
    if (!valid) {
      redirectAuthorizeError(params, "invalid_credentials");
    }
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

  // Persist the IdP session so subsequent /oauth2/authorize calls (from
  // Clara, Will, or any other client) skip the login form for this user.
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
  const client = findClient(sp.client_id || "");
  const validClient =
    client && sp.redirect_uri && client.redirectUris.includes(sp.redirect_uri);
  const appKey = appKeyFromHint(sp.app_hint || sp.client_id);
  const promptLogin = sp.prompt === "login";
  const signupFirst = wantsSignupFirst(sp);

  // True SSO: existing IdP session → mint code and HTTP-redirect to the client's
  // callback (same as password login). Client-side countdown was unreliable across
  // browsers/embeddings; server redirect always crosses user.* → trefolio-dev.com.
  // Use `prompt=login` on the authorize request to force the login form (e.g. another account).
  if (validClient && !sp.error && !promptLogin) {
    const cookieStore = await cookies();
    const sub = verifySession(cookieStore.get(IDP_SESSION_COOKIE)?.value);
    if (sub) {
      const user = await findUserBySub(sub);
      if (user) {
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
          <div style={{ textAlign: "center" }}>
            <AuthorizeBrandHeader app={appKey} />
          </div>
          <div className="heading-stack">
            <h1>{signupFirst ? "Create your account" : "Welcome back"}</h1>
            <p>
              {signupFirst
                ? "One password for trefolio, Clara, and Will."
                : "Sign in with your trefolio account"}
            </p>
          </div>

          <div className="card">
            {validClient && (
              <div className="continue-pill">
                <AppIcon app={appKey} size={22} />
                <span>
                  Continue to <strong>{client!.name}</strong>
                </span>
              </div>
            )}

            {!validClient && (
              <div className="alert alert-warning" style={{ marginBottom: 16 }}>
                This sign-in link is invalid or expired. Please open the app you came from and try
                again.
              </div>
            )}

            {sp.error && (
              <div className="alert alert-error" style={{ marginBottom: 16 }}>
                {sp.error === "invalid_credentials"
                  ? signupFirst
                    ? "This email already has an account. Enter your password to continue, or sign in with Google."
                    : "Email or password is incorrect."
                  : sp.error === "password_mismatch"
                    ? "Passwords do not match. Type the same password twice."
                    : sp.error === "password_too_short"
                      ? "Password must be at least 8 characters."
                      : sp.error === "invalid_client"
                        ? "This sign-in link is invalid."
                        : sp.error}
              </div>
            )}

            {validClient && (
              <form action={handleSubmit} className="form-stack">
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
                      href={buildGoogleStartUrl(sp)}
                      className="btn btn-google btn-block"
                    >
                      <GoogleGlyph />
                      <span>Continue with Google</span>
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
                  />
                  <div className="divider">
                    <span>or with email</span>
                  </div>
                </div>

                {signupFirst ? (
                  <>
                    <label className="field">
                      <span>Your name</span>
                      <input
                        name="name"
                        type="text"
                        autoComplete="name"
                        placeholder="How should we call you?"
                        className="input"
                      />
                    </label>
                    <label className="field">
                      <span>Email</span>
                      <input
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        placeholder="you@example.com"
                        defaultValue={isProd ? "" : "dev@trefolio.test"}
                        className="input"
                      />
                    </label>
                    <label className="field">
                      <span>Password</span>
                      <PasswordField
                        name="password"
                        autoComplete="new-password"
                        required
                        placeholder="At least 8 characters"
                        defaultValue={isProd ? "" : "password123"}
                      />
                    </label>
                    <label className="field">
                      <span>Repeat password</span>
                      <PasswordField
                        name="password_confirm"
                        autoComplete="new-password"
                        required
                        placeholder="Same as above"
                        defaultValue={isProd ? "" : "password123"}
                      />
                    </label>
                    <button
                      type="submit"
                      name="intent"
                      value="signup"
                      className="btn btn-primary btn-block"
                    >
                      Create a new account
                    </button>
                    <div className="divider">
                      <span>Already have an account?</span>
                    </div>
                    <button
                      type="submit"
                      name="intent"
                      value="login"
                      className="btn btn-secondary btn-block"
                    >
                      Sign in
                    </button>
                  </>
                ) : (
                  <>
                    <label className="field">
                      <span>Email</span>
                      <input
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        placeholder="you@example.com"
                        defaultValue={isProd ? "" : "dev@trefolio.test"}
                        className="input"
                      />
                    </label>
                    <label className="field">
                      <span>Password</span>
                      <PasswordField
                        name="password"
                        autoComplete="current-password"
                        required
                        placeholder="••••••••"
                        defaultValue={isProd ? "" : "password123"}
                      />
                    </label>
                    <button
                      type="submit"
                      name="intent"
                      value="login"
                      className="btn btn-primary btn-block"
                    >
                      Sign in
                    </button>
                    <div className="divider">
                      <span>New here?</span>
                    </div>
                    <label className="field">
                      <span>Your name</span>
                      <input
                        name="name"
                        type="text"
                        autoComplete="name"
                        placeholder="How should we call you?"
                        className="input"
                      />
                    </label>
                    <button
                      type="submit"
                      name="intent"
                      value="signup"
                      className="btn btn-secondary btn-block"
                    >
                      Create a new account
                    </button>
                  </>
                )}
              </form>
            )}
          </div>

          {!isProd && validClient && (
            <p className="legal" style={{ marginTop: 14 }}>
              Dev seeds: <code>dev@trefolio.test</code> / <code>password123</code>
            </p>
          )}

          <p className="legal">
            By continuing you agree to trefolio&apos;s{" "}
            <a href="https://trefolio.com/terms" target="_blank" rel="noopener noreferrer">
              Terms
            </a>{" "}
            and{" "}
            <a href="https://trefolio.com/privacy" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </main>

      <AuthorizePageFooter app={appKey} />

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
