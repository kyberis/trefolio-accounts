export const IDP_PLANS = ["free", "basic", "pro", "wealth"] as const;
export type IdpPlan = (typeof IDP_PLANS)[number];
export type PaidIdpPlan = Exclude<IdpPlan, "free">;
export type BillingInterval = "monthly" | "annual";

export const IDP_PLAN_RANK: Record<IdpPlan, number> = {
  free: 0,
  basic: 1,
  pro: 2,
  wealth: 3,
};

const PLAN_SET = new Set<string>(IDP_PLANS);

/** Coerce stored / metadata / import values. Legacy `starter` maps to Pro. */
export function parseIdpPlan(value: unknown): IdpPlan {
  if (value === "starter") return "pro";
  if (value === "ultra") return "wealth";
  if (typeof value === "string" && PLAN_SET.has(value)) return value as IdpPlan;
  return "free";
}

export function isPaidIdpPlan(plan: IdpPlan): plan is PaidIdpPlan {
  return plan !== "free";
}

export function parsePaidIdpPlan(value: unknown): PaidIdpPlan {
  const plan = parseIdpPlan(value);
  return isPaidIdpPlan(plan) ? plan : "pro";
}

export function effectiveIdpPlan(
  plan: unknown,
  proUntil: string | Date | null | undefined,
  now: Date = new Date(),
): IdpPlan {
  const tier = parseIdpPlan(plan);
  if (tier === "free") return "free";
  if (!proUntil) return tier;
  const until = proUntil instanceof Date ? proUntil : new Date(proUntil);
  if (Number.isNaN(until.getTime())) return tier;
  return until.getTime() > now.getTime() ? tier : "free";
}

export function planDisplayName(plan: IdpPlan): string {
  switch (plan) {
    case "free":
      return "Free";
    case "basic":
      return "Basic";
    case "pro":
      return "Pro";
    case "wealth":
      return "Wealth · Ultra";
  }
}

export function trefolioProClaim(plan: IdpPlan): boolean {
  return IDP_PLAN_RANK[plan] >= IDP_PLAN_RANK.pro;
}

export function claraDailyLimit(plan: IdpPlan): number {
  switch (plan) {
    case "free":
    case "basic":
      return 30;
    case "pro":
      return 200;
    case "wealth":
      return 500;
  }
}

export function willDailyLimit(plan: IdpPlan): number {
  switch (plan) {
    case "free":
      return 3;
    case "basic":
      return 30;
    case "pro":
      return 200;
    case "wealth":
      return 500;
  }
}

export function entitlementClaims(plan: IdpPlan): {
  trefolio_pro: boolean;
  trefolio_plan: IdpPlan;
  clara_daily_limit: number;
  will_daily_limit: number;
} {
  return {
    trefolio_pro: trefolioProClaim(plan),
    trefolio_plan: plan,
    clara_daily_limit: claraDailyLimit(plan),
    will_daily_limit: willDailyLimit(plan),
  };
}

/** Env keys that map to a paid Stripe Price (same Stripe account as Warren). */
export const STRIPE_PRICE_ENV: Record<PaidIdpPlan, Record<BillingInterval, readonly string[]>> = {
  basic: {
    monthly: ["STRIPE_PRICE_BASIC_MONTHLY"],
    annual: ["STRIPE_PRICE_BASIC_ANNUAL"],
  },
  pro: {
    monthly: ["STRIPE_PRICE_PRO_MONTHLY", "STRIPE_PRICE_ID_PRO_MONTHLY"],
    annual: ["STRIPE_PRICE_PRO_ANNUAL", "STRIPE_PRICE_ID_PRO_ANNUAL"],
  },
  wealth: {
    monthly: ["STRIPE_PRICE_WEALTH_MONTHLY"],
    annual: ["STRIPE_PRICE_WEALTH_ANNUAL"],
  },
};

export function planFromConfiguredPriceId(
  priceId: string | undefined,
  configured: Partial<Record<PaidIdpPlan, Partial<Record<BillingInterval, string>>>>,
  metadataPlan?: string,
): IdpPlan {
  const fromMeta = parseIdpPlan(metadataPlan);
  if (fromMeta !== "free") return fromMeta;
  if (!priceId) return "pro";
  for (const plan of ["basic", "pro", "wealth"] as const) {
    for (const interval of ["monthly", "annual"] as const) {
      if (configured[plan]?.[interval] === priceId) return plan;
    }
  }
  return "pro";
}

export type CheckoutAction =
  | { action: "reject"; error: "already_on_plan" | "already_on_higher_plan" }
  | { action: "checkout" }
  | { action: "prorate_update" };

/**
 * Free / trial (no Stripe) → Checkout.
 * Active Stripe subscription + higher target → update the existing sub with prorations.
 * Same or lower paid target on an active sub → reject (portal for downgrades).
 */
export function resolveCheckoutAction(args: {
  currentPlan: IdpPlan;
  targetPlan: PaidIdpPlan;
  hasActiveStripeSubscription: boolean;
}): CheckoutAction {
  const { currentPlan, targetPlan, hasActiveStripeSubscription } = args;
  if (!hasActiveStripeSubscription) return { action: "checkout" };

  const currentRank = IDP_PLAN_RANK[currentPlan];
  const targetRank = IDP_PLAN_RANK[targetPlan];
  if (targetRank > currentRank) return { action: "prorate_update" };
  if (targetRank === currentRank) return { action: "reject", error: "already_on_plan" };
  return { action: "reject", error: "already_on_higher_plan" };
}

export const PLAN_PRICE_LABEL: Record<PaidIdpPlan, Record<BillingInterval, string>> = {
  basic: { monthly: "€4.99 / month", annual: "€49 / year" },
  pro: { monthly: "€9.99 / month", annual: "€89 / year" },
  wealth: { monthly: "€24.99 / month", annual: "€199 / year" },
};
