import { getDb, setPlan } from "@/lib/db";

export const dynamic = "force-dynamic";

interface SeedUserRow {
  sub: string;
  email: string;
  name: string | null;
  plan: "free" | "pro" | null;
  pro_until: string | null;
}

async function togglePlan(formData: FormData) {
  "use server";
  const sub = String(formData.get("sub") || "");
  const plan = String(formData.get("plan") || "");
  if (!sub) return;
  if (plan === "pro") {
    setPlan(sub, "pro", new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString());
  } else {
    setPlan(sub, "free", null);
  }
}

export default function Home() {
  const db = getDb();
  const users = db
    .prepare(
      `SELECT u.sub, u.email, u.name, e.plan, e.pro_until
       FROM users u
       LEFT JOIN entitlements e ON e.sub = u.sub
       ORDER BY u.created_at`,
    )
    .all() as SeedUserRow[];
  return (
    <main className="container">
      <section className="hero">
        <div className="hero-topline">trefolio accounts · unified login</div>
        <h1>One account for Warren, Clara, and Will.</h1>
        <p>
          This is the identity hub at <strong>user.trefolio.com</strong>. Users sign in once here
          and keep the same credentials and plan across all tools.
        </p>
        <div className="tool-grid">
          <a
            className="tool-card tool-card-emerald"
            href="http://localhost:3010/api/auth/oidc/start?redirect=/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="tool-badge">W</div>
            <h3>trefolio</h3>
            <p>Portfolio dashboard + Warren</p>
            <span>Open login flow</span>
          </a>
          <a
            className="tool-card tool-card-cyan"
            href="http://localhost:3001/api/auth/signin/trefolio-id"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="tool-badge">C</div>
            <h3>Clara</h3>
            <p>Personal finance assistant</p>
            <span>Sign in with trefolio</span>
          </a>
          <a
            className="tool-card tool-card-violet"
            href="http://localhost:3200/api/auth/signin/trefolio-id"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="tool-badge">W</div>
            <h3>Will</h3>
            <p>Smart notes assistant</p>
            <span>Sign in with trefolio</span>
          </a>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Seed users (dev)</h2>
          <p>
            Default password: <code>password123</code>
          </p>
        </div>
        <div className="table-wrap">
          <table className="seed-table">
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
                    <span className={`plan-chip ${u.plan === "pro" ? "plan-pro" : "plan-free"}`}>
                      {u.plan || "free"}
                    </span>
                  </td>
                  <td>
                    <form action={togglePlan}>
                      <input type="hidden" name="sub" value={u.sub} />
                      <input type="hidden" name="plan" value={u.plan === "pro" ? "free" : "pro"} />
                      <button className="secondary-btn">
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

      <section className="meta-links">
        <a href="/.well-known/openid-configuration">OpenID configuration</a>
        <a href="/oauth2/authorize?client_id=trefolio&redirect_uri=http://localhost:3010/api/auth/oidc/callback&response_type=code&scope=openid%20email%20profile%20entitlements&state=demo&nonce=demo&code_challenge=demo&code_challenge_method=S256">
          Manual authorize page
        </a>
      </section>
    </main>
  );
}
