import { NextRequest, NextResponse } from "next/server";

import { findUserByEmail, setPendingMembershipGrantIdp } from "@/lib/db";
import { sendIdpMembershipGrantEmail } from "@/lib/idp-membership-grant-email";
import { hasActiveManagedStripeSubscriptionIdp } from "@/lib/idp-stripe-subscription";

export const dynamic = "force-dynamic";

/**
 * Service token: trefolio admin "grant membership" creates the pending grant
 * and sends the invitation email from the IdP (link → user.trefolio.com).
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || token !== process.env.IDP_SERVICE_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const daysRaw = parseInt(String(body.days ?? "30"), 10);
  const days = Math.min(730, Math.max(1, Number.isFinite(daysRaw) ? daysRaw : 30));
  if (!email) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  if (await hasActiveManagedStripeSubscriptionIdp(user.sub)) {
    return NextResponse.json({ error: "stripe_active" }, { status: 409 });
  }

  const { token: inviteToken } = await setPendingMembershipGrantIdp(user.sub, "pro", days);
  await sendIdpMembershipGrantEmail({
    to: user.email,
    displayName: user.name,
    locale: user.locale,
    days,
    token: inviteToken,
  });

  return NextResponse.json({ ok: true, sub: user.sub });
}
