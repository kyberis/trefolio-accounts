import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { AppIcon, Brand, PageFooter } from "@/components/Brand";
import { findUserBySub } from "@/lib/db";
import { PatManager } from "./pat-manager";
import { IDP_SESSION_COOKIE, sessionCookieAttributes, verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Developer · MCP token · trefolio accounts",
  robots: { index: false, follow: false },
};

async function signOutAction() {
  "use server";
  const store = await cookies();
  const attrs = sessionCookieAttributes();
  store.set(attrs.name, "", {
    httpOnly: attrs.httpOnly,
    sameSite: attrs.sameSite,
    path: attrs.path,
    secure: attrs.secure,
    maxAge: 0,
  });
  redirect("/");
}

export default async function DeveloperPage() {
  const store = await cookies();
  const sub = verifySession(store.get(IDP_SESSION_COOKIE)?.value);
  if (!sub) {
    redirect(`/?next=${encodeURIComponent("/account/developer")}`);
  }
  const user = await findUserBySub(sub);
  if (!user) {
    redirect("/");
  }

  return (
    <div className="page-shell">
      <header className="admin-topbar">
        <div className="admin-brand">
          <AppIcon app="trefolio" size={28} />
          <span className="brand-name">trefolio</span>
          <span className="admin-tag">account</span>
        </div>
        <div className="admin-actor" title={`Signed in as ${user.email}`}>
          <span className="admin-actor-email">{user.email}</span>
          <form action={signOutAction}>
            <button type="submit" className="btn-mini">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="admin-main">
        <div className="card card-wide">
          <div style={{ textAlign: "center" }}>
            <Brand href="https://trefolio.com" />
          </div>
          <div className="heading-stack">
            <h1>AI &amp; MCP access</h1>
            <p>
              One personal access token works across <strong>trefolio</strong>, <strong>Clara</strong>, and{" "}
              <strong>Will</strong>. Paste it into your MCP client as{" "}
              <code>Authorization: Bearer …</code> for each app&apos;s MCP URL.
            </p>
            <p style={{ fontSize: 14, color: "var(--text-muted)" }}>
              <a href="/account/passkeys">Passkeys</a>
              {" · "}
              <a href="https://trefolio.com">trefolio.com</a>
            </p>
          </div>

          <PatManager />

          <p className="legal" style={{ marginTop: 22 }}>
            Anyone with this token can act as you in connected MCP tools. Revoke tokens you no longer
            trust. How trefolio processes portfolio data when you use MCP there is described in the{" "}
            <a href="https://trefolio.com/privacy" target="_blank" rel="noopener noreferrer">
              trefolio privacy policy
            </a>
            .
          </p>
        </div>
      </main>

      <PageFooter />
    </div>
  );
}
