import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  findUserBySub,
  getEntitlement,
  getStripeCustomerBySub,
  upsertStripeCustomerRow,
} from "@/lib/db";
import {
  getIdpStripe,
  getStripeProPriceId,
  stripeSecretKeyMode,
} from "@/lib/idp-stripe";
import { getRequestPublicIssuer } from "@/lib/public-url";
import { IDP_SESSION_COOKIE, verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Interval = "monthly" | "annual";

function parseBody(raw: unknown): { interval: Interval; from: string } {
  if (!raw || typeof raw !== "object") return { interval: "monthly", from: "clara" };
  const o = raw as Record<string, unknown>;
  const interval: Interval = o.interval === "annual" ? "annual" : "monthly";
  const from =
    typeof o.from === "string" && o.from.trim()
      ? o.from.trim().slice(0, 32)
      : "clara";
  return { interval, from };
}

/**
 * POST /api/billing/checkout
 * Creates a Stripe Checkout Session (subscription). Requires IdP session cookie.
 */
export async function POST(req: NextRequest) {
  const jar = await cookies();
  const sub = verifySession(jar.get(IDP_SESSION_COOKIE)?.value);
  if (!sub) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }

  let json: unknown = {};
  try {
    json = await req.json();
  } catch {
    /* optional body */
  }
  const { interval, from } = parseBody(json);

  const user = await findUserBySub(sub);
  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const ent = await getEntitlement(sub);
  const alreadyPro =
    ent.plan === "pro" && (!ent.pro_until || new Date(ent.pro_until) > new Date());
  if (alreadyPro) {
    return NextResponse.json(
      { error: "already_pro", message: "You already have an active Pro subscription." },
      { status: 409 },
    );
  }

  const priceId = getStripeProPriceId(interval);
  if (!priceId) {
    return NextResponse.json(
      { error: "billing_not_configured", message: "Stripe price IDs are not set on this server." },
      { status: 501 },
    );
  }

  try {
    const stripe = getIdpStripe();
    const origin = getRequestPublicIssuer(req);

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

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: sub,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/upgrade?billing=success&from=${encodeURIComponent(from)}`,
      cancel_url: `${origin}/upgrade?billing=cancelled&from=${encodeURIComponent(from)}`,
      metadata: {
        sub,
        plan: "pro",
        interval,
        from,
      },
      subscription_data: {
        metadata: {
          sub,
          plan: "pro",
          interval,
          from,
        },
      },
    });

    if (!checkout.url) {
      return NextResponse.json({ error: "checkout_failed" }, { status: 500 });
    }

    return NextResponse.json({ url: checkout.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[billing/checkout]", msg);
    if (msg.includes("STRIPE_SECRET_KEY")) {
      return NextResponse.json({ error: "stripe_not_configured" }, { status: 501 });
    }
    if (msg.includes("No such price")) {
      const mode = stripeSecretKeyMode();
      const hint =
        `Stripe API key mode looks like "${mode}". ` +
        `The Price ID must exist in that same Stripe account and mode (test vs live). ` +
        `On the trefolio-accounts Vercel project, set STRIPE_PRICE_PRO_MONTHLY / STRIPE_PRICE_PRO_ANNUAL to prices created under the account that owns STRIPE_SECRET_KEY.`;
      return NextResponse.json(
        { error: "stripe_price_not_found", message: msg, hint },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: "checkout_failed", message: msg }, { status: 500 });
  }
}
