import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { logSubscriptionCheckoutIntent } from "@/lib/db";
import { IDP_SESSION_COOKIE, verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const sub = verifySession(jar.get(IDP_SESSION_COOKIE)?.value);
  if (!sub) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }

  let body: { from?: string; interval?: string } = {};
  try {
    body = (await req.json()) as { from?: string; interval?: string };
  } catch {
    /* optional */
  }

  const ua = req.headers.get("user-agent");

  await logSubscriptionCheckoutIntent({
    sub,
    fromApp: typeof body.from === "string" ? body.from : "",
    intervalHint: typeof body.interval === "string" ? body.interval : null,
    userAgent: ua,
  });

  return NextResponse.json({ ok: true });
}
