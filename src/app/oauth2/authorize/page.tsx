import { redirect } from "next/navigation";
import { findClient, newAuthCode } from "@/lib/oidc";
import { findUserByEmail, saveAuthCode, createUser } from "@/lib/db";

export const dynamic = "force-dynamic";

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

  let user = findUserByEmail(email);
  if (!user) {
    if (intent !== "signup") {
      const usp = new URLSearchParams({ ...(params as any), error: "invalid_credentials" });
      redirect(`/oauth2/authorize?${usp.toString()}`);
    }
    user = { ...createUser({ email, name: name || email.split("@")[0], password }), password_plain: password };
  } else if (user.password_plain !== password) {
    const usp = new URLSearchParams({ ...(params as any), error: "invalid_credentials" });
    redirect(`/oauth2/authorize?${usp.toString()}`);
  }

  const code = newAuthCode();
  saveAuthCode({
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
  const appHint = (sp.app_hint || sp.client_id || "").toLowerCase();
  const appClass =
    appHint === "clara"
      ? "tool-card-cyan"
      : appHint === "will"
        ? "tool-card-violet"
        : "tool-card-emerald";

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="hero-topline">user.trefolio.com</div>
        <h1>Sign in to your unified trefolio account</h1>
        <p className="muted">
          {validClient ? "Continue securely to:" : "Invalid OAuth client."}
        </p>
        {validClient && (
          <div className={`app-pill ${appClass}`}>
            <span>{client!.name}</span>
          </div>
        )}
        <p className="seed-hint">
          Dev users: <code>dev@trefolio.test</code> / <code>password123</code> (Pro) and{" "}
          <code>free@trefolio.test</code> / <code>password123</code> (Free)
        </p>
      </section>

      {sp.error && (
        <div className="error-banner">
          {sp.error === "invalid_credentials" ? "Email or password is incorrect." : sp.error}
        </div>
      )}

      {validClient && (
        <form action={handleSubmit} className="auth-form">
          <input type="hidden" name="__client_id" value={sp.client_id || ""} />
          <input type="hidden" name="__redirect_uri" value={sp.redirect_uri || ""} />
          <input type="hidden" name="__state" value={sp.state || ""} />
          <input type="hidden" name="__nonce" value={sp.nonce || ""} />
          <input type="hidden" name="__code_challenge" value={sp.code_challenge || ""} />
          <input type="hidden" name="__code_challenge_method" value={sp.code_challenge_method || "S256"} />

          <label className="field">
            <span>Email</span>
            <input
              name="email"
              type="email"
              required
              defaultValue="dev@trefolio.test"
              className="input"
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              required
              defaultValue="password123"
              className="input"
            />
          </label>
          <label className="field field-last">
            <span>Name (signup only)</span>
            <input
              name="name"
              type="text"
              className="input"
            />
          </label>

          <div className="actions">
            <button type="submit" name="intent" value="login" className="primary-btn">
              Sign in
            </button>
            <button type="submit" name="intent" value="signup" className="secondary-btn">
              Create account
            </button>
          </div>
        </form>
      )}

      <p className="auth-footer">
        You are on <strong>user.trefolio.com</strong> ({process.env.NEXT_PUBLIC_APP_URL || "localhost:3300"}).
        This is the shared identity service for trefolio, Clara, and Will.
      </p>
    </main>
  );
}
