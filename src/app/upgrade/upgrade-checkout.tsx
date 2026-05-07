"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ProductTarget } from "@/lib/product-links";
import {
  type FromApp,
  getCheckoutFootnote,
  getLandingBenefitsHeading,
  getLandingBenefitsSub,
  getSuccessStepOrder,
  getUpgradeBullets,
  parseFromApp,
  upgradeFromCssClass,
} from "@/lib/upgrade-from-copy";

type Interval = "monthly" | "annual";

export type BillingFlash = "success" | "cancelled" | "portal_return" | null;

const LANDING_SECONDS = 5;

export default function UpgradeCheckout(props: {
  from: string;
  initialIsPro: boolean;
  billingFlash: BillingFlash;
  initialInterval?: "monthly" | "annual";
  showProductLanding: boolean;
  productTargets: Pick<ProductTarget, "app" | "label" | "baseUrl">[];
}) {
  const {
    from,
    initialIsPro,
    billingFlash,
    initialInterval,
    showProductLanding,
    productTargets,
  } = props;

  const [interval, setInterval] = useState<Interval>(initialInterval ?? "monthly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [landingPhase, setLandingPhase] = useState(showProductLanding);
  const [countdown, setCountdown] = useState(LANDING_SECONDS);
  const intentLogged = useRef(false);
  const timerRef = useRef<number | null>(null);
  const checkoutStartedRef = useRef(false);

  const trefolio = productTargets.find((t) => t.app === "trefolio");
  const clara = productTargets.find((t) => t.app === "clara");
  const will = productTargets.find((t) => t.app === "will");
  const fromApp = parseFromApp(from);
  const fromCss = upgradeFromCssClass(fromApp);
  const originProduct = productTargets.find((t) => t.app === from) ?? trefolio;

  const landingBullets = useMemo(() => getUpgradeBullets(fromApp), [fromApp]);
  const successOrder = useMemo(() => getSuccessStepOrder(fromApp), [fromApp]);
  const checkoutFootnote = useMemo(() => getCheckoutFootnote(fromApp), [fromApp]);

  const logIntent = useCallback(async () => {
    if (intentLogged.current) return;
    intentLogged.current = true;
    try {
      await fetch("/api/billing/log-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ from, interval }),
      });
    } catch {
      /* non-blocking */
    }
  }, [from, interval]);

  useEffect(() => {
    if (!landingPhase || billingFlash) return;
    void logIntent();
  }, [landingPhase, billingFlash, logIntent]);

  useEffect(() => {
    if (!landingPhase || billingFlash) return;

    const handle = window.setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          window.clearInterval(handle);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    timerRef.current = handle;

    return () => {
      window.clearInterval(handle);
      timerRef.current = null;
    };
  }, [landingPhase, billingFlash]);

  const startCheckout = useCallback(
    async (fromAuto?: boolean) => {
      setError(null);
      setLoading(true);
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ interval, from }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          url?: string;
          error?: string;
          message?: string;
        };
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
        if (!fromAuto) setLoading(false);
      }
    },
    [interval, from],
  );

  useEffect(() => {
    if (!landingPhase || billingFlash) return;
    if (countdown !== 0 || checkoutStartedRef.current) return;
    checkoutStartedRef.current = true;
    setLandingPhase(false);
    void startCheckout(true);
  }, [countdown, landingPhase, billingFlash, startCheckout]);

  const skipLanding = useCallback(() => {
    if (checkoutStartedRef.current) return;
    const h = timerRef.current;
    if (h != null) window.clearInterval(h);
    timerRef.current = null;
    checkoutStartedRef.current = true;
    setLandingPhase(false);
    void startCheckout(false);
  }, [startCheckout]);

  const priceLabel = useMemo(
    () =>
      interval === "annual"
        ? "€59.99 / year (save vs monthly)"
        : "€7.99 / month",
    [interval],
  );

  if (billingFlash === "portal_return") {
    return (
      <div className={`upgrade-stack ${fromCss}`}>
        <div className="flash flash-success" role="status">
          You returned from the billing portal. Changes may take a few seconds to sync across apps.
        </div>
        <p className="fine-print">
          <Link href={originProduct?.baseUrl ?? "/"} className="link-muted">
            Back to {originProduct?.label ?? "app"}
          </Link>
        </p>
      </div>
    );
  }

  if (billingFlash === "success") {
    const successLine = (app: FromApp) => {
      switch (app) {
        case "trefolio":
          return (
            <>
              Open <strong>trefolio</strong> and sign in with this account — your portfolio limits upgrade immediately.
            </>
          );
        case "clara":
          return (
            <>
              <strong>Clara</strong> — higher AI agent limits for financial workflows; sign in with the same trefolio
              identity.
            </>
          );
        case "will":
          return (
            <>
              <strong>Will</strong> — notes and AI quota scale with Pro; use the same login.
            </>
          );
      }
    };
    return (
      <div className={`upgrade-stack ${fromCss}`} style={{ textAlign: "left" }}>
        <div className="flash flash-success" role="status">
          <strong>Welcome to Pro.</strong> Your subscription is active. Entitlements sync automatically when you open
          each app.
        </div>
        <section style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: 12 }}>Where to go next</h2>
          <ol style={{ paddingLeft: 20, lineHeight: 1.7, color: "var(--muted, #64748b)" }}>
            {successOrder.map((app) => (
              <li key={app}>{successLine(app)}</li>
            ))}
          </ol>
        </section>
        <div className="upgrade-product-links" style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
          {trefolio ? (
            <a className="btn-secondary" href={trefolio.baseUrl} target="_blank" rel="noopener noreferrer">
              Open trefolio
            </a>
          ) : null}
          {clara ? (
            <a className="btn-secondary" href={clara.baseUrl} target="_blank" rel="noopener noreferrer">
              Open Clara
            </a>
          ) : null}
          {will ? (
            <a className="btn-secondary" href={will.baseUrl} target="_blank" rel="noopener noreferrer">
              Open Will
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  if (billingFlash === "cancelled") {
    return (
      <div className={`upgrade-stack ${fromCss}`}>
        <div className="flash flash-muted" role="status">
          Checkout cancelled. You can subscribe anytime from this page.
        </div>
        <button type="button" className="btn-primary-lg" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  if (initialIsPro) {
    return (
      <div className={`upgrade-stack ${fromCss}`}>
        <div className="flash flash-success" role="status">
          Your account already has Pro. Enjoy Warren, Clara, and Will with higher limits.
        </div>
        <p className="fine-print">
          Manage billing from your app&apos;s subscription section or open the{" "}
          <a href={`/api/billing/portal?from=${encodeURIComponent(from)}`}>customer portal</a>.
        </p>
      </div>
    );
  }

  if (landingPhase) {
    return (
      <div className={`upgrade-stack ${fromCss}`}>
        <section className="upgrade-landing-accent" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "1.15rem", marginBottom: 8 }}>{getLandingBenefitsHeading(fromApp)}</h2>
          <p style={{ margin: "0 0 12px", fontSize: "0.95rem", color: "var(--text-muted, #475569)" }}>
            {getLandingBenefitsSub(fromApp)}
          </p>
          <ul style={{ paddingLeft: 20, lineHeight: 1.65, color: "var(--muted, #475569)", margin: 0 }}>
            {landingBullets.map((b) => (
              <li key={b.id}>
                <strong>{b.title}</strong> — {b.body}
              </li>
            ))}
          </ul>
        </section>

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

        <div
          style={{
            margin: "20px 0",
            padding: "16px",
            borderRadius: 12,
            border: "1px dashed var(--border, #cbd5e1)",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "2rem", fontWeight: 700, margin: 0 }}>
            {countdown > 0 ? countdown : "…"}
          </p>
          <p style={{ margin: "8px 0 0", fontSize: "0.9rem", color: "#64748b" }}>
            Continuing to secure Stripe checkout{countdown > 0 ? ` in ${countdown}s` : ""}…
          </p>
          <button type="button" className="btn-secondary" style={{ marginTop: 12 }} onClick={skipLanding}>
            Continue now
          </button>
        </div>

        {loading ? <p className="fine-print">Opening Stripe…</p> : null}
        {error ? (
          <p className="error-text" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`upgrade-stack ${fromCss}`}>
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
        disabled={loading}
        onClick={() => void startCheckout()}
      >
        {loading ? "Opening Stripe…" : "Continue to secure checkout"}
      </button>

      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}

      <p className="fine-print">{checkoutFootnote}</p>
    </div>
  );
}
