import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { findUserBySub } from "@/lib/db";
import { resolveOpsTelegramOwnerSub } from "@/lib/ops-telegram-session";
import { isPlatformStaff } from "@/lib/staff";
import { mintProdOpsTelegramLink } from "@/lib/trefolio-prodops";

export const dynamic = "force-dynamic";

/** Browsers open bare API URLs with GET; this route only accepts POST from the UI. */
export async function GET() {
  return NextResponse.json(
    {
      error: "method_not_allowed",
      hint: "Use POST from /account or /agents (Generate Telegram link). Opening this URL in a tab does not send session cookies.",
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
    const minted = await mintProdOpsTelegramLink();
    return NextResponse.json({
      ok: true,
      deep_link: minted.deep_link,
      expires_in_seconds: minted.expires_in_seconds,
    });
  } catch (err) {
    console.warn("[ops-telegram] mint via trefolio failed", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "trefolio_unavailable", reason: "trefolio_link_failed" },
      { status: 502 },
    );
  }
}
