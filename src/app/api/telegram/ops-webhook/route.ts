import { NextRequest, NextResponse } from "next/server";

import {
  consumeOpsTelegramLinkCode,
  deleteOpsTelegramLinkForSub,
  findSubByOpsTelegramId,
  findUserBySub,
} from "@/lib/db";
import { buildOpsDigestMarkdown } from "@/lib/ops-snapshot";
import { telegramOpsSendMessage } from "@/lib/ops-telegram-send";
import { isPlatformStaff } from "@/lib/staff";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function verifyTelegramSecret(req: NextRequest): boolean {
  const expected = process.env.TELEGRAM_OPS_WEBHOOK_SECRET?.trim();
  if (!expected) return process.env.NODE_ENV !== "production";
  const got = req.headers.get("x-telegram-bot-api-secret-token") || "";
  return got === expected;
}

async function ensureLinkedStaff(tgUserIdStr: string): Promise<{ ok: true; chatId: string } | { ok: false }> {
  const sub = await findSubByOpsTelegramId(tgUserIdStr);
  if (!sub) return { ok: false };
  const user = await findUserBySub(sub);
  if (!user || !isPlatformStaff(user)) {
    await deleteOpsTelegramLinkForSub(sub);
    return { ok: false };
  }
  return { ok: true, chatId: tgUserIdStr };
}

export async function POST(req: NextRequest) {
  if (!verifyTelegramSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const msg = (body as { message?: { chat?: { id: number }; text?: string; from?: { id: number } } }).message;
  if (!msg?.chat?.id) return NextResponse.json({ ok: true });

  const chatId = String(msg.chat.id);
  const fromId = msg.from?.id != null ? String(msg.from.id) : chatId;
  const text = (msg.text || "").trim();

  const startArg = text.startsWith("/start") ? text.replace(/^\/start\s*/i, "").trim() : "";

  if (startArg) {
    const linkResult = await consumeOpsTelegramLinkCode(startArg, fromId);
    if (linkResult.ok === false) {
      const reason =
        linkResult.reason === "expired"
          ? "Code expired — generate a new link from user.trefolio.com/account."
          : "Invalid or used code.";
      await telegramOpsSendMessage(chatId, reason);
      return NextResponse.json({ ok: true });
    }
    const user = await findUserBySub(linkResult.sub);
    if (!user || !isPlatformStaff(user)) {
      await deleteOpsTelegramLinkForSub(linkResult.sub);
      await telegramOpsSendMessage(
        chatId,
        "Link rejected: this account is not platform staff. Ask an IdP admin to grant staff on your user.",
      );
      return NextResponse.json({ ok: true });
    }
    await telegramOpsSendMessage(
      chatId,
      "Linked to trefolio business ops. You will receive digests and billing alerts. Try /snapshot for an on-demand digest.",
    );
    return NextResponse.json({ ok: true });
  }

  const cmd = text.split(/\s+/)[0]?.toLowerCase() || "";
  if (cmd === "/snapshot" || cmd === "/digest") {
    const gate = await ensureLinkedStaff(fromId);
    if (!gate.ok) {
      await telegramOpsSendMessage(
        chatId,
        "Not linked. Open user.trefolio.com/account (staff) and connect Telegram first.",
      );
      return NextResponse.json({ ok: true });
    }
    const md = await buildOpsDigestMarkdown();
    await telegramOpsSendMessage(chatId, md);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
