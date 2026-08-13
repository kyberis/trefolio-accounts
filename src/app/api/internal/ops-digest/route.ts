import { NextRequest, NextResponse } from "next/server";

import { verifyIdpServiceBearer } from "@/lib/service-auth";
import { buildOpsDigestMarkdown } from "@/lib/ops-snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Ecosystem ops digest for the unified ProdOps bot (`/snapshot`).
 * Auth: Bearer IDP_SERVICE_TOKEN (trefolio → IdP).
 */
export async function GET(req: NextRequest) {
  if (!verifyIdpServiceBearer(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const markdown = await buildOpsDigestMarkdown();
  return NextResponse.json({ ok: true as const, markdown });
}
