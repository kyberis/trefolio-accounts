import Link from "next/link";
import { redirect } from "next/navigation";

import { Brand, PageFooter, AppIcon } from "@/components/Brand";
import { getIdpAdmin, hasAdminConfigured } from "@/lib/admin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "trefolio accounts · admin",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getIdpAdmin();

  if (!ctx) {
    if (!hasAdminConfigured()) {
      return (
        <div className="page-shell">
          <main className="page-main" style={{ flexDirection: "column", gap: 16 }}>
            <div className="card card-narrow" style={{ textAlign: "center" }}>
              <Brand />
              <div className="heading-stack">
                <h1>Admin disabled</h1>
                <p>
                  Set <code>IDP_ADMIN_EMAILS</code> in this service&apos;s environment
                  to a comma-separated allow-list of email addresses, then sign in
                  with one of those accounts.
                </p>
              </div>
            </div>
          </main>
          <PageFooter />
        </div>
      );
    }
    const next = encodeURIComponent("/admin/users");
    redirect(`/?next=${next}`);
  }

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
          <a href="/api/oauth2/end_session" className="btn-mini">
            Sign out
          </a>
        </div>
      </header>
      <main className="admin-main">{children}</main>
      <PageFooter />
    </div>
  );
}
