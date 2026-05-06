import { cookies, headers } from "next/headers";

import { AppIcon, Brand, PageFooter } from "@/components/Brand";
import { IdpLanguageSwitch } from "@/components/IdpLanguageSwitch";
import { listUsersWithEntitlements, setPlan, type SeedUserRow } from "@/lib/db";
import { resolveIdpLocale } from "@/lib/i18n/idp-locale";
import { getIdpUiCopy } from "@/lib/i18n/idp-messages";
import { idpUiLocaleCookieAttributes } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Seed-user panel only under `next dev` — never on prod or preview (`next build` sets NODE_ENV=production). */
const isDevServer = process.env.NODE_ENV === "development";

async function togglePlan(formData: FormData) {
  "use server";
  if (process.env.NODE_ENV !== "development") return;
  const sub = String(formData.get("sub") || "");
  const plan = String(formData.get("plan") || "");
  if (!sub) return;
  if (plan === "pro") {
    await setPlan(sub, "pro", new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString());
  } else {
    await setPlan(sub, "free", null);
  }
}

export default async function Home() {
  const users: SeedUserRow[] = isDevServer ? await listUsersWithEntitlements() : [];
  const hdrs = await headers();
  const jar = await cookies();
  const locale = resolveIdpLocale({
    cookieLocale: jar.get(idpUiLocaleCookieAttributes().name)?.value ?? null,
    acceptLanguage: hdrs.get("accept-language"),
  });
  const t = getIdpUiCopy(locale);

  return (
    <div className="page-shell">
      <main className="page-main" style={{ flexDirection: "column", gap: 28 }}>
        <div className="card card-wide">
          <IdpLanguageSwitch nextPath="/" current={locale} label={t.languageLabel} />
          <div style={{ textAlign: "center" }}>
            <Brand href="https://trefolio.com" />
          </div>
          <div className="heading-stack">
            <h1>{t.homeTitle}</h1>
            <p>{t.homeBody}</p>
          </div>

          <div className="agents-grid">
            <div className="agent-card">
              <AppIcon app="trefolio" size={32} />
              <div>
                <h3>trefolio</h3>
                <p>{t.productPortfolio}</p>
              </div>
            </div>
            <div className="agent-card">
              <AppIcon app="clara" size={32} />
              <div>
                <h3>Clara</h3>
                <p>{t.productAssistant}</p>
              </div>
            </div>
            <div className="agent-card">
              <AppIcon app="will" size={32} />
              <div>
                <h3>Will</h3>
                <p>{t.productNotes}</p>
              </div>
            </div>
          </div>

          <p className="legal" style={{ marginTop: 22 }}>
            {t.homeSignInHintBefore}
            <strong>{t.homeSignInCta}</strong>
            {t.homeSignInHintAfter}
          </p>
        </div>

        {isDevServer && users.length > 0 && (
          <section className="dev-banner">
            <h2>Seed users (dev)</h2>
            <p>
              Default password: <code>password123</code>. Only visible when running{" "}
              <code>next dev</code>; production and preview deployments never load this block.
            </p>
            <div className="dev-table-wrap">
              <table className="dev-table">
                <thead>
                  <tr>
                    <th>email</th>
                    <th>sub</th>
                    <th>plan</th>
                    <th>toggle</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.sub}>
                      <td>{u.email}</td>
                      <td className="mono">{u.sub}</td>
                      <td>
                        <span
                          className={`plan-chip ${
                            u.plan === "pro" ? "plan-pro" : "plan-free"
                          }`}
                        >
                          {u.plan || "free"}
                        </span>
                      </td>
                      <td>
                        <form action={togglePlan}>
                          <input type="hidden" name="sub" value={u.sub} />
                          <input
                            type="hidden"
                            name="plan"
                            value={u.plan === "pro" ? "free" : "pro"}
                          />
                          <button className="btn-mini" type="submit">
                            Set {u.plan === "pro" ? "free" : "pro"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
      <PageFooter />
    </div>
  );
}
