import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { revokePersonalAccessToken } from "@/lib/db";
import { IDP_SESSION_COOKIE, verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  ctx: { params: { id: string } },
) {
  const id = ctx.params.id;
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }
  const jar = await cookies();
  const sub = verifySession(jar.get(IDP_SESSION_COOKIE)?.value);
  if (!sub) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const ok = await revokePersonalAccessToken(id, sub);
  if (!ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
