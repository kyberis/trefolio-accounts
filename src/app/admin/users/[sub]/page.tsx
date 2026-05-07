import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { getIdpAdmin } from "@/lib/admin";
import {
  deleteUserBySub,
  getAdminUserDetail,
  getEntitlement,
  getStripeCustomerBySub,
  setPlan,
  updateUserBySub,
} from "@/lib/db";
import { impersonateUserAction } from "@/lib/idp-impersonation-actions";
import { getProductTargets, probeProductLinks } from "@/lib/product-links";

export const dynamic = "force-dynamic";

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return value;
  return new Date(t).toISOString().replace("T", " ").replace(/:\d\d\.\d{3}Z$/, "Z");
}

async function setPlanAction(formData: FormData) {
  "use server";
  const ctx = await getIdpAdmin();
  if (!ctx) return;
  const sub = String(formData.get("sub") || "");
  const plan = String(formData.get("plan") || "");
  const proUntil = String(formData.get("proUntil") || "").trim();
  if (!sub) return;

  const current = await getEntitlement(sub);
  const stripeManagedPro =
    current.plan === "pro" && current.source === "stripe";

  if (plan === "free") {
    if (stripeManagedPro) {
      redirect(
        `/admin/users/${encodeURIComponent(sub)}?planError=stripe_downgrade`,
      );
    }
    await setPlan(sub, "free", null);
  } else if (plan === "pro") {
    const iso = proUntil
      ? new Date(proUntil).toISOString()
      : new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    const sourceTag = stripeManagedPro ? "stripe" : "dev-toggle";
    await setPlan(sub, "pro", iso, sourceTag);
  }

  revalidatePath(`/admin/users/${sub}`);
  revalidatePath("/admin/users");
}

async function resetPasswordAction(formData: FormData) {
  "use server";
  const ctx = await getIdpAdmin();
  if (!ctx) return;
  const sub = String(formData.get("sub") || "");
  const password = String(formData.get("password") || "");
  if (!sub || password.length < 8) return;
  const hash = await bcrypt.hash(password, 12);
  await updateUserBySub(sub, { password_hash: hash, password_plain: "" });
  revalidatePath(`/admin/users/${sub}`);
}

async function setEmailVerifiedAction(formData: FormData) {
  "use server";
  const ctx = await getIdpAdmin();
  if (!ctx) return;
  const sub = String(formData.get("sub") || "");
  const value = String(formData.get("value") || "0") === "1" ? 1 : 0;
  if (!sub) return;
  await updateUserBySub(sub, { email_verified: value });
  revalidatePath(`/admin/users/${sub}`);
}

