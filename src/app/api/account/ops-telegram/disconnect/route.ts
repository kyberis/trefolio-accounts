import { NextResponse } from "next/server";

import { deleteOpsTelegramLinkForSub, findUserBySub } from "@/lib/db";
import { resolveOpsTelegramOwnerSub } from "@/lib/ops-telegram-session";
import { isPlatformStaff } from "@/lib/staff";

export const dynamic = "force-dynamic";

export async function POST() {
  const sub = await resolveOpsTelegramOwnerSub();
  if (!sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await findUserBySub(sub);
  if (!user || !isPlatformStaff(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await deleteOpsTelegramLinkForSub(sub);
  return NextResponse.json({ ok: true });
}
