import Link from "next/link";
import { cookies, headers } from "next/headers";

import { Brand, PageFooter, AppIcon } from "@/components/Brand";
import OpsTelegramConnectPanel from "@/components/OpsTelegramConnectPanel";
import { getIdpOperatorUiContext, hasAdminConfigured } from "@/lib/admin";
import { hasOpsTelegramLinkForSub } from "@/lib/db";
import { getProductTargets } from "@/lib/product-links";
import { getPublicIssuer } from "@/lib/public-url";
import { IDP_SESSION_COOKIE, verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Agents · trefolio accounts",
  robots: { index: false, follow: false },
};

/**
 * Operators only (`IDP_ADMIN_EMAILS`), including while impersonating (real operator
 * from `idp_impersonator`). Needs `idp_session` on this exact host (see middleware).
 */
export default async function AgentsPage() {
  if (!hasAdminConfigured()) {
    return (
      <div className="page-shell">
        <main className="page-main" style={{ flexDirection: "column", gap: 16, padding: 24 }}>
          <div className="card card-narrow">
            <h1 style={{ fontSize: 20, marginBottom: 8 }}>Admin not configured</h1>
            <p style={{ fontSize: 14, color: "var(--text-muted)" }}>
              Set <code>IDP_ADMIN_EMAILS</code> on this service, deploy, then return here.
            </p>
            <Link href="/admin/users" className="btn-mini" style={{ textDecoration: "none", marginTop: 12, display: "inline-block" }}>
              Admin setup →
            </Link>
          </div>
        </main>
        <PageFooter />
      </div>
    );
  }

  const op = await getIdpOperatorUiContext();
  if (!op) {
    const jar = await cookies();
    const hdrs = await headers();
    const host =
      hdrs.get("x-forwarded-host")?.split(",")[0]?.trim() || hdrs.get("host") || "";
    let canonicalHost = "";
    try {
      canonicalHost = new URL(getPublicIssuer()).host;
    } catch {
      canonicalHost = "";
    }
    const rawSession = jar.get(IDP_SESSION_COOKIE)?.value;
    const sub = verifySession(rawSession);
    const sessionRejected = Boolean(rawSession && !sub);
    if (sub) {
      return (
        <div className="page-shell">
          <main className="page-main" style={{ flexDirection: "column", gap: 16, padding: 24 }}>
            <div className="card card-narrow">
              <h1 style={{ fontSize: 20, marginBottom: 8 }}>Access denied</h1>
              <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 16 }}>
                <code>/agents</code> is only for IdP operators listed in{" "}
                <code>IDP_ADMIN_EMAILS</code>. If you need the ops Telegram bot and you are platform staff, use{" "}
                <Link href="/account#telegram-agents" style={{ color: "var(--emerald-strong)" }}>
                  Account → Telegram agents
                </Link>
                .
              </p>
              <Link href="/admin/users" className="btn-mini" style={{ textDecoration: "none" }}>
                ← Back to admin
              </Link>
            </div>
          </main>
          <PageFooter />
        </div>
      );
    }

    const trefolioBase =
      getProductTargets().find((p) => p.app === "trefolio")?.baseUrl ?? "https://trefolio.com";
    const trefolioSignIn = `${trefolioBase}/login`;
    const googleOnThisHost = `/api/auth/google/start?next=${encodeURIComponent("/agents")}`;

    return (
      <div className="page-shell">
        <header className="admin-topbar">
          <Link href="/admin/users" className="admin-brand">
            <AppIcon app="trefolio" size={28} />
            <span className="brand-name">trefolio</span>
            <span className="admin-tag">admin</span>
          </Link>
          <nav className="admin-nav">
            <Link href="/admin/users">Users</Link>
            <Link href="/agents">Agents</Link>
            <Link href="/account/passkeys">Passkeys</Link>
          </nav>
        </header>
        <main className="admin-main">
          <div className="card card-wide">
            <h1 style={{ fontSize: 22, marginBottom: 10 }}>Sign in to continue</h1>
            {sessionRejected ? (
              <div className="alert alert-error" style={{ marginBottom: 16, fontSize: 14 }}>
                Your browser sent an <code>idp_session</code> cookie, but this server could not verify it.
                This usually happens after <strong>IDP_SESSION_SECRET</strong> was rotated, or the cookie was
                copied from another environment. Clear site data for{" "}
                <strong>{host || "this host"}</strong> and sign in again (Google on this host, password at{" "}
                <Link href="/sign-in?next=/agents" style={{ color: "var(--emerald-strong)" }}>
                  /sign-in
                </Link>
                , or via trefolio).
              </div>
            ) : null}
            {canonicalHost && host && host !== canonicalHost ? (
              <div className="alert alert-warning" style={{ marginBottom: 16, fontSize: 14 }}>
                You are on <code>{host}</code> but this deployment&apos;s issuer is <code>{canonicalHost}</code>.
                Session cookies are not shared between hostnames — use the same URL you used when you approved
                login (avoid mixing <code>www.</code> and apex).
              </div>
            ) : null}
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 16 }}>
              <strong>/agents</strong> needs a valid <code>idp_session</code> cookie on <strong>this host</strong>.
              If you normally use <strong>Google</strong>, use the button below so Google runs here — that always sets
              the cookie. Trefolio login also works if you complete the IdP screen on this host.
            </p>
            <ol style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 20 }}>
              <li>
                <strong>Google account?</strong>{" "}
                <a href={googleOnThisHost} style={{ color: "var(--emerald-strong)" }}>
                  Sign in with Google on this host
                </a>{" "}
                (same flow as account hub; returns you to <code>/agents</code> with <code>idp_session</code>).
              </li>
              <li>
                <strong>Password on file?</strong>{" "}
                <Link href="/sign-in?next=/agents" style={{ color: "var(--emerald-strong)" }}>
                  Email + password on this host
                </Link>
                .
              </li>
              <li>
                Or open <Link href={trefolioSignIn}>{trefolioSignIn}</Link> (or Clara / Will) and finish the IdP approve
                step here.
              </li>
              <li>Reload this page when done.</li>
            </ol>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
              Still no <code>idp_session</code> under Application → Cookies? In Network, open the{" "}
              <code>/api/auth/google/callback</code> (or passkey <code>login-verify</code>) response and confirm{" "}
              <strong>Set-Cookie</strong> for <code>idp_session</code>. If the header is absent, strict privacy
              tools or a misconfigured proxy may be stripping cookies — try another browser profile or disable
              blocking for this site.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <a
                className="btn-primary"
                href={googleOnThisHost}
                style={{ display: "inline-block", textDecoration: "none" }}
              >
                Continue with Google (this host)
              </a>
              <Link
                href="/sign-in?next=/agents"
                className="btn-secondary"
                style={{ display: "inline-block", textDecoration: "none" }}
              >
                Sign in with password
              </Link>
              <a className="btn-secondary" href={trefolioSignIn} style={{ display: "inline-block", textDecoration: "none" }}>
                Sign in via trefolio
              </a>
            </div>
            <p style={{ marginTop: 20, fontSize: 14 }}>
              <Link href="/admin/users" style={{ color: "var(--emerald-strong)" }}>
                ← Admin: Users
              </Link>
            </p>
          </div>
        </main>
        <PageFooter />
      </div>
    );
  }

  const opsLinked = await hasOpsTelegramLinkForSub(op.user.sub);

  return (
    <div className="page-shell">
      <header className="admin-topbar">
        <Link href="/admin/users" className="admin-brand">
          <AppIcon app="trefolio" size={28} />
          <span className="brand-name">trefolio</span>
          <span className="admin-tag">admin</span>
        </Link>
        <nav className="admin-nav">
          <Link href="/admin/users">Users</Link>
          <Link href="/agents">Agents</Link>
          <Link href="/account/passkeys">Passkeys</Link>
        </nav>
        <div className="admin-actor" title={`Signed in as ${op.user.email}`}>
          <span className="admin-actor-email">{op.user.email}</span>
          <a href="/api/oauth2/end_session" className="btn-mini">
            Sign out
          </a>
        </div>
      </header>

      <main className="admin-main">
        <div className="card card-wide">
          {op.impersonating ? (
            <div className="alert alert-warning" style={{ marginBottom: 16, fontSize: 14 }}>
              You are <strong>impersonating</strong> another user. Business ops Telegram actions on this page
              apply to <strong>your operator account</strong> ({op.user.email}), not the impersonated profile.
            </div>
          ) : null}
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <Brand href="https://trefolio.com" />
          </div>

          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Business ops (Telegram)</h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 20 }}>
            Staff-only bot for IdP signups, billing signals, and the daily digest. This is not the Warren / product
            Telegram bot — link those from each app&apos;s profile or account hub.
          </p>

          <div
            style={{
              padding: 16,
              borderRadius: 10,
              border: "1px solid var(--border-subtle, rgba(255,255,255,0.12))",
              background: "var(--surface-elevated, rgba(255,255,255,0.03))",
            }}
          >
            <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Ops agent</h2>
            <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 12px" }}>
              Generate a one-time link and open it in Telegram (same phone) to attach this chat to your IdP
              operator account.
            </p>
            <OpsTelegramConnectPanel initialLinked={opsLinked} />
          </div>

          <p style={{ marginTop: 24, fontSize: 14 }}>
            <Link href="/account#telegram-agents" style={{ color: "var(--emerald-strong)" }}>
              All Telegram agents (trefolio, Will, Clara) on account hub →
            </Link>
          </p>
        </div>
      </main>

      <PageFooter />
    </div>
  );
}
