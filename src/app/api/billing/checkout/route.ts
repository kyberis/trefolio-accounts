import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import type Stripe from "stripe";

import {
  findUserBySub,
  getEntitlement,
  getStripeCustomerBySub,
  setPlan,
  upsertStripeCustomerRow,
} from "@/lib/db";
import {
  getConfiguredStripePrices,
  getIdpStripe,
  getStripePriceId,
  stripeSecretKeyMode,
} from "@/lib/idp-stripe";
import {
  IDP_PLAN_RANK,
  effectiveIdpPlan,
  parsePaidIdpPlan,
  planFromConfiguredPriceId,
  resolveCheckoutAction,
  type BillingInterval,
  type PaidIdpPlan,
} from "@/lib/idp-plan";
import { getRequestPublicIssuer } from "@/lib/public-url";
import { IDP_SESSION_COOKIE, verifySession } from "@/lib/session";
import {
  accountsAuthProbeLog,
  accountsAuthProbeWarn,
  subTail,
} from "@/lib/auth-probe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseBody(raw: unknown): { interval: BillingInterval; from: string; plan: PaidIdpPlan } {
  if (!raw || typeof raw !== "object") {
    return { interval: "monthly", from: "clara", plan: "pro" };
  }
  const o = raw as Record<string, unknown>;
  const interval: BillingInterval = o.interval === "annual" ? "annual" : "monthly";
  const from =
    typeof o.from === "string" && o.from.trim()
      ? o.from.trim().slice(0, 32)
      : "clara";
  return { interval, from, plan: parsePaidIdpPlan(o.plan) };
}

async function loadActiveSubscription(
  stripe: Stripe,
  sub: string,
): Promise<Stripe.Subscription | null> {
  const row = await getStripeCustomerBySub(sub);
  if (!row?.stripe_subscription_id) return null;
  try {
    const existing = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
    if (existing.status === "active" || existing.status === "trialing") return existing;
    return null;
  } catch {
    return null;
  }
}

/**
 * POST /api/billing/checkout
 * New subscribers: Stripe Checkout Session.
 * Existing paid subscribers upgrading: update the subscription and invoice the prorated difference.
 */
