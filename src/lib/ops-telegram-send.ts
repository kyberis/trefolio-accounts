import { listOpsTelegramChatIds } from "./db";

function botToken(): string | null {
  return process.env.TELEGRAM_OPS_BOT_TOKEN?.trim() || null;
}

/**
 * Send a plain-text message to one Telegram chat (private chat id = tg user id).
 */
export async function telegramOpsSendMessage(chatId: string, text: string): Promise<boolean> {
  const token = botToken();
  if (!token || !chatId || !text.trim()) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 3500),
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.warn("[ops-telegram] sendMessage failed", res.status, err.slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[ops-telegram] sendMessage error", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Fan-out to every linked staff chat. Failures are logged; never throws. */
export async function telegramOpsBroadcast(text: string): Promise<void> {
  const token = botToken();
  if (!token || !text.trim()) return;
  const chats = await listOpsTelegramChatIds();
  for (const chatId of chats) {
    await telegramOpsSendMessage(chatId, text);
  }
}
