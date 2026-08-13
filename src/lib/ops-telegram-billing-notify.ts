import { ingestProdOpsEvent } from "./trefolio-prodops";

/**
 * Non-blocking Stripe / billing heads-up for the unified ProdOps bot (no PII — IdP `sub` prefix only).
 */
export function notifyOpsTelegramBillingLine(kind: string, sub: string): void {
  if (process.env.NODE_ENV !== "production") return;
  const subShort = sub.length > 12 ? `${sub.slice(0, 12)}…` : sub;
  const stamp = new Date().toISOString();
  void ingestProdOpsEvent({
    eventType: "membership_paid",
    userId: sub,
    dedupeKey: `accounts:billing:${kind}:${sub}:${stamp}`,
    summary: `Billing · ${kind} · ${subShort}`,
    metadata: { kind, displayName: "IdP billing" },
  });
}
