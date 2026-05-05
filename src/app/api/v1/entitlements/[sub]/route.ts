import { NextRequest, NextResponse } from "next/server";
import { getEntitlement, findUserBySub } from "@/lib/db";

export const dynamic = "force-dynamic";

function unauthorized(req: NextRequest): NextResponse | null {
  const auth = req.headers.get("authorization") || "";
  const [scheme, token] = auth.split(" ");
  const expected = process.env.IDP_SERVICE_TOKEN;
  if (!expected || scheme !== "Bearer" || token !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ sub: string }> }) {
  const fail = unauthorized(req);
  if (fail) return fail;
  const { sub } = await params;
  const user = findUserBySub(sub);
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const ent = getEntitlement(sub);
  const isPro = ent.plan === "pro" && (!ent.pro_until || new Date(ent.pro_until) > new Date());
  return NextResponse.json({
    sub,
    plan: ent.plan,
    proUntil: ent.pro_until,
    source: ent.source,
    entitlements: {
      trefolio_pro: isPro,
      clara_daily_limit: isPro ? 200 : 30,
      will_daily_limit: isPro ? 200 : 30,
    },
  });
}
