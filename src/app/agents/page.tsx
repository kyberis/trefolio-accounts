import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { Brand, PageFooter, AppIcon } from "@/components/Brand";
import OpsTelegramConnectPanel from "@/components/OpsTelegramConnectPanel";
import { getIdpAdmin, hasAdminConfigured } from "@/lib/admin";
import { hasOpsTelegramLinkForSub } from "@/lib/db";
import { IDP_SESSION_COOKIE, verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Agents · trefolio accounts",
  robots: { index: false, follow: false },
};

/**
 * Operators only (`IDP_ADMIN_EMAILS`). Uses the same `idp_session` cookie as /admin.
 * Product Telegram bots (Warren / etc.) stay in each app; this page is only the ops bot.
 */
export default async function AgentsPage() {
  if (!hasAdminConfigured()) {
    redirect("/admin/users");
  }

  const ctx = await getIdpAdmin();
  if (!ctx) {
    const jar = await cookies();
    const sub = verifySession(jar.get(IDP_SESSION_COOKIE)?.value);
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
    redirect(`/?next=${encodeURIComponent("/agents")}`);
  }

  const opsLinked = await hasOpsTelegramLinkForSub(ctx.user.sub);

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
        <div className="admin-actor" title={`Signed in as ${ctx.user.email}`}>
          <span className="admin-actor-email">{ctx.user.email}</span>
          <Link href="/api/oauth2/end_session" className="btn-mini">
            Sign out
          </Link>
        </div>
      </header>

      <main className="admin-main">
        <div className="card card-wide">
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
