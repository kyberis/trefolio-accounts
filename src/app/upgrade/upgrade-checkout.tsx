"use client";

import { useMemo, useState } from "react";

type Interval = "monthly" | "annual";

export default function UpgradeCheckout(props: {
  from: string;
  initialIsPro: boolean;
  billingFlash: "success" | "cancelled" | null;
  initialInterval?: "monthly" | "annual";
}) {
  const { from, initialIsPro, billingFlash, initialInterval } = props;
  const [interval, setInterval] = useState<Interval>(initialInterval ?? "monthly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceLabel = useMemo(
    () =>
      interval === "annual"
        ? "€59.99 / year (save vs monthly)"
        : "€7.99 / month",
    [interval],
  );

  async function startCheckout() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval, from }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string; message?: string };
      if (!res.ok) {
        if (data.error === "already_pro") {
          setError("You already have Pro — open Clara or Will to use higher limits.");
        } else {
          setError(data.message || data.error || `Request failed (${res.status})`);
        }
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError("No checkout URL returned.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="upgrade-stack">
      {billingFlash === "success" ? (
        <div className="flash flash-success" role="status">
          Payment successful. Pro may take a few seconds to activate — return to {from} and refresh if needed.
        </div>
      ) : null}
      {billingFlash === "cancelled" ? (
        <div className="flash flash-muted" role="status">
          Checkout cancelled. You can try again when you are ready.
        </div>
      ) : null}

      {initialIsPro ? (
        <div className="flash flash-success" role="status">
          Your account already has Pro. Enjoy Warren, Clara, and Will with higher limits.
        </div>
      ) : null}

      <div className="plan-picker">
        <button
          type="button"
          className={`plan-option ${interval === "monthly" ? "plan-option-active" : ""}`}
          onClick={() => setInterval("monthly")}
        >
          Monthly
        </button>
        <button
          type="button"
          className={`plan-option ${interval === "annual" ? "plan-option-active" : ""}`}
          onClick={() => setInterval("annual")}
        >
          Annual
        </button>
      </div>

      <p className="price-tag">{priceLabel}</p>

      <button
        type="button"
        className="btn-primary-lg"
        disabled={loading || initialIsPro}
        onClick={() => void startCheckout()}
      >
        {loading ? "Opening Stripe…" : "Continue to secure checkout"}
      </button>

      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}

      <p className="fine-print">
        Same subscription benefits across the trefolio ecosystem. Billing is processed by Stripe; you will receive a
        receipt by email.
      </p>
    </div>
  );
}
