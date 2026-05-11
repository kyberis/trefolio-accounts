import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { findUserBySub, mintOpsTelegramLinkCode } from "@/lib/db";
import { IDP_SESSION_COOKIE, verifySession } from "@/lib/session";
import { isPlatformStaff } from "@/lib/staff";

export const dynamic = "force-dynamic";

export async function POST() {
  const jar = await cookies();
  const sub = verifySession(jar.get(IDP_SESSION_COOKIE)?.value);
  if (!sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await findUserBySub(sub);
  if (!user || !isPlatformStaff(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { code } = await mintOpsTelegramLinkCode(sub);
  const bot = (process.env.TELEGRAM_OPS_BOT_USERNAME || "trefolio_ops_bot").replace(/^@/, "");
  const deepLink = `https://t.me/${bot}?start=${encodeURIComponent(code)}`;
  return NextResponse.json({ ok: true, code, deep_link: deepLink, expires_in_seconds: 15 * 60 });
}
