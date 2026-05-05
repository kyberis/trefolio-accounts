"use client";

import { useEffect, useState } from "react";

const COOLDOWN_SEC = 60;

export function CheckEmailActions({ email }: { email: string }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function resend() {
    if (cooldown > 0 || sending) return;
    setSending(true);
    setError(null);
    setSent(false);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Could not resend.");
        return;
      }
      setSent(true);
      setCooldown(COOLDOWN_SEC);
    } catch {
      setError("Could not resend.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="form-stack" style={{ gap: 12 }}>
      {sent ? (
        <div className="alert alert-success" style={{ margin: 0 }}>
          Verification email sent again.
        </div>
      ) : null}
      {error ? (
        <div className="alert alert-error" style={{ margin: 0 }}>
          {error}
        </div>
      ) : null}
      <button
        type="button"
        className="btn btn-secondary btn-block"
        onClick={() => void resend()}
        disabled={sending || cooldown > 0}
      >
        {sending
          ? "Sending…"
          : cooldown > 0
            ? `Resend available in ${cooldown}s`
            : "Resend verification email"}
      </button>
    </div>
  );
}
