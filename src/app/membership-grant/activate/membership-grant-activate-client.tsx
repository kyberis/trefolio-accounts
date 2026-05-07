"use client";

import { useCallback, useState } from "react";
import Link from "next/link";

export default function MembershipGrantActivateClient({
  token,
  tokenValid,
}: {
  token: string;
  tokenValid: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const activate = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/membership-grant/activate", {
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

  if (!token || !tokenValid) {
    return (
      <div className="page-shell">
        <main className="page-main" style={{ flexDirection: "column", gap: 16 }}>
          <div className="card card-wide">
            <h1>Activation link unavailable</h1>
            <p className="card-subtitle">This link is invalid or has already been used.</p>
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
            <h1>Membership activated</h1>
            <p className="card-subtitle">
              Your complimentary Pro period is now active on your unified trefolio account. Open trefolio, Clara, or
              Will and sign in with the same identity.
            </p>
            <Link href="/upgrade" className="btn btn-primary">
              View subscription
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (error === "sign_in_required") {
    const next = `/membership-grant/activate?token=${encodeURIComponent(token)}`;
    return (
      <div className="page-shell">
        <main className="page-main" style={{ flexDirection: "column", gap: 16 }}>
          <div className="card card-wide">
            <h1>Sign in to activate</h1>
            <p className="card-subtitle">Sign in to your trefolio account (same email as this invitation), then return here.</p>
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
          <h1>Activate membership</h1>
          <p className="card-subtitle">
            The trefolio team granted you complimentary Pro on your unified account. Your included period starts when
            you activate — not before.
          </p>
          {error && error !== "sign_in_required" ? (
            <p className="error-text" role="alert">
              {error === "invalid_or_used_token"
                ? "This link is no longer valid."
                : "Could not activate. Try again or contact support."}
            </p>
          ) : null}
          <button type="button" className="btn btn-primary" disabled={loading} onClick={() => void activate()}>
            {loading ? "Activating…" : "Activate membership"}
          </button>
        </div>
      </main>
    </div>
  );
}
