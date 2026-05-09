import type Stripe from "stripe";
import {
  findSubByStripeCustomerId,
  setPlan,
  upsertStripeCustomerRow,
} from "@/lib/db";
import { getIdpStripe } from "@/lib/idp-stripe";

function readMetadataSub(session: Stripe.Checkout.Session): string | null {
  const m = session.metadata ?? {};
  /** Only canonical IdP `sub` — never treat product-local `userId` as `sub`. */
  const sub = (m.sub || m.idp_sub || "").trim();
  return sub || null;
}

/**
 * Stripe webhook handler — updates entitlements + stripe_customers (same Price IDs as Warren).
 */
export async function applyStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const sub = readMetadataSub(session);
      if (!sub) {
        console.error("[stripe] checkout.session.completed without sub metadata", session.id);
        return;
      }
      if (!session.subscription || !session.customer) return;

      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      const customerId =
        typeof session.customer === "string" ? session.customer : session.customer.id;

      const stripe = getIdpStripe();
      const subObj = await stripe.subscriptions.retrieve(subscriptionId);
      const currentPeriodEnd = new Date(subObj.current_period_end * 1000);

      await upsertStripeCustomerRow({
        sub,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        currentPeriodEnd,
        cancelAtPeriodEnd: subObj.cancel_at_period_end ?? false,
      });

      await setPlan(sub, "pro", currentPeriodEnd.toISOString(), "stripe");
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const stripeSub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer.id;
      const mappedSub = await findSubByStripeCustomerId(customerId);
      if (!mappedSub) {
        console.warn("[stripe] subscription event for unknown customer", customerId);
        return;
      }

      const isActive = stripeSub.status === "active" || stripeSub.status === "trialing";
      const currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);

      await upsertStripeCustomerRow({
        sub: mappedSub,
        stripeCustomerId: customerId,
        stripeSubscriptionId: stripeSub.id,
        currentPeriodEnd,
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? false,
      });

      await setPlan(mappedSub, isActive ? "pro" : "free", isActive ? currentPeriodEnd.toISOString() : null, "stripe");
      return;
    }

    case "customer.subscription.deleted": {
      const stripeSub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer.id;
      const mappedSub = await findSubByStripeCustomerId(customerId);
      if (!mappedSub) return;

      const cpe = stripeSub.current_period_end
        ? new Date(stripeSub.current_period_end * 1000)
        : null;
      const stillInPeriod = cpe ? cpe.getTime() > Date.now() : false;

      await setPlan(mappedSub, stillInPeriod ? "pro" : "free", stillInPeriod ? cpe!.toISOString() : null, "stripe");
      return;
    }

    default:
      return;
  }
}
