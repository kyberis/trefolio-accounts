"use client";

import { useCallback, useState } from "react";
import Link from "next/link";

export default function TrialActivateClient({
  token,
  tokenStatus,
  welcomeHref,
}: {
  token: string;
  tokenStatus: "valid" | "already_used" | "invalid";
  welcomeHref: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const activate = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/trial/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error === "sign_in_required" ? "sign_in_required" : data.error || "Activation failed");
        return;
      }
      setDone(true);
    } catch {
      setError("network");
    } finally {
      setLoading(false);
    }
  }, [token]);

  if (!token || tokenStatus !== "valid") {
    const reason = tokenStatus === "already_used" ? "already_used" : "invalid";
    return (
      <div className="page-shell">
        <main className="page-main" style={{ flexDirection: "column", gap: 16 }}>
          <div className="card card-wide">
            <h1>{reason === "already_used" ? "Trial already activated" : "Trial link unavailable"}</h1>
            <p className="card-subtitle">
              {reason === "already_used"
                ? "This trial link has already been used."
                : "This link is invalid or has expired."}
            </p>
            <Link href="/" className="btn btn-secondary">
              Account home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (done) {
    return (
      <div className="page-shell">
        <main className="page-main" style={{ flexDirection: "column", gap: 16 }}>
          <div className="card card-wide">
            <h1>Your 7-day Pro trial is active</h1>
            <p className="card-subtitle">
              Open trefolio and sign in with this account to use Pro features across the trefolio ecosystem.
            </p>
            <Link href={welcomeHref} className="btn btn-primary">
              Continue to trefolio
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (error === "sign_in_required") {
    const next = `/trial/activate?token=${encodeURIComponent(token)}`;
    return (
      <div className="page-shell">
        <main className="page-main" style={{ flexDirection: "column", gap: 16 }}>
          <div className="card card-wide">
            <h1>Sign in to activate</h1>
            <p className="card-subtitle">
              Sign in to your trefolio account (same email as this invitation), then return here to start your trial.
            </p>
            <Link href={`/?next=${encodeURIComponent(next)}`} className="btn btn-primary">
              Sign in
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <main className="page-main" style={{ flexDirection: "column", gap: 16 }}>
        <div className="card card-wide">
          <h1>Activate your 7-day Pro trial</h1>
          <p className="card-subtitle">
            No credit card required. After 7 days, your account returns to the Free plan unless you subscribe.
          </p>
          {error && error !== "sign_in_required" ? (
            <p className="error-text" role="alert">
              {error === "not_free"
                ? "You already have an active paid plan."
                : error === "trial_already_activated"
                  ? "This trial was already activated."
                  : "Could not activate. Try again or contact support."}
            </p>
          ) : null}
          <button type="button" className="btn btn-primary" disabled={loading} onClick={() => void activate()}>
            {loading ? "Activating…" : "Activate trial"}
          </button>
        </div>
      </main>
    </div>
  );
}
