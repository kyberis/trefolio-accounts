"use client";

import { useCallback, useEffect, useState } from "react";

import { Brand, PageFooter, AppIcon } from "@/components/Brand";
import OpsTelegramConnectPanel from "@/components/OpsTelegramConnectPanel";

type FromApp = "trefolio" | "clara" | "will";

function productHome(from: FromApp | undefined): string {
  if (from === "clara") return "https://clara.trefolio.com/app";
  if (from === "will") return "https://will.trefolio.com/app";
  if (from === "trefolio") return "https://trefolio.com/";
  return "https://trefolio.com/";
}

function backLabel(from: FromApp | undefined): string {
  if (from === "clara") return "Back to Clara";
  if (from === "will") return "Back to Will";
  if (from === "trefolio") return "Back to trefolio";
  return "Back to trefolio";
}

type TelegramAgentRow = {
  id: string;
  title: string;
  description: string;
  linked: boolean | null;
  has_product_account: boolean | null;
  connect_url: string;
  staff_only?: boolean;
};

type ProfilePayload = {
  sub: string;
  email: string;
  name: string;
  avatar_url: string;
  tax_residency: string;
  email_verified: boolean;
  google_linked: boolean;
  apple_linked: boolean;
  has_password: boolean;
  is_platform_staff: boolean;
  ops_telegram_linked: boolean;
  telegram_agents?: TelegramAgentRow[];
};

/** Shown when API omits agents (older deploy) or payload failed — uses production URLs. */
const TELEGRAM_AGENTS_FALLBACK: TelegramAgentRow[] = [
  {
    id: "trefolio",
    title: "trefolio (Warren)",
    description:
      "Portfolio help, alerts, and Warren on Telegram. Sign in at trefolio with this account, then connect Telegram from your profile.",
    linked: null,
    has_product_account: null,
    connect_url: "https://trefolio.com/profile",
  },
  {
    id: "will",
    title: "Will",
    description:
      "Notes and AI on Telegram and the web. Open Will and connect Telegram from the app if you use it there.",
    linked: null,
    has_product_account: null,
    connect_url: "https://will.trefolio.com/app",
  },
  {
    id: "clara",
    title: "Clara",
    description:
      "Financial agents on the web. Use Clara in the browser; Telegram is not linked from this directory yet.",
    linked: null,
    has_product_account: null,
    connect_url: "https://clara.trefolio.com/app",
  },
];

function resolveTelegramAgents(profile: ProfilePayload): TelegramAgentRow[] {
  const fromApi = profile.telegram_agents;
  if (Array.isArray(fromApi) && fromApi.length > 0) {
    return fromApi;
  }
  const rows = [...TELEGRAM_AGENTS_FALLBACK];
  if (profile.is_platform_staff) {
    rows.push({
      id: "ops",
      title: "Business ops (staff)",
      description:
        "Platform staff bot: IdP signups, billing signals, and daily digest. Separate from product bots above.",
      linked: profile.ops_telegram_linked,
      has_product_account: true,
      connect_url: "",
      staff_only: true,
    });
  }
  return rows;
}

