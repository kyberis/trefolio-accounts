import { NextRequest, NextResponse } from "next/server";
import {
  findUserByEmail,
  createUser,
  setPlan,
  getEntitlement,
  updateUserBySub,
  upsertStripeCustomerRow,
} from "@/lib/db";
import { fetchStripeSubscriptionSnapshotForImport } from "@/lib/idp-stripe-subscription";

export const dynamic = "force-dynamic";

function maxIso(a: string | null | undefined, b: string | null | undefined): string | null {
  const aa = a ? Date.parse(a) : NaN;
  const bb = b ? Date.parse(b) : NaN;
  if (Number.isFinite(aa) && Number.isFinite(bb)) {
    return new Date(Math.max(aa, bb)).toISOString();
  }
  if (Number.isFinite(aa)) return new Date(aa).toISOString();
  if (Number.isFinite(bb)) return new Date(bb).toISOString();
  return null;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || token !== process.env.IDP_SERVICE_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "missing email" }, { status: 400 });

  let user = await findUserByEmail(email);
  let created = false;
  if (!user) {
    user = await createUser({
      email,
      name: String(body.name || email.split("@")[0]).trim() || email.split("@")[0],
      passwordHash: body.passwordHash ? String(body.passwordHash) : undefined,
      googleId: body.googleId ? String(body.googleId) : undefined,
      appleId: body.appleId ? String(body.appleId) : undefined,
      emailVerified: Boolean(body.emailVerified),
    });
    created = true;
  } else {
    // Merge source apps into one canonical IdP identity keyed by email.
    await updateUserBySub(user.sub, {
      name:
        body.name && String(body.name).trim()
          ? String(body.name).trim()
          : user.name,
      password_hash:
        body.passwordHash && String(body.passwordHash).trim()
          ? String(body.passwordHash).trim()
          : user.password_hash,
      google_id:
        body.googleId && String(body.googleId).trim()
          ? String(body.googleId).trim()
          : user.google_id,
      apple_id:
        body.appleId && String(body.appleId).trim()
          ? String(body.appleId).trim()
          : user.apple_id,
      email_verified:
        user.email_verified === 1 || Boolean(body.emailVerified) ? 1 : 0,
    });
  }

  const current = await getEntitlement(user.sub);
  const incomingPlan = body.plan === "pro" ? "pro" : "free";

  const stripeCustomerId =
    typeof body.stripeCustomerId === "string" ? body.stripeCustomerId.trim() : "";
  const stripeSubscriptionId =
    typeof body.stripeSubscriptionId === "string" ? body.stripeSubscriptionId.trim() : "";

  if (
    body.plan === "free" &&
    current.plan === "pro" &&
    current.source === "stripe"
  ) {
    return NextResponse.json(
      {
        error: "stripe_managed_pro",
        message: "Cannot downgrade Stripe-managed Pro via this import.",
      },
      { status: 409 },
    );
  }

  const resolvedPlan =
    current.plan === "pro" || incomingPlan === "pro" ? "pro" : "free";
  const incomingUntil =
    body.proUntil || body.planExpiresAt ? String(body.proUntil || body.planExpiresAt) : null;
  let resolvedUntil =
    resolvedPlan === "pro" ? maxIso(current.pro_until, incomingUntil) : null;

  let snapshot = null as Awaited<ReturnType<typeof fetchStripeSubscriptionSnapshotForImport>>;
  if (stripeCustomerId) {
    snapshot = await fetchStripeSubscriptionSnapshotForImport({
      stripeCustomerId,
      stripeSubscriptionId: stripeSubscriptionId || null,
    });
    if (snapshot?.currentPeriodEnd && resolvedPlan === "pro") {
      resolvedUntil = snapshot.currentPeriodEnd.toISOString();
    }
    await upsertStripeCustomerRow({
      sub: user.sub,
      stripeCustomerId,
      stripeSubscriptionId: (snapshot?.stripeSubscriptionId ?? stripeSubscriptionId) || null,
      currentPeriodEnd: snapshot?.currentPeriodEnd ?? (resolvedUntil ? new Date(resolvedUntil) : null),
      cancelAtPeriodEnd: snapshot?.cancelAtPeriodEnd ?? false,
    });
  }

  const entitlementSource = stripeCustomerId ? "stripe" : current.source ?? "import";
  const needsEntitlementWrite =
    current.plan !== resolvedPlan ||
    (resolvedUntil || "") !== (current.pro_until || "") ||
    current.source !== entitlementSource;

  if (needsEntitlementWrite) {
    await setPlan(user.sub, resolvedPlan, resolvedUntil, entitlementSource);
  }

  return NextResponse.json({
    sub: user.sub,
    email: user.email,
    created,
  });
}
