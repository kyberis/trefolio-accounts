import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { Brand, PageFooter, AppIcon } from "@/components/Brand";
import { PasskeyManager } from "@/components/PasskeyManager";
import {
  deletePasskey,
  findUserBySub,
  listPasskeysForSub,
  renamePasskey,
} from "@/lib/db";
import {
  IDP_SESSION_COOKIE,
  sessionCookieAttributes,
  verifySession,
} from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Passkeys · trefolio accounts",
  robots: { index: false, follow: false },
};

async function deleteAction(formData: FormData) {
  "use server";
  const id = String(formData.get("id") || "");
  if (!id) return;
  const store = await cookies();
  const sub = verifySession(store.get(IDP_SESSION_COOKIE)?.value);
  if (!sub) return;
  await deletePasskey(id, sub);
  revalidatePath("/account/passkeys");
}

async function renameAction(formData: FormData) {
  "use server";
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim().slice(0, 60);
  if (!id) return;
  const store = await cookies();
  const sub = verifySession(store.get(IDP_SESSION_COOKIE)?.value);
  if (!sub) return;
  await renamePasskey(id, sub, name);
  revalidatePath("/account/passkeys");
}

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

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default async function PasskeysPage() {
  const store = await cookies();
  const sub = verifySession(store.get(IDP_SESSION_COOKIE)?.value);
  if (!sub) {
    redirect(`/?next=${encodeURIComponent("/account/passkeys")}`);
  }
  const user = await findUserBySub(sub);
  if (!user) {
    redirect("/");
  }
  const passkeys = await listPasskeysForSub(sub);

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
            <h1>Your passkeys</h1>
            <p>
              Sign in to trefolio, Clara, and Will with your face, fingerprint,
              or device PIN — no password to remember. Add one passkey per
              device you trust.
            </p>
          </div>

          <PasskeyManager />

          <section style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>Registered passkeys</h2>
            {passkeys.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
                You don&apos;t have any passkeys yet. Click{" "}
                <strong>Add a passkey</strong> above to enroll this device.
              </p>
            ) : (
              <div className="dev-table-wrap">
                <table className="dev-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Created</th>
                      <th>Last used</th>
                      <th>Backed up</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {passkeys.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <form action={renameAction} className="passkey-rename">
                            <input type="hidden" name="id" value={p.id} />
                            <input
                              name="name"
                              type="text"
                              className="input"
                              defaultValue={p.device_name || "(unnamed)"}
                              maxLength={60}
                              style={{ minWidth: 180 }}
                            />
                            <button type="submit" className="btn-mini">
                              Save
                            </button>
                          </form>
                        </td>
                        <td>{fmt(p.created_at)}</td>
                        <td>{fmt(p.last_used_at)}</td>
                        <td>{p.backed_up ? "Yes" : "No"}</td>
                        <td>
                          <form action={deleteAction}>
                            <input type="hidden" name="id" value={p.id} />
                            <button
                              type="submit"
                              className="btn-mini btn-danger"
                            >
                              Remove
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="legal" style={{ marginTop: 22 }}>
            Lost your device? Sign in with your password and remove the lost
            passkey from this page.
          </p>
        </div>
      </main>

      <PageFooter />
    </div>
  );
}
