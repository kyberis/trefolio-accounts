import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Retired: the unified staff ops bot webhook lives on ProdOps
 * (`https://ops.trefolio.com/api/telegram/webhook`).
 */
export async function POST() {
  console.warn("[ops-telegram] retired IdP webhook hit; setWebhook on @trefoliobot must point at ProdOps");
  return NextResponse.json(
    {
      error: "gone",
      hint: "Use https://ops.trefolio.com/api/telegram/webhook for @trefoliobot.",
    },
    { status: 410 },
  );
}

export async function GET() {
  return NextResponse.json({ ok: false, retired: true }, { status: 410 });
}
