import Stripe from "stripe";

import {
  STRIPE_PRICE_ENV,
  type BillingInterval,
  type PaidIdpPlan,
} from "@/lib/idp-plan";

let _stripe: Stripe | null = null;

/**
 * Stripe client for IdP billing (same Stripe account / Price IDs as Warren).
 */
export function getIdpStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  _stripe = new Stripe(key, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });
  return _stripe;
}

/** Trim + strip zero-width / BOM that sometimes sneak in from copy-paste in Vercel. */
export function sanitizeStripeId(value: string): string {
  return value
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/^['"]+|['"]+$/g, "");
}

export function getStripePriceId(plan: PaidIdpPlan, interval: BillingInterval): string {
  for (const envKey of STRIPE_PRICE_ENV[plan][interval]) {
    const id = sanitizeStripeId(process.env[envKey] ?? "");
    if (id) return id;
  }
  return "";
}

export function getStripeProPriceId(interval: "monthly" | "annual"): string {
  return getStripePriceId("pro", interval);
}

/** All configured Price IDs, for webhook → plan mapping. */
export function getConfiguredStripePrices(): Partial<
  Record<PaidIdpPlan, Partial<Record<BillingInterval, string>>>
> {
  const out: Partial<Record<PaidIdpPlan, Partial<Record<BillingInterval, string>>>> = {};
  for (const plan of ["basic", "pro", "wealth"] as const) {
    for (const interval of ["monthly", "annual"] as const) {
      const id = getStripePriceId(plan, interval);
      if (!id) continue;
      out[plan] ??= {};
      out[plan]![interval] = id;
    }
  }
  return out;
}

/** For operator hints only (never log full keys). */
export function stripeSecretKeyMode(): "live" | "test" | "unknown" {
  const k = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (k.startsWith("sk_live")) return "live";
  if (k.startsWith("sk_test")) return "test";
  return "unknown";
}
