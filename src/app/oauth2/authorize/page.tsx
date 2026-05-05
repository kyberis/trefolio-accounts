import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { AppIcon, Brand, PageFooter, appKeyFromHint } from "@/components/Brand";
import { findClient, newAuthCode } from "@/lib/oidc";
import { findUserByEmail, saveAuthCode, createUser } from "@/lib/db";
import { getPublicIssuer } from "@/lib/public-url";

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
  error?: string;
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
