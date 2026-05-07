import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import { applyStripeEvent } from "@/lib/apply-stripe-event";
import { getIdpStripe } from "@/lib/idp-stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/billing/webhook
 * Configure in Stripe Dashboard for this URL; use STRIPE_WEBHOOK_SECRET from that endpoint.
 */
export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing_signature" }, { status: 400 });

  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 500 });
  }

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = getIdpStripe().webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    console.error("[stripe] signature verification failed", err);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    await applyStripeEvent(event);
  } catch (err) {
    console.error("[stripe] handler failed", event.type, err);
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
