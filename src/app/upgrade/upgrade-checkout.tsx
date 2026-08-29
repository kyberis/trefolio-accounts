"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ProductTarget } from "@/lib/product-links";
import {
  IDP_PLAN_RANK,
  PLAN_PRICE_LABEL,
  planDisplayName,
  resolveCheckoutAction,
  type IdpPlan,
  type PaidIdpPlan,
} from "@/lib/idp-plan";
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

export default function UpgradeCheckout(props: {
  from: string;
  currentPlan: IdpPlan;
  targetPlan: PaidIdpPlan;
  hasActiveStripe: boolean;
  billingFlash: BillingFlash;
  initialInterval?: "monthly" | "annual";
  showProductLanding: boolean;
  productTargets: Pick<ProductTarget, "app" | "label" | "baseUrl">[];
}) {
  const {
    from,
    currentPlan,
    targetPlan,
    hasActiveStripe,
    billingFlash,
    initialInterval,
    showProductLanding,
    productTargets,
  } = props;

  const [interval, setInterval] = useState<Interval>(initialInterval ?? "monthly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [landingPhase, setLandingPhase] = useState(showProductLanding);
  const intentLogged = useRef(false);

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

  const startCheckout = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ interval, from, plan: targetPlan }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
        message?: string;
        hint?: string;
      };
      if (!res.ok) {
        if (data.error === "already_pro" || data.error === "already_on_plan") {
          setError(`You already have ${planDisplayName(targetPlan)}. Open the billing portal to manage it.`);
        } else if (data.error === "already_on_higher_plan") {
          setError("You are already on a higher plan. Use the billing portal to change or cancel.");
        } else if (data.hint) {
          setError(`${data.message || data.error || "Checkout failed"}\n\n${data.hint}`);
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
  }, [interval, from, targetPlan]);

  const continueToCheckout = useCallback(() => {
    if (landingPhase) {
      setLandingPhase(false);
    }
    void startCheckout();
  }, [landingPhase, startCheckout]);

  const priceLabel = useMemo(
    () => PLAN_PRICE_LABEL[targetPlan][interval],
    [interval, targetPlan],
  );
  const checkoutDecision = resolveCheckoutAction({
    currentPlan,
    targetPlan,
    hasActiveStripeSubscription: hasActiveStripe,
  });
  const isProratedUpgrade = checkoutDecision.action === "prorate_update";
  const atMaxPaid = currentPlan === "wealth" && hasActiveStripe;

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
              Open <strong>trefolio</strong> and sign in with this account — your plan applies immediately.
              Clara and Will pick up the same tier and per-day AI caps.
            </>
          );
        case "clara":
          return (
            <>
              <strong>Clara</strong> — your paid plan raises the per-day agent cap versus Free. Sign in with the same
              trefolio identity. Will and trefolio use the same subscription.
            </>
          );
        case "will":
          return (
            <>
              <strong>Will</strong> — your paid plan raises the per-day AI cap versus Free on Telegram and the web
              journal. Use the same login. Clara and trefolio use the same subscription.
            </>
          );
      }
    };
    return (
      <div className={`upgrade-stack ${fromCss}`} style={{ textAlign: "left" }}>
        <div className="flash flash-success" role="status">
          <strong>Welcome to {planDisplayName(targetPlan)}.</strong> Your subscription is active. Entitlements sync
          automatically when you open each app.
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
          Subscribe again
        </button>
      </div>
    );
  }

  if (atMaxPaid) {
    return (
      <div className={`upgrade-stack ${fromCss}`}>
        <div className="flash flash-success" role="status">
          Your account is already on Wealth · Ultra — the highest plan.
        </div>
        <p className="fine-print">
          Manage billing from your app&apos;s subscription section or open the{" "}
          <a href={`/api/billing/portal?from=${encodeURIComponent(from)}`}>customer portal</a>.
        </p>
      </div>
    );
  }

  if (checkoutDecision.action === "reject") {
    return (
      <div className={`upgrade-stack ${fromCss}`}>
        <div className="flash flash-success" role="status">
          Your account is already on {planDisplayName(currentPlan)}.
          {IDP_PLAN_RANK.wealth > IDP_PLAN_RANK[currentPlan]
            ? " Choose a higher plan from trefolio to upgrade."
            : ""}
        </div>
        <p className="fine-print">
          Manage billing from your app&apos;s subscription section or open the{" "}
          <a href={`/api/billing/portal?from=${encodeURIComponent(from)}`}>customer portal</a>.
        </p>
      </div>
    );
  }

  return (
    <div className={`upgrade-stack ${fromCss}`}>
      {landingPhase ? (
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

      <p className="price-tag">
        {planDisplayName(targetPlan)} — {priceLabel}
      </p>

      {isProratedUpgrade ? (
        <p className="fine-print" data-testid="proration-note">
          You are switching from {planDisplayName(currentPlan)} to {planDisplayName(targetPlan)}.
          Stripe charges the new price for the rest of this period and credits unused time on{" "}
          {planDisplayName(currentPlan)} on the same invoice — not a separate cash refund.
        </p>
      ) : null}

      <button type="button" className="btn-primary-lg" disabled={loading} onClick={() => void continueToCheckout()}>
        {loading
          ? isProratedUpgrade
            ? "Updating subscription…"
            : "Opening Stripe…"
          : isProratedUpgrade
            ? `Switch to ${planDisplayName(targetPlan)}`
            : "Continue to secure checkout"}
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
