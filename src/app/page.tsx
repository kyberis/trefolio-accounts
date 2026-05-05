import { AppIcon, Brand, PageFooter } from "@/components/Brand";
import { listUsersWithEntitlements, setPlan, type SeedUserRow } from "@/lib/db";

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

  return (
    <div className="page-shell">
      <main className="page-main" style={{ flexDirection: "column", gap: 28 }}>
        <div className="card card-wide">
          <div style={{ textAlign: "center" }}>
            <Brand href="https://trefolio.com" />
          </div>
          <div className="heading-stack">
            <h1>One account for trefolio, Clara, and Will.</h1>
            <p>
              You&apos;re on the trefolio identity service. Use your trefolio account to sign in
              securely to all our products with the same email and password.
            </p>
          </div>

          <div className="agents-grid">
            <div className="agent-card">
              <AppIcon app="trefolio" size={32} />
              <div>
                <h3>trefolio</h3>
                <p>Portfolio dashboard</p>
              </div>
            </div>
            <div className="agent-card">
              <AppIcon app="clara" size={32} />
              <div>
                <h3>Clara</h3>
                <p>Personal finance assistant</p>
              </div>
            </div>
            <div className="agent-card">
              <AppIcon app="will" size={32} />
              <div>
                <h3>Will</h3>
                <p>Smart notes assistant</p>
              </div>
            </div>
          </div>

          <p className="legal" style={{ marginTop: 22 }}>
            To sign in, open trefolio, Clara or Will and click <strong>Sign in</strong>. You&apos;ll
            be brought back here to authenticate.
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
