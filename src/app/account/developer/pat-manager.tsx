"use client";

import { useCallback, useEffect, useState } from "react";

type TokenRow = {
  id: string;
  prefix: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

export function PatManager() {
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [name, setName] = useState("Claude / Cursor");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/v1/personal-access-tokens", { credentials: "include" });
    if (!res.ok) {
      setError("Could not load tokens.");
      setTokens([]);
      return;
    }
    const data = (await res.json()) as { tokens: TokenRow[] };
    setTokens(data.tokens);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createToken() {
    setBusy(true);
    setError(null);
    setNewToken(null);
    try {
      const res = await fetch("/api/v1/personal-access-tokens", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as { token?: string; error?: string; message?: string };
      if (!res.ok) {
        setError(data.message || data.error || "Create failed");
        return;
      }
      if (data.token) setNewToken(data.token);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this token? MCP clients using it will stop working.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/personal-access-tokens/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        setError("Revoke failed");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error ? (
        <p style={{ color: "var(--danger, #c00)", marginBottom: 12 }} role="alert">
          {error}
        </p>
      ) : null}

      {newToken ? (
        <div
          style={{
            marginBottom: 20,
            padding: 14,
            borderRadius: 8,
            background: "var(--card-inner-bg, rgba(0,0,0,0.06))",
          }}
        >
          <p style={{ margin: "0 0 8px", fontWeight: 600 }}>Copy your token now</p>
          <p style={{ margin: "0 0 8px", fontSize: 13 }}>
            This is the only time it is shown. Store it in your MCP client (Cursor, Claude Desktop,
            etc.).
          </p>
          <code
            style={{
              display: "block",
              wordBreak: "break-all",
              fontSize: 12,
              padding: 10,
              borderRadius: 6,
              background: "var(--code-bg, #111)",
              color: "var(--code-fg, #eee)",
            }}
          >
            {newToken}
          </code>
          <button
            type="button"
            className="btn-mini"
            style={{ marginTop: 10 }}
            onClick={() => {
              void navigator.clipboard.writeText(newToken);
            }}
          >
            Copy to clipboard
          </button>
          <button
            type="button"
            className="btn-mini"
            style={{ marginTop: 10, marginLeft: 8 }}
            onClick={() => setNewToken(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", marginBottom: 20 }}>
        <label style={{ flex: "1 1 200px" }}>
          <span style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Label</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            disabled={busy}
          />
        </label>
        <button type="button" className="btn-mini" onClick={() => void createToken()} disabled={busy}>
          Create token
        </button>
      </div>

      <h2 style={{ fontSize: 18, marginBottom: 8 }}>Your tokens</h2>
      {tokens === null ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : tokens.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No tokens yet.</p>
      ) : (
        <div className="dev-table-wrap">
          <table className="dev-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Prefix</th>
                <th>Created</th>
                <th>Last used</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>
                    <code>{t.prefix}…</code>
                  </td>
                  <td>{t.created_at}</td>
                  <td>{t.last_used_at ?? "—"}</td>
                  <td>{t.revoked_at ? "Revoked" : "Active"}</td>
                  <td>
                    {!t.revoked_at ? (
                      <button
                        type="button"
                        className="btn-mini btn-danger"
                        disabled={busy}
                        onClick={() => void revoke(t.id)}
                      >
                        Revoke
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
