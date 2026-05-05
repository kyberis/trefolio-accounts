import Link from "next/link";

import { listUsersForAdmin, type AdminUserRow } from "@/lib/db";
import { probeProductLinks, getProductTargets } from "@/lib/product-links";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  page?: string;
}

const PAGE_SIZE = 25;

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return value;
  return new Date(t).toISOString().slice(0, 10);
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return value;
  return new Date(t).toISOString().replace("T", " ").replace(/:\d\d\.\d{3}Z$/, "Z");
}

interface RowWithLinks extends AdminUserRow {
  linkedApps: string[];
}

async function loadRows(rows: AdminUserRow[]): Promise<RowWithLinks[]> {
  // Fan out per user so the listing reflects "linked apps" for each entry.
  // We tolerate per-user failures: any product that can't be reached just
  // returns `exists: false` and renders without that badge.
  const probed = await Promise.all(
    rows.map(async (u) => {
      const links = await probeProductLinks({ sub: u.sub, email: u.email });
      const linkedApps = links.filter((l) => l.exists).map((l) => l.app);
      return { ...u, linkedApps };
    }),
  );
  return probed;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = (params.q || "").trim();
  const page = Math.max(0, parseInt(params.page || "0", 10) || 0);

  const { users, total } = await listUsersForAdmin({
    search: q || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const rows = await loadRows(users);
  const targets = getProductTargets();

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="admin-section">
      <header className="admin-section-header">
        <div>
          <h1>Users</h1>
          <p className="admin-section-subtitle">
            {total.toLocaleString()} accounts across the trefolio identity service.
            Linked badges show which products have a local user record matching this
            email.
          </p>
        </div>
        <form className="admin-search" action="/admin/users" method="get">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search email, name or sub…"
            className="input"
          />
          <button className="btn btn-primary" type="submit">
            Search
          </button>
        </form>
      </header>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Sub</th>
              <th>Plan</th>
              <th>Linked apps</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="admin-empty">
                  {q ? `No users match "${q}".` : "No users yet."}
                </td>
              </tr>
            ) : (
              rows.map((u) => (
                <tr key={u.sub}>
                  <td>
                    <Link href={`/admin/users/${encodeURIComponent(u.sub)}`} className="admin-user-link">
                      {u.email}
                      {!u.email_verified && (
                        <span className="badge badge-warn" title="Email not verified">
                          unverified
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="admin-cell-name">{u.name || "—"}</td>
                  <td className="mono">{u.sub}</td>
                  <td>
                    <span className={`plan-chip ${u.plan === "pro" ? "plan-pro" : "plan-free"}`}>
                      {u.plan}
                    </span>
                    {u.pro_until && u.plan === "pro" && (
                      <div className="cell-sub">until {fmtDate(u.pro_until)}</div>
                    )}
                  </td>
                  <td className="admin-cell-apps">
                    {targets.map((t) => {
                      const hit = u.linkedApps.includes(t.app);
                      return (
                        <span
                          key={t.app}
                          className={`app-badge ${hit ? "is-linked" : "is-missing"}`}
                          title={hit ? `${t.label}: linked` : `${t.label}: not found`}
                        >
                          {t.label}
                        </span>
                      );
                    })}
                  </td>
                  <td>{fmtDateTime(u.created_at)}</td>
                  <td>
                    <Link href={`/admin/users/${encodeURIComponent(u.sub)}`} className="btn-mini">
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav className="admin-pager" aria-label="pagination">
          {page > 0 && (
            <Link
              href={{ pathname: "/admin/users", query: { q, page: page - 1 } }}
              className="btn-mini"
            >
              ← Prev
            </Link>
          )}
          <span className="admin-pager-status">
            Page {page + 1} of {totalPages}
          </span>
          {page + 1 < totalPages && (
            <Link
              href={{ pathname: "/admin/users", query: { q, page: page + 1 } }}
              className="btn-mini"
            >
              Next →
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
