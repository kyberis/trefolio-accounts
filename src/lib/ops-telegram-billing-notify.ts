import { telegramOpsBroadcast } from "./ops-telegram-send";

/**
 * Non-blocking Stripe / billing heads-up for linked staff (no PII — IdP `sub` prefix only).
 */
export function notifyOpsTelegramBillingLine(kind: string, sub: string): void {
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env.TELEGRAM_OPS_BOT_TOKEN?.trim()) return;
  const subShort = sub.length > 12 ? `${sub.slice(0, 12)}…` : sub;
  void telegramOpsBroadcast(`Billing · ${kind} · ${subShort}`);
}
