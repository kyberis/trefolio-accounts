import { NextRequest, NextResponse } from "next/server";
import { findSubByTelegramId } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ tgUserId: string }> }) {
  const auth = req.headers.get("authorization") || "";
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || token !== process.env.IDP_SERVICE_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { tgUserId } = await params;
  const sub = await findSubByTelegramId(tgUserId);
  if (!sub) return NextResponse.json({ error: "not_linked" }, { status: 404 });
  return NextResponse.json({ tgUserId, sub });
}
