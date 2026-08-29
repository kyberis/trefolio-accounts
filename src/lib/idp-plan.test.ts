import { describe, expect, it } from "vitest";

import {
  entitlementClaims,
  parseIdpPlan,
  parsePaidIdpPlan,
  effectiveIdpPlan,
  planFromConfiguredPriceId,
  resolveCheckoutAction,
  trefolioProClaim,
} from "./idp-plan";

describe("parseIdpPlan", () => {
  it("accepts four tiers and maps starter → pro", () => {
    expect(parseIdpPlan("basic")).toBe("basic");
    expect(parseIdpPlan("wealth")).toBe("wealth");
    expect(parseIdpPlan("ultra")).toBe("wealth");
    expect(parseIdpPlan("starter")).toBe("pro");
    expect(parseIdpPlan("nope")).toBe("free");
  });
});

describe("parsePaidIdpPlan", () => {
  it("defaults invalid values to pro for checkout", () => {
    expect(parsePaidIdpPlan("basic")).toBe("basic");
    expect(parsePaidIdpPlan("free")).toBe("pro");
    expect(parsePaidIdpPlan(undefined)).toBe("pro");
  });
});

describe("effectiveIdpPlan", () => {
  it("keeps a paid plan when pro_until is open-ended or in the future", () => {
    expect(effectiveIdpPlan("basic", null)).toBe("basic");
    expect(effectiveIdpPlan("pro", new Date(Date.now() + 60_000).toISOString())).toBe("pro");
  });

  it("falls back to free after expiry", () => {
    expect(effectiveIdpPlan("pro", new Date(Date.now() - 60_000).toISOString())).toBe("free");
  });
});

describe("entitlementClaims", () => {
  it("treats Pro and Wealth as trefolio_pro; Basic is paid but not Pro", () => {
    expect(trefolioProClaim("basic")).toBe(false);
    expect(entitlementClaims("basic")).toMatchObject({
      trefolio_pro: false,
      trefolio_plan: "basic",
      clara_daily_limit: 30,
      will_daily_limit: 30,
    });
    expect(entitlementClaims("wealth")).toMatchObject({
      trefolio_pro: true,
      trefolio_plan: "wealth",
      clara_daily_limit: 500,
      will_daily_limit: 500,
    });
  });
});

describe("planFromConfiguredPriceId", () => {
  const prices = {
    basic: { monthly: "price_basic_m", annual: "price_basic_a" },
    pro: { monthly: "price_pro_m", annual: "price_pro_a" },
    wealth: { monthly: "price_wealth_m", annual: "price_wealth_a" },
  };

  it("prefers metadata, then the configured price id", () => {
    expect(planFromConfiguredPriceId("price_basic_m", prices, "wealth")).toBe("wealth");
    expect(planFromConfiguredPriceId("price_wealth_a", prices)).toBe("wealth");
    expect(planFromConfiguredPriceId("price_unknown", prices)).toBe("pro");
  });
});

describe("resolveCheckoutAction", () => {
  it("opens Checkout when there is no active Stripe subscription", () => {
    expect(
      resolveCheckoutAction({
        currentPlan: "basic",
        targetPlan: "pro",
        hasActiveStripeSubscription: false,
      }),
    ).toEqual({ action: "checkout" });
    expect(
      resolveCheckoutAction({
        currentPlan: "pro",
        targetPlan: "pro",
        hasActiveStripeSubscription: false,
      }),
    ).toEqual({ action: "checkout" });
  });

  it("updates the existing subscription with prorations on an upgrade", () => {
    expect(
      resolveCheckoutAction({
        currentPlan: "basic",
        targetPlan: "pro",
        hasActiveStripeSubscription: true,
      }),
    ).toEqual({ action: "prorate_update" });
    expect(
      resolveCheckoutAction({
        currentPlan: "basic",
        targetPlan: "wealth",
        hasActiveStripeSubscription: true,
      }),
    ).toEqual({ action: "prorate_update" });
    expect(
      resolveCheckoutAction({
        currentPlan: "pro",
        targetPlan: "wealth",
        hasActiveStripeSubscription: true,
      }),
    ).toEqual({ action: "prorate_update" });
  });

  it("rejects same-plan and downgrade on an active subscription", () => {
    expect(
      resolveCheckoutAction({
        currentPlan: "basic",
        targetPlan: "basic",
        hasActiveStripeSubscription: true,
      }),
    ).toEqual({ action: "reject", error: "already_on_plan" });
    expect(
      resolveCheckoutAction({
        currentPlan: "wealth",
        targetPlan: "pro",
        hasActiveStripeSubscription: true,
      }),
    ).toEqual({ action: "reject", error: "already_on_higher_plan" });
  });
});
