import { NextRequest, NextResponse } from "next/server";
import { findUserBySub, getEntitlement } from "@/lib/db";
import { effectiveIdpPlan, entitlementClaims } from "@/lib/idp-plan";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || !token || !token.startsWith("dev-access-")) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }
  const sub = token.split(".").pop() || "";
  const user = await findUserBySub(sub);
  if (!user) return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  const ent = await getEntitlement(sub);
  const tier = effectiveIdpPlan(ent.plan, ent.pro_until);
  return NextResponse.json({
    sub,
    email: user.email,
    email_verified: user.email_verified === 1,
    name: user.name,
    picture: user.avatar_url?.trim() || null,
    tax_residency: user.tax_residency?.trim() || null,
    pro_until: ent.pro_until,
    entitlements: entitlementClaims(tier),
  });
}
