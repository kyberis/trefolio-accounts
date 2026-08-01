import { getStripeCustomerBySub } from "@/lib/db";
import { getIdpStripe } from "@/lib/idp-stripe";

/**
 * Loads live subscription fields from Stripe for admin/service-token imports
 * (trefolio → IdP migration). Returns null if Stripe is not configured or the
 * API call fails — callers fall back to DB metadata from the product app.
 */
export async function fetchStripeSubscriptionSnapshotForImport(args: {
  stripeCustomerId: string;
  stripeSubscriptionId?: string | null;
}): Promise<{
  stripeSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
} | null> {
  try {
    const stripe = getIdpStripe();
    const hinted = args.stripeSubscriptionId?.trim();
    if (hinted) {
      const subObj = await stripe.subscriptions.retrieve(hinted);
      return {
        stripeSubscriptionId: subObj.id,
        currentPeriodEnd: new Date(subObj.current_period_end * 1000),
        cancelAtPeriodEnd: subObj.cancel_at_period_end ?? false,
      };
    }
    const list = await stripe.subscriptions.list({
      customer: args.stripeCustomerId,
      status: "all",
      limit: 15,
    });
    const pick =
      list.data.find((s) => s.status === "active" || s.status === "trialing") ??
      list.data.find((s) => s.status === "past_due") ??
      list.data[0];
    if (!pick) {
      return {
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      };
    }
    return {
      stripeSubscriptionId: pick.id,
      currentPeriodEnd: new Date(pick.current_period_end * 1000),
      cancelAtPeriodEnd: pick.cancel_at_period_end ?? false,
    };
  } catch (err) {
    console.warn("[stripe] fetchStripeSubscriptionSnapshotForImport failed", err);
    return null;
  }
}

/**
 * True when Stripe still bills this user (same semantics as Warren's
 * hasActiveManagedStripeSubscription).
 */
export async function hasActiveManagedStripeSubscriptionIdp(sub: string): Promise<boolean> {
  const row = await getStripeCustomerBySub(sub);
  const sid = row?.stripe_subscription_id?.trim();
  if (!sid) return false;
  try {
    const stripe = getIdpStripe();
    const subObj = await stripe.subscriptions.retrieve(sid);
    return (
      subObj.status === "active" ||
      subObj.status === "trialing" ||
      subObj.status === "past_due"
    );
  } catch {
    return false;
  }
}

/**
 * Best-effort cancel of any open Stripe subscriptions before IdP account erasure.
 * Failures are logged and swallowed so GDPR deletion is not blocked by Stripe outages.
 */
export async function cancelStripeSubscriptionsForAccountDeletion(sub: string): Promise<void> {
  const row = await getStripeCustomerBySub(sub);
  const customerId = row?.stripe_customer_id?.trim();
  if (!customerId && !row?.stripe_subscription_id?.trim()) return;

  try {
    const stripe = getIdpStripe();
    const hinted = row?.stripe_subscription_id?.trim();
    if (hinted) {
      try {
        await stripe.subscriptions.cancel(hinted);
      } catch (err) {
        console.warn("[stripe] cancel hinted subscription on account delete failed", err);
      }
    }
    if (!customerId) return;
    const list = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 20,
    });
    for (const s of list.data) {
      if (s.status === "canceled" || s.status === "incomplete_expired") continue;
      if (hinted && s.id === hinted) continue;
      try {
        await stripe.subscriptions.cancel(s.id);
      } catch (err) {
        console.warn("[stripe] cancel subscription on account delete failed", s.id, err);
      }
    }
  } catch (err) {
    console.warn("[stripe] cancelStripeSubscriptionsForAccountDeletion failed", err);
  }
}
