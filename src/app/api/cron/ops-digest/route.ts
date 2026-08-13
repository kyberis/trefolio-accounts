import { NextRequest, NextResponse } from "next/server";

import { verifyIdpCronAuth } from "@/lib/cron-auth";
import { buildOpsDigestMarkdown } from "@/lib/ops-snapshot";
import { ingestProdOpsEvent } from "@/lib/trefolio-prodops";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily digest via the unified ProdOps bot (trefolio outbox → Telegram).
 */
export async function GET(req: NextRequest) {
  if (!verifyIdpCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const text = await buildOpsDigestMarkdown();
  const day = new Date().toISOString().slice(0, 10);
  await ingestProdOpsEvent({
    eventType: "ops_digest",
    userId: "idp",
    dedupeKey: `accounts:ops_digest:${day}`,
    summary: `Daily ops digest · ${day}`,
    metadata: { body: text.slice(0, 4000) },
  });
  return NextResponse.json({ ok: true }, { status: 200 });
}
