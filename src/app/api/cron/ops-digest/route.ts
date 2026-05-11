import { NextRequest, NextResponse } from "next/server";

import { verifyIdpCronAuth } from "@/lib/cron-auth";
import { buildOpsDigestMarkdown } from "@/lib/ops-snapshot";
import { telegramOpsBroadcast } from "@/lib/ops-telegram-send";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily digest to linked staff Telegram chats. Configure in Vercel Cron.
 */
export async function GET(req: NextRequest) {
  if (!verifyIdpCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.TELEGRAM_OPS_BOT_TOKEN?.trim()) {
    return NextResponse.json({ ok: true, skipped: "no_bot_token" }, { status: 200 });
  }
  const text = await buildOpsDigestMarkdown();
  await telegramOpsBroadcast(text);
  return NextResponse.json({ ok: true }, { status: 200 });
}
