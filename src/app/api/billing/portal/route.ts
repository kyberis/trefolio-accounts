import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getStripeCustomerBySub } from "@/lib/db";
import { getIdpStripe } from "@/lib/idp-stripe";
import { getRequestPublicIssuer } from "@/lib/public-url";
import { IDP_SESSION_COOKIE, verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Opens Stripe Customer Billing Portal for the signed-in IdP user.
 */
export async function GET(req: NextRequest) {
  const jar = await cookies();
  const sub = verifySession(jar.get(IDP_SESSION_COOKIE)?.value);
  if (!sub) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }

  const row = await getStripeCustomerBySub(sub);
  if (!row?.stripe_customer_id) {
    return NextResponse.json(
      { error: "no_stripe_customer", message: "No Stripe billing profile for this account yet." },
      { status: 400 },
    );
  }

  const from =
    req.nextUrl.searchParams.get("from")?.trim().slice(0, 32) || "trefolio";
  const origin = getRequestPublicIssuer(req);
  const returnUrl = `${origin}/upgrade?billing=portal_return&from=${encodeURIComponent(from)}`;

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
    console.error("[billing/portal]", msg);
    return NextResponse.json({ error: "portal_failed", message: msg }, { status: 500 });
  }
}
