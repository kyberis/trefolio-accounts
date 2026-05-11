import { NextRequest, NextResponse } from "next/server";

import { buildOpsDigestMarkdown } from "@/lib/ops-snapshot";

export const dynamic = "force-dynamic";

/**
 * Service-to-service: full ops digest JSON + markdown (Bearer IDP_SERVICE_TOKEN).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const [scheme, token] = auth.split(" ");
  const expected = process.env.IDP_SERVICE_TOKEN;
  if (!expected || scheme !== "Bearer" || token !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const markdown = await buildOpsDigestMarkdown();
  return NextResponse.json({ ok: true, markdown, generated_at: new Date().toISOString() });
}
