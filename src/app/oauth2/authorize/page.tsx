import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { AppIcon, Brand, PageFooter, appKeyFromHint, appLabel } from "@/components/Brand";
import { SsoCountdown } from "@/components/SsoCountdown";
import { findClient, newAuthCode } from "@/lib/oidc";
import { findUserByEmail, findUserBySub, saveAuthCode, createUser } from "@/lib/db";
import { isGoogleConfigured } from "@/lib/google";
import { getPublicIssuer } from "@/lib/public-url";
import { PasskeySignInButton } from "@/components/PasskeySignInButton";
import {
  IDP_SESSION_COOKIE,
  sessionCookieAttributes,
  signSession,
  verifySession,
} from "@/lib/session";

export const dynamic = "force-dynamic";

const isProd = process.env.NODE_ENV === "production";
const SSO_REDIRECT_SECONDS = 3;

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

async function handleSubmit(formData: FormData) {
  "use server";
  const intent = String(formData.get("intent") || "login");
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const name = String(formData.get("name") || "");
  const params: SP = {
    client_id: String(formData.get("__client_id") || ""),
    redirect_uri: String(formData.get("__redirect_uri") || ""),
    state: String(formData.get("__state") || ""),
    nonce: String(formData.get("__nonce") || "") || undefined,
    code_challenge: String(formData.get("__code_challenge") || ""),
    code_challenge_method: String(formData.get("__code_challenge_method") || "S256"),
    response_type: "code",
    scope: "openid email profile",
  };

  const client = findClient(params.client_id || "");
  if (!client || !params.redirect_uri || !client.redirectUris.includes(params.redirect_uri)) {
    redirect(`/oauth2/authorize?error=invalid_client`);
  }

  let user = await findUserByEmail(email);
  if (!user) {
    if (intent !== "signup") {
      const usp = new URLSearchParams({ ...(params as any), error: "invalid_credentials" });
      redirect(`/oauth2/authorize?${usp.toString()}`);
    }
    user = await createUser({
      email,
      name: name || email.split("@")[0],
      passwordPlain: password,
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
      const usp = new URLSearchParams({ ...(params as any), error: "invalid_credentials" });
      redirect(`/oauth2/authorize?${usp.toString()}`);
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

/**
 * "Use a different account" — clears the IdP session cookie and bounces
 * back to the same authorize URL (without `prompt=login`) so the form
 * appears for the next user. We validate the return URL is a same-origin
 * `/oauth2/authorize` path to prevent open-redirect abuse.
 */
async function switchAccount(formData: FormData) {
  "use server";
  const back = String(formData.get("__back") || "");
  let safeBack = "/";
  try {
    const u = new URL(back, "http://localhost");
    if (u.pathname === "/oauth2/authorize") {
      const params = new URLSearchParams(u.search);
      params.delete("prompt");
      safeBack = `/oauth2/authorize?${params.toString()}`;
    }
  } catch {
    safeBack = "/";
  }
  const cookieStore = await cookies();
  const attrs = sessionCookieAttributes();
  cookieStore.set(attrs.name, "", {
    httpOnly: attrs.httpOnly,
    sameSite: attrs.sameSite,
    path: attrs.path,
    secure: attrs.secure,
    maxAge: 0,
  });
  redirect(safeBack);
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const client = findClient(sp.client_id || "");
  const validClient =
    client && sp.redirect_uri && client.redirectUris.includes(sp.redirect_uri);
  const appKey = appKeyFromHint(sp.app_hint || sp.client_id);
  const promptLogin = sp.prompt === "login";

  // True SSO: if the user already has a valid IdP session, mint a fresh
  // code and render a confirmation card with a 3-second countdown so the
  // user understands the unified-account redirect is happening (instead
  // of a silent jump). `prompt=login` and `error=...` skip this path.
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
        const callbackUrl = cb.toString();

        // Build the "use a different account" return URL so the form action
        // can validate + bounce back to the same authorize request.
        const sameAuthorize = new URLSearchParams();
        for (const [k, v] of Object.entries(sp)) {
          if (typeof v === "string" && v) sameAuthorize.set(k, v);
        }
        const backUrl = `/oauth2/authorize?${sameAuthorize.toString()}`;

        return (
          <div className="page-shell">
            {/* Do not render <head> here: it would nest inside <body> and browsers
                rewrite the DOM, breaking hydration. No-JS: use "Continue now" link;
                with JS: SsoCountdown + meta refresh behavior via location.replace. */}
            <main className="page-main">
              <div className="card-narrow">
                <div style={{ textAlign: "center" }}>
                  <Brand href="https://trefolio.com" />
                </div>
                <div className="heading-stack">
                  <h1>Already signed in</h1>
                  <p>Continuing with your unified trefolio account</p>
                </div>

                <div className="card">
                  <div className="continue-pill">
                    <AppIcon app={appKey} size={22} />
                    <span>
                      Continuing to <strong>{appLabel(appKey)}</strong>
                    </span>
                  </div>

                  <p
                    style={{
                      margin: "4px 0 0",
                      color: "var(--text-muted)",
                      fontSize: 14,
                      lineHeight: 1.5,
                    }}
                  >
                    Signed in as
                    <br />
                    <strong style={{ color: "var(--text)" }}>{user.email}</strong>
                  </p>

                  <SsoCountdown to={callbackUrl} seconds={SSO_REDIRECT_SECONDS} />

                  <a
                    href={callbackUrl}
                    className="btn btn-primary btn-block"
                    style={{ marginTop: 8 }}
                  >
                    Continue now
                  </a>

                  <form action={switchAccount} style={{ marginTop: 10 }}>
                    <input type="hidden" name="__back" value={backUrl} />
                    <button
                      type="submit"
                      className="btn btn-secondary btn-block"
                    >
                      Use a different account
                    </button>
                  </form>
                </div>
              </div>
            </main>

            <PageFooter />

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
    }
  }

  return (
    <div className="page-shell">
      <main className="page-main">
        <div className="card-narrow">
          <div style={{ textAlign: "center" }}>
            <Brand href="https://trefolio.com" />
          </div>
          <div className="heading-stack">
            <h1>Welcome back</h1>
            <p>Sign in to your trefolio account</p>
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
                  ? "Email or password is incorrect."
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
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    defaultValue={isProd ? "" : "password123"}
                    className="input"
                  />
                </label>

                <button type="submit" name="intent" value="login" className="btn btn-primary btn-block">
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
              </form>
            )}
          </div>

          {!isProd && validClient && (
            <p className="legal" style={{ marginTop: 14 }}>
              Dev seeds: <code>dev@trefolio.test</code> / <code>password123</code>
            </p>
          )}

          <p className="legal">
            By signing in you agree to trefolio&apos;s{" "}
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

      <PageFooter />

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
