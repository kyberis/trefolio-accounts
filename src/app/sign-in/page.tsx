import Link from "next/link";

import { Brand, PageFooter } from "@/components/Brand";
import { idpSafeInternalPath } from "@/lib/idp-safe-next";
import { getProductTargets } from "@/lib/product-links";

import { signInEstablishSession } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in · trefolio accounts",
  robots: { index: false, follow: false },
};

const ERRORS: Record<string, string> = {
  invalid_credentials: "Check your email and password.",
  missing_fields: "Enter email and password.",
  email_unverified: "Verify your email first (link in your inbox), then try again.",
  oauth_only:
    "This account has no password on file. Use “Continue with Google” on this page, or sign in via trefolio and complete the IdP step here.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const next = idpSafeInternalPath(typeof sp.next === "string" ? sp.next : "/account");
  const errKey = typeof sp.error === "string" ? sp.error : "";
  const errMsg = errKey && ERRORS[errKey] ? ERRORS[errKey] : errKey ? "Could not sign in." : "";

  const trefolioBase =
    getProductTargets().find((p) => p.app === "trefolio")?.baseUrl ?? "https://trefolio.com";

  return (
    <div className="page-shell">
      <main className="page-main" style={{ flexDirection: "column", gap: 20, padding: 24 }}>
        <div className="card card-narrow">
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <Brand href="https://trefolio.com" />
          </div>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Sign in to user.trefolio.com</h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 16 }}>
            Sets the <code>idp_session</code> cookie on this hostname so pages like{" "}
            <Link href="/agents">/agents</Link> and <Link href="/account">/account</Link> work.
          </p>

          {errMsg ? (
            <div className="alert alert-error" style={{ marginBottom: 16, fontSize: 14 }} role="alert">
              {errMsg}
            </div>
          ) : null}

          <div style={{ marginBottom: 20 }}>
            <a
              className="btn-primary"
              href={`/api/auth/google/start?next=${encodeURIComponent(next)}`}
              style={{ display: "inline-block", textDecoration: "none", width: "100%", textAlign: "center", boxSizing: "border-box" }}
            >
              Continue with Google
            </a>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8, marginBottom: 0 }}>
              Recommended if you usually sign in with Google — sets <code>idp_session</code> on this hostname.
            </p>
          </div>

          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>Or use your password:</p>

          <form action={signInEstablishSession} className="form-stack">
            <input type="hidden" name="next" value={next} />
            <div>
              <label htmlFor="si-email" className="label-block">
                Email
              </label>
              <input
                id="si-email"
                name="email"
                type="email"
                autoComplete="username"
                className="input"
                required
              />
            </div>
            <div>
              <label htmlFor="si-password" className="label-block">
                Password
              </label>
              <input
                id="si-password"
                name="password"
                type="password"
                autoComplete="current-password"
                className="input"
                required
                minLength={1}
              />
            </div>
            <button type="submit" className="btn-secondary" style={{ width: "100%" }}>
              Sign in with password
            </button>
          </form>

          <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 20 }}>
            <strong>Passkey or full app login?</strong>{" "}
            <a className="btn-mini" href={`${trefolioBase}/login`} style={{ textDecoration: "none" }}>
              Open trefolio →
            </a>{" "}
            and complete the IdP screen here when prompted.
          </p>

          <p style={{ marginTop: 16, fontSize: 14 }}>
            <Link href="/" style={{ color: "var(--emerald-strong)" }}>
              ← Home
            </Link>
          </p>
        </div>
      </main>
      <PageFooter />
    </div>
  );
}