export async function POST(req: NextRequest) {
  const inbound = req.headers;
  const jar = await cookies();
  const sub = verifySession(jar.get(IDP_SESSION_COOKIE)?.value);
  if (!sub) {
    accountsAuthProbeWarn(
      "billing.checkout.unauthorized",
      {
        reason: "no_idp_session_cookie",
      },
      inbound,
    );
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }

  let json: unknown = {};
  try {
    json = await req.json();
  } catch {
    /* optional body */
  }
  const { interval, from, plan } = parseBody(json);

  accountsAuthProbeLog(
    "billing.checkout.accepted",
    {
      subTail: subTail(sub),
      interval,
      from,
      plan,
      stripeKeyMode: stripeSecretKeyMode(),
      publicIssuerHost: (() => {
        try {
          return new URL(getRequestPublicIssuer(req)).host;
        } catch {
          return undefined;
        }
      })(),
    },
    inbound,
  );

  const user = await findUserBySub(sub);
  if (!user) {
    accountsAuthProbeWarn(
      "billing.checkout.no_user_row",
      {
        subTail: subTail(sub),
      },
      inbound,
    );
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const priceId = getStripePriceId(plan, interval);
  if (!priceId) {
    accountsAuthProbeWarn(
      "billing.checkout.not_configured",
      {
        subTail: subTail(sub),
        interval,
        plan,
      },
      inbound,
    );
    return NextResponse.json(
      { error: "billing_not_configured", message: "Stripe price IDs are not set on this server." },
      { status: 501 },
    );
  }

  try {
    const stripe = getIdpStripe();
    const origin = getRequestPublicIssuer(req);
    const successUrl = `${origin}/upgrade?billing=success&from=${encodeURIComponent(from)}&plan=${encodeURIComponent(plan)}`;
    const cancelUrl = `${origin}/upgrade?billing=cancelled&from=${encodeURIComponent(from)}&plan=${encodeURIComponent(plan)}`;

    const activeSub = await loadActiveSubscription(stripe, sub);
    const ent = await getEntitlement(sub);
    const entPlan = effectiveIdpPlan(ent.plan, ent.pro_until);
    const stripePlan = activeSub
      ? planFromConfiguredPriceId(
          activeSub.items?.data?.[0]?.price?.id,
          getConfiguredStripePrices(),
          typeof activeSub.metadata?.plan === "string" ? activeSub.metadata.plan : undefined,
        )
      : "free";
    const currentPlan = IDP_PLAN_RANK[stripePlan] >= IDP_PLAN_RANK[entPlan] ? stripePlan : entPlan;
    const decision = resolveCheckoutAction({
      currentPlan,
      targetPlan: plan,
      hasActiveStripeSubscription: Boolean(activeSub),
    });

    if (decision.action === "reject") {
      accountsAuthProbeLog(
        "billing.checkout.rejected",
        {
          subTail: subTail(sub),
          from,
          plan,
          currentPlan,
          error: decision.error,
        },
        inbound,
      );
      const message =
        decision.error === "already_on_plan"
          ? `You already have an active ${plan} subscription.`
          : "Use the billing portal to downgrade. Upgrades are applied on this page.";
      return NextResponse.json(
        {
          error: decision.error,
          message,
          ...(plan === "pro" && decision.error === "already_on_plan" ? { alias: "already_pro" } : {}),
        },
        { status: 409 },
      );
    }

    let existing = await getStripeCustomerBySub(sub);
    let customerId = existing?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: user.name || undefined,
        metadata: { sub },
      });
      customerId = customer.id;
      await upsertStripeCustomerRow({
        sub,
        stripeCustomerId: customerId,
      });
    }

    try {
      await stripe.prices.retrieve(priceId);
    } catch (retrieveErr: unknown) {
      const msg = retrieveErr instanceof Error ? retrieveErr.message : String(retrieveErr);
      console.error("[billing/checkout] price retrieve failed", priceId, msg);
      if (msg.includes("No such price") || msg.toLowerCase().includes("resource_missing")) {
        const mode = stripeSecretKeyMode();
        const hint =
          `Stripe API key mode looks like "${mode}". ` +
          `The Price ID must exist in that same Stripe account and mode (test vs live). ` +
          `On the trefolio-accounts Vercel project, set STRIPE_PRICE_* for Basic / Pro / Wealth ` +
          `to prices that belong to STRIPE_SECRET_KEY.`;
        accountsAuthProbeWarn(
          "billing.checkout.price_not_found",
          {
            subTail: subTail(sub),
            interval,
            from,
            plan,
            priceIdSuffix: priceId.slice(-12),
            msgPreview: msg.slice(0, 200),
          },
          inbound,
        );
        return NextResponse.json(
          { error: "stripe_price_not_found", message: msg, hint },
          { status: 502 },
        );
      }
      throw retrieveErr;
    }

    if (decision.action === "prorate_update" && activeSub) {
      const itemId = activeSub.items.data[0]?.id;
      if (!itemId) {
        return NextResponse.json({ error: "checkout_failed", message: "Subscription has no items." }, { status: 500 });
      }

      accountsAuthProbeLog(
        "billing.checkout.prorate_begin",
        {
          subTail: subTail(sub),
          interval,
          from,
          plan,
          fromPlan: currentPlan,
        },
        inbound,
      );

      const updated = await stripe.subscriptions.update(activeSub.id, {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: "always_invoice",
        payment_behavior: "error_if_incomplete",
        metadata: {
          sub,
          plan,
          interval,
          from,
        },
      });

      const currentPeriodEnd = new Date(updated.current_period_end * 1000);
      await upsertStripeCustomerRow({
        sub,
        stripeCustomerId: customerId,
        stripeSubscriptionId: updated.id,
        currentPeriodEnd,
        cancelAtPeriodEnd: updated.cancel_at_period_end ?? false,
      });
      await setPlan(sub, plan, currentPeriodEnd.toISOString(), "stripe");

      accountsAuthProbeLog(
        "billing.checkout.prorate_ok",
        {
          subTail: subTail(sub),
          interval,
          plan,
          subscriptionIdSuffix: updated.id.slice(-12),
        },
        inbound,
      );

      return NextResponse.json({
        url: successUrl,
        mode: "prorated_upgrade",
        plan,
        fromPlan: currentPlan,
      });
    }

    accountsAuthProbeLog(
      "billing.checkout.stripe_create_begin",
      {
        subTail: subTail(sub),
        interval,
        from,
        plan,
        hasStripeCustomerId: Boolean(customerId),
      },
      inbound,
    );

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: sub,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        sub,
        plan,
        interval,
        from,
      },
      subscription_data: {
        metadata: {
          sub,
          plan,
          interval,
          from,
        },
      },
    });

    if (!checkout.url) {
      accountsAuthProbeWarn(
        "billing.checkout.empty_checkout_url",
        {
          subTail: subTail(sub),
          sessionIdSuffix: checkout.id?.slice(-12),
        },
        inbound,
      );
      return NextResponse.json({ error: "checkout_failed" }, { status: 500 });
    }

    accountsAuthProbeLog(
      "billing.checkout.stripe_create_ok",
      {
        subTail: subTail(sub),
        interval,
        plan,
        sessionIdSuffix: checkout.id.slice(-12),
      },
      inbound,
    );

    return NextResponse.json({ url: checkout.url, mode: "checkout", plan });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[billing/checkout]", msg);
    accountsAuthProbeWarn(
      "billing.checkout.stripe_error",
      {
        subTail: subTail(sub),
        interval,
        from,
        plan,
        msgPreview: msg.slice(0, 280),
      },
      inbound,
    );
    if (msg.includes("STRIPE_SECRET_KEY")) {
      return NextResponse.json({ error: "stripe_not_configured" }, { status: 501 });
    }
    if (msg.includes("No such price")) {
      const mode = stripeSecretKeyMode();
      const hint =
        `Stripe API key mode looks like "${mode}". ` +
        `The Price ID must exist in that same Stripe account and mode (test vs live). ` +
        `On the trefolio-accounts Vercel project, set STRIPE_PRICE_* to prices created under the account that owns STRIPE_SECRET_KEY.`;
      return NextResponse.json(
        { error: "stripe_price_not_found", message: msg, hint },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: "checkout_failed", message: msg }, { status: 500 });
  }
}
