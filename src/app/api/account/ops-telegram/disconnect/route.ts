import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { deleteOpsTelegramLinkForSub, findUserBySub } from "@/lib/db";
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
  await deleteOpsTelegramLinkForSub(sub);
  return NextResponse.json({ ok: true });
}
