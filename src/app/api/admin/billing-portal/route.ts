import { NextRequest, NextResponse } from "next/server";

import { getStripeCustomerBySub } from "@/lib/db";
import { getIdpAdmin } from "@/lib/admin";
import { getIdpStripe } from "@/lib/idp-stripe";
import { getRequestPublicIssuer } from "@/lib/public-url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Admin-only: open Stripe Billing Portal for another user's Stripe customer (manage subscription).
 */
export async function GET(req: NextRequest) {
  const adminCtx = await getIdpAdmin();
  if (!adminCtx) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const targetSub = req.nextUrl.searchParams.get("sub")?.trim();
  if (!targetSub) {
    return NextResponse.json({ error: "missing_sub" }, { status: 400 });
  }

  const row = await getStripeCustomerBySub(targetSub);
  if (!row?.stripe_customer_id) {
    return NextResponse.json(
      { error: "no_stripe_customer", message: "This user has no Stripe customer record." },
      { status: 400 },
    );
  }

  const origin = getRequestPublicIssuer(req);
  const returnUrl = `${origin}/admin/users/${encodeURIComponent(targetSub)}?billing=portal_return`;

  try {
    const stripe = getIdpStripe();
    const portal = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: returnUrl,
    });
    if (!portal.url) {
      return NextResponse.json({ error: "portal_failed" }, { status: 500 });
    }
    return NextResponse.redirect(portal.url, 302);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[admin/billing-portal]", msg);
    return NextResponse.json({ error: "portal_failed", message: msg }, { status: 500 });
  }
}
