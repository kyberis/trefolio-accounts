import { NextRequest, NextResponse } from "next/server";

import { revokePersonalAccessToken } from "@/lib/db";
import { requireIdpServiceToken } from "@/lib/idp-service-auth";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sub: string; id: string }> },
) {
  const fail = requireIdpServiceToken(req);
  if (fail) return fail;
  const { sub, id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }
  const ok = await revokePersonalAccessToken(id, sub);
  if (!ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
