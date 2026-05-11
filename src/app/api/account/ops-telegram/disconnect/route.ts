import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { deleteOpsTelegramLinkForSub, findUserBySub } from "@/lib/db";
import { resolveOpsTelegramOwnerSub } from "@/lib/ops-telegram-session";
import { isPlatformStaff } from "@/lib/staff";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      error: "method_not_allowed",
      hint: "Use POST from /account or /agents (Disconnect).",
    },
    { status: 405 },
  );
}

export async function POST(req: NextRequest) {
  const sub = await resolveOpsTelegramOwnerSub(req);
  if (!sub) {
    return NextResponse.json(
      { error: "unauthorized", reason: "missing_or_invalid_session" },
      { status: 401 },
    );
  }
  const user = await findUserBySub(sub);
  if (!user || !isPlatformStaff(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await deleteOpsTelegramLinkForSub(sub);
  return NextResponse.json({ ok: true });
}
