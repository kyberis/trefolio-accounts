import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { findUserBySub } from "@/lib/db";
import { resolveOpsTelegramOwnerSub } from "@/lib/ops-telegram-session";
import { isPlatformStaff } from "@/lib/staff";
import { unlinkProdOpsTelegram } from "@/lib/trefolio-prodops";

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
  try {
    await unlinkProdOpsTelegram();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.warn("[ops-telegram] unlink via trefolio failed", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "trefolio_unavailable", reason: "trefolio_unlink_failed" },
      { status: 502 },
    );
  }
}