async function deleteUserAction(formData: FormData) {
  "use server";
  const ctx = await getIdpAdmin();
  if (!ctx) return;
  const sub = String(formData.get("sub") || "");
  const confirm = String(formData.get("confirm") || "");
  if (!sub || confirm !== "DELETE") return;
  if (sub === ctx.user.sub) return; // never let an admin nuke themselves
  await deleteUserBySub(sub);
  redirect("/admin/users");
}

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ sub: string }>;
  searchParams: Promise<{ planError?: string }>;
}) {
  const { sub } = await params;
  const { planError } = await searchParams;
  const user = await getAdminUserDetail(sub);
  if (!user) notFound();

  const stripeManagedPro = user.plan === "pro" && user.source === "stripe";
  const stripeCustomer = stripeManagedPro
    ? await getStripeCustomerBySub(user.sub)
    : null;

  const [linksRaw, targets] = [
    await probeProductLinks({ sub: user.sub, email: user.email, timeoutMs: 2500 }),
    getProductTargets(),
  ];
  const links = linksRaw;
  const linkByApp = new Map(links.map((l) => [l.app, l]));

  const proUntilInputValue = user.pro_until
    ? new Date(user.pro_until).toISOString().slice(0, 10)
    : "";

  return (
    <section className="admin-section">
      <header className="admin-section-header">
        <div>
          <Link href="/admin/users" className="admin-back-link">
            ← All users
          </Link>
          <h1>{user.email}</h1>
          <p className="admin-section-subtitle">
            <span className="mono">{user.sub}</span> ·{" "}
            {user.name ? user.name : <em>no display name</em>} · created{" "}
            {fmtDateTime(user.created_at)}
          </p>
        </div>
        <div className="admin-detail-status">
          <span className={`plan-chip ${user.plan === "pro" ? "plan-pro" : "plan-free"}`}>
            {user.plan}
          </span>
          {user.email_verified ? (
            <span className="badge badge-ok">verified</span>
          ) : (
            <span className="badge badge-warn">unverified</span>
          )}
          {user.google_id && <span className="badge">google</span>}
          {user.apple_id && <span className="badge">apple</span>}
        </div>
      </header>

      <div className="admin-grid">
        <article className="card">
          <h2 className="card-title">Linked products</h2>
          <p className="card-subtitle">
            What we found when calling each product&apos;s <code>/api/v1/users/by-sub</code>{" "}
            endpoint with this user&apos;s email.
          </p>
          <ul className="link-list">
            {targets.map((t) => {
              const l = linkByApp.get(t.app);
              const exists = Boolean(l?.exists);
              const details = (l?.details ?? {}) as Record<string, unknown>;
              return (
                <li key={t.app} className={`link-item ${exists ? "is-linked" : "is-missing"}`}>
                  <div className="link-head">
                    <span className="app-badge is-large">{t.label}</span>
                    {exists ? (
                      <span className="badge badge-ok">linked</span>
                    ) : l?.error ? (
                      <span className="badge badge-warn" title={l.error}>
                        unreachable
                      </span>
                    ) : (
                      <span className="badge badge-muted">no account</span>
                    )}
                  </div>
                  {exists && (
                    <dl className="link-details">
                      {typeof details.id === "string" && (
                        <>
                          <dt>id</dt>
                          <dd className="mono">{String(details.id)}</dd>
                        </>
                      )}
                      {typeof details.plan === "string" && (
                        <>
                          <dt>plan</dt>
                          <dd>{String(details.plan)}</dd>
                        </>
                      )}
                      {typeof details.role === "string" && (
                        <>
                          <dt>role</dt>
                          <dd>{String(details.role)}</dd>
                        </>
                      )}
                      {"isAdmin" in details && (
                        <>
                          <dt>admin?</dt>
                          <dd>{details.isAdmin ? "yes" : "no"}</dd>
                        </>
                      )}
                      {"isActive" in details && (
                        <>
                          <dt>active?</dt>
                          <dd>{details.isActive ? "yes" : "no"}</dd>
                        </>
                      )}
                      {typeof details.dailyAgentMessageLimit === "number" && (
                        <>
                          <dt>agent/day</dt>
                          <dd>{String(details.dailyAgentMessageLimit)}</dd>
                        </>
                      )}
                      {typeof details.createdAt === "string" && (
                        <>
                          <dt>created</dt>
                          <dd>{fmtDateTime(String(details.createdAt))}</dd>
                        </>
                      )}
                    </dl>
                  )}
                  {l?.adminLink && (
                    <a
                      href={l.adminLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-mini"
                    >
                      Open in {t.label} admin →
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </article>

        <article className="card">
          <h2 className="card-title">Plan & entitlements</h2>
          <p className="card-subtitle">
            Source: {user.source ? <code>{user.source}</code> : <em>auto</em>}
          </p>
          {planError === "stripe_downgrade" && (
            <p className="card-subtitle" role="alert" style={{ color: "var(--warn, #c2410c)" }}>
              Cannot set this account to Free while Pro is managed by Stripe. Cancel or change
              the subscription in Stripe (or wait until the webhook reflects cancellation).
            </p>
          )}
          {stripeManagedPro && (
            <p className="card-subtitle">
              Pro is billed via Stripe — use the Stripe Dashboard to cancel or refund; this form
              cannot downgrade to Free until Stripe no longer reports paid access.
              {stripeCustomer?.stripe_customer_id && (
                <>
                  {" "}
                  <a
                    href={`https://dashboard.stripe.com/customers/${stripeCustomer.stripe_customer_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open Stripe customer →
                  </a>
                </>
              )}
            </p>
          )}
          <form action={setPlanAction} className="form-stack">
            <input type="hidden" name="sub" value={user.sub} />
            <label className="field">
              <span>Plan</span>
              <select name="plan" defaultValue={user.plan} className="input">
                <option value="free" disabled={stripeManagedPro}>
                  free
                </option>
                <option value="pro">pro</option>
              </select>
            </label>
            <label className="field">
              <span>Pro until (optional)</span>
              <input
                type="date"
                name="proUntil"
                defaultValue={proUntilInputValue}
                className="input"
              />
            </label>
            <button type="submit" className="btn btn-primary">
              Save plan
            </button>
          </form>
        </article>

        <article className="card">
          <h2 className="card-title">Sign in as this user</h2>
          <p className="card-subtitle">
            Sets your IdP browser session to this account so OIDC flows run as them.
            Use <strong>Exit to admin</strong> in the top banner to return. You cannot
            impersonate allow-listed admin emails.
          </p>
          <form action={impersonateUserAction} className="form-stack">
            <input type="hidden" name="sub" value={user.sub} />
            <button type="submit" className="btn btn-primary">
              Sign in as {user.email}
            </button>
          </form>
        </article>

        <article className="card">
          <h2 className="card-title">Reset password</h2>
          <p className="card-subtitle">
            Sets a fresh bcrypt hash on this IdP account (required for email/password
            sign-in). Sessions elsewhere are not invalidated automatically.
          </p>
          <form action={resetPasswordAction} className="form-stack">
            <input type="hidden" name="sub" value={user.sub} />
            <label className="field">
              <span>New password (≥ 8 chars)</span>
              <input
                type="password"
                name="password"
                minLength={8}
                required
                autoComplete="new-password"
                className="input"
                placeholder="temporary password"
              />
            </label>
            <button type="submit" className="btn btn-secondary">
              Set password
            </button>
          </form>
        </article>

        <article className="card">
          <h2 className="card-title">Email verification</h2>
          <p className="card-subtitle">
            Toggle the IdP-side verified flag. Useful when a migrated user can&apos;t
            receive verification mail.
          </p>
          <form action={setEmailVerifiedAction} className="form-stack admin-inline-form">
            <input type="hidden" name="sub" value={user.sub} />
            <input type="hidden" name="value" value={user.email_verified ? "0" : "1"} />
            <button type="submit" className="btn btn-secondary">
              Mark as {user.email_verified ? "unverified" : "verified"}
            </button>
          </form>
        </article>

        <article className="card admin-danger">
          <h2 className="card-title">Danger zone</h2>
          <p className="card-subtitle">
            Hard-deletes the user from the IdP. Local product accounts (trefolio,
            Clara, Will) are <strong>not</strong> deleted; remove them from each
            product&apos;s admin separately.
          </p>
          <form action={deleteUserAction} className="form-stack">
            <input type="hidden" name="sub" value={user.sub} />
            <label className="field">
              <span>
                Type <code>DELETE</code> to confirm
              </span>
              <input type="text" name="confirm" className="input" required pattern="DELETE" />
            </label>
            <button type="submit" className="btn btn-danger">
              Delete IdP user
            </button>
          </form>
        </article>
      </div>
    </section>
  );
}
