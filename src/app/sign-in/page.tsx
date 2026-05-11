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
    "This account has no password on file. Use “Sign in via trefolio” below (Google / passkey) so you complete login on this site.",
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
            <button type="submit" className="btn-primary">
              Sign in
            </button>
          </form>

          <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 20 }}>
            <strong>Google or passkey only?</strong>{" "}
            <a className="btn-mini" href={`${trefolioBase}/login`} style={{ textDecoration: "none" }}>
              Sign in via trefolio →
            </a>{" "}
            and complete the IdP screen here — that also sets <code>idp_session</code>.
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
