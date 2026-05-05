import { NextRequest, NextResponse } from "next/server";
import { linkTelegram } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || token !== process.env.IDP_SERVICE_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const tg = String(body.tgUserId || "");
  const sub = String(body.sub || "");
  if (!tg || !sub) return NextResponse.json({ error: "missing fields" }, { status: 400 });
  linkTelegram(tg, sub);
  return NextResponse.json({ ok: true, tgUserId: tg, sub });
}
