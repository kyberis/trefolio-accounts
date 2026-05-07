import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { activateTrialForSub } from "@/lib/db";
import { IDP_SESSION_COOKIE, verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const sub = verifySession(jar.get(IDP_SESSION_COOKIE)?.value);
  if (!sub) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }

  let token = "";
  try {
    const body = (await req.json()) as { token?: string };
    token = String(body.token || "").trim();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await activateTrialForSub(sub, token);
  if (result.ok === false) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, proUntil: result.proUntil });
}
