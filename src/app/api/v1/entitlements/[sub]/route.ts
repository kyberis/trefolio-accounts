import { NextRequest, NextResponse } from "next/server";
import { getEntitlement, findUserBySub } from "@/lib/db";
import { effectiveIdpPlan, entitlementClaims } from "@/lib/idp-plan";

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
  const user = await findUserBySub(sub);
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const ent = await getEntitlement(sub);
  const tier = effectiveIdpPlan(ent.plan, ent.pro_until);
  return NextResponse.json({
    sub,
    plan: tier,
    proUntil: ent.pro_until,
    source: ent.source,
    profile: {
      email: user.email,
      name: user.name,
      picture: user.avatar_url?.trim() || null,
      taxResidency: user.tax_residency?.trim() || null,
    },
    entitlements: entitlementClaims(tier),
  });
}
