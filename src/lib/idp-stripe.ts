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

/** Trim + strip zero-width / BOM that sometimes sneak in from copy-paste in Vercel. */
export function sanitizeStripeId(value: string): string {
  return value
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/^['"]+|['"]+$/g, "");
}

export function getStripeProPriceId(interval: "monthly" | "annual"): string {
  const envKey =
    interval === "annual" ? "STRIPE_PRICE_PRO_ANNUAL" : "STRIPE_PRICE_PRO_MONTHLY";
  return sanitizeStripeId(process.env[envKey] ?? "");
}

/** For operator hints only (never log full keys). */
export function stripeSecretKeyMode(): "live" | "test" | "unknown" {
  const k = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (k.startsWith("sk_live")) return "live";
  if (k.startsWith("sk_test")) return "test";
  return "unknown";
}