export default function AccountHub({
  fromApp,
  googleConfigured,
}: {
  fromApp?: FromApp;
  googleConfigured: boolean;
}) {
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [taxResidency, setTaxResidency] = useState("");

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");
  const [pwdErr, setPwdErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/account/profile", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "load_failed");
      setProfile(data as ProfilePayload);
      setName(data.name || "");
      setAvatarUrl(data.avatar_url || "");
      setTaxResidency(data.tax_residency || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    setError("");
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          avatar_url: avatarUrl,
          tax_residency: taxResidency,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "save_failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdMsg("");
    setPwdErr("");
    if (newPwd !== confirmPwd) {
      setPwdErr("New passwords do not match.");
      return;
    }
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentPwd,
          new_password: newPwd,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "password_failed");
      setPwdMsg("Password updated.");
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      await load();
    } catch (e) {
      setPwdErr(e instanceof Error ? e.message : "Could not update password.");
    }
  }

  if (loading && !profile) {
    return (
      <div className="page-shell">
        <p style={{ color: "var(--text-muted)", padding: 24 }}>Loading…</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page-shell">
        <p style={{ color: "#f87171", padding: 24 }}>{error || "Unable to load account."}</p>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <header className="admin-topbar">
        <div className="admin-brand">
          <AppIcon app="trefolio" size={28} />
          <span className="brand-name">trefolio</span>
          <span className="admin-tag">account</span>
        </div>
        <div className="admin-actor" title={`Signed in as ${profile.email}`}>
          <span className="admin-actor-email">{profile.email}</span>
          <button
            type="button"
            className="btn-mini"
            onClick={async () => {
              await fetch("/api/account/sign-out", { method: "POST", credentials: "include" });
              window.location.href = "/";
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="admin-main">
        <div className="card card-wide">
          <div style={{ textAlign: "center" }}>
            <Brand href="https://trefolio.com" />
          </div>

          <p style={{ marginTop: 16, fontSize: 14, color: "var(--text-muted)" }}>
            One profile for <strong>trefolio</strong>, <strong>Clara</strong>, and <strong>Will</strong>.
          </p>

          <p style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <a href={productHome(fromApp)} className="btn-mini" style={{ textDecoration: "none" }}>
              ← {backLabel(fromApp)}
            </a>
            <a href="#telegram-agents" className="btn-mini" style={{ textDecoration: "none" }}>
              Telegram agents ↓
            </a>
          </p>

          {error ? (
            <p style={{ color: "#f87171", marginTop: 12, fontSize: 14 }} role="alert">
              {error}
            </p>
          ) : null}

          <section style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 18, marginBottom: 12 }}>Profile</h2>
            <form onSubmit={onSaveProfile} className="space-y-form">
              <div>
                <label htmlFor="acc-name" className="label-block">
                  Display name
                </label>
                <input
                  id="acc-name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  autoComplete="name"
                />
              </div>
              <div>
                <label htmlFor="acc-email" className="label-block">
                  Email
                </label>
                <input
                  id="acc-email"
                  className="input"
                  value={profile.email}
                  readOnly
                  disabled
                  aria-readonly="true"
                />
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                  Email changes use verification flows from your product sign-in settings.
                </p>
              </div>
              <div>
                <label htmlFor="acc-avatar" className="label-block">
                  Avatar image URL
                </label>
                <input
                  id="acc-avatar"
                  className="input"
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  maxLength={2048}
                  placeholder="https://…"
                />
              </div>
              <div>
                <label htmlFor="acc-tax" className="label-block">
                  Tax residency (ISO country, e.g. ES)
                </label>
                <input
                  id="acc-tax"
                  className="input"
                  value={taxResidency}
                  onChange={(e) => setTaxResidency(e.target.value.toUpperCase().slice(0, 2))}
                  maxLength={2}
                  pattern="[A-Za-z]{0,2}"
                  autoComplete="country"
                />
              </div>
              {saved ? (
                <p style={{ fontSize: 13, color: "#34d399" }} aria-live="polite">
                  Saved.
                </p>
              ) : null}
              <button type="submit" className="btn-primary">
                Save profile
              </button>
            </form>
          </section>

          <section style={{ marginTop: 36 }}>
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>Connected accounts</h2>
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 12 }}>
              Link Google for faster sign-in across all apps.
            </p>
            {profile.google_linked ? (
              <p style={{ fontSize: 14 }}>
                <span style={{ color: "#34d399" }}>Google connected.</span>
              </p>
            ) : googleConfigured ? (
              <a href="/api/auth/google/start?next=/account" className="btn-primary" style={{ display: "inline-block" }}>
                Connect Google
              </a>
            ) : (
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Google sign-in is not configured on this server.</p>
            )}
            {profile.apple_linked ? (
              <p style={{ fontSize: 14, marginTop: 8 }}>
                <span style={{ color: "#34d399" }}>Apple connected.</span>
              </p>
            ) : null}
          </section>

          <section id="telegram-agents" style={{ marginTop: 36 }} aria-labelledby="telegram-agents-heading">
            <h2 id="telegram-agents-heading" style={{ fontSize: 18, marginBottom: 8 }}>
              Telegram agents
            </h2>
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 16 }}>
              Bots are per product. Warren / Will / Clara are linked inside each app (buttons below). Staff see an
              extra row to link the <strong>business ops</strong> bot here on the IdP.
            </p>
            {resolveTelegramAgents(profile).map((agent) => (
              <div
                key={agent.id}
                style={{
                  marginBottom: 20,
                  padding: 16,
                  borderRadius: 10,
                  border: "1px solid var(--border-subtle, rgba(255,255,255,0.12))",
                  background: "var(--surface-elevated, rgba(255,255,255,0.03))",
                }}
              >
                <h3 style={{ fontSize: 16, margin: "0 0 8px" }}>{agent.title}</h3>
                <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 10px" }}>{agent.description}</p>
                {agent.staff_only && agent.id === "ops" ? (
                  <OpsTelegramConnectPanel initialLinked={profile.ops_telegram_linked} />
                ) : (
                  <>
                    <p style={{ fontSize: 14, marginBottom: 10 }}>
                      <span style={{ color: "var(--text-muted)" }}>Telegram: </span>
                      <strong>
                        {agent.linked === true
                          ? "Connected"
                          : agent.linked === false
                            ? agent.has_product_account === false && agent.id === "trefolio"
                              ? "No trefolio profile for this login yet"
                              : "Not connected"
                            : agent.id === "trefolio"
                              ? "Could not check (app unreachable or misconfigured)"
                              : "Link from the app (not checked here)"}
                      </strong>
                    </p>
                    {agent.connect_url ? (
                      <a
                        href={agent.connect_url}
                        className="btn-mini"
                        style={{ textDecoration: "none" }}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open {agent.id === "trefolio" ? "trefolio profile" : agent.title} →
                      </a>
                    ) : null}
                  </>
                )}
              </div>
            ))}
          </section>

          <section style={{ marginTop: 36 }}>
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>Passkeys</h2>
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 12 }}>
              Face ID, Touch ID, Windows Hello, or device PIN — no password on trusted devices.
            </p>
            <a href="/account/passkeys" className="btn-mini" style={{ textDecoration: "none" }}>
              Manage passkeys →
            </a>
          </section>

          <section style={{ marginTop: 36 }}>
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>Password</h2>
            {!profile.has_password ? (
              <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 12 }}>
                You sign in with Google or a passkey. Set a password if you want a backup sign-in method.
              </p>
            ) : null}
            <form onSubmit={onChangePassword} className="space-y-form">
              {profile.has_password ? (
                <div>
                  <label htmlFor="cur-pwd" className="label-block">
                    Current password
                  </label>
                  <input
                    id="cur-pwd"
                    type="password"
                    className="input"
                    value={currentPwd}
                    onChange={(e) => setCurrentPwd(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
              ) : null}
              <div>
                <label htmlFor="new-pwd" className="label-block">
                  {profile.has_password ? "New password" : "Choose a password"}
                </label>
                <input
                  id="new-pwd"
                  type="password"
                  className="input"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label htmlFor="conf-pwd" className="label-block">
                  Confirm new password
                </label>
                <input
                  id="conf-pwd"
                  type="password"
                  className="input"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              {pwdErr ? (
                <p style={{ color: "#f87171", fontSize: 13 }} role="alert">
                  {pwdErr}
                </p>
              ) : null}
              {pwdMsg ? (
                <p style={{ color: "#34d399", fontSize: 13 }} aria-live="polite">
                  {pwdMsg}
                </p>
              ) : null}
              <button type="submit" className="btn-primary">
                {profile.has_password ? "Change password" : "Set password"}
              </button>
            </form>
            <p style={{ marginTop: 16, fontSize: 13 }}>
              <a href="/account/forgot-password" style={{ color: "var(--emerald-strong)" }}>
                Forgot password?
              </a>
            </p>
          </section>

          <section style={{ marginTop: 28, fontSize: 14 }}>
            <a href="/account/developer">Developer · MCP tokens</a>
          </section>
        </div>
      </main>

      <PageFooter />
    </div>
  );
}
