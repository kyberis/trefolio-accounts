import Stripe from "stripe";

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

export function getStripeProPriceId(interval: "monthly" | "annual"): string {
  const envKey =
    interval === "annual" ? "STRIPE_PRICE_PRO_ANNUAL" : "STRIPE_PRICE_PRO_MONTHLY";
  return (process.env[envKey] ?? "").trim();
}
