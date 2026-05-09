import { NextRequest, NextResponse } from "next/server";
import { findUserBySub, getEntitlement } from "@/lib/db";

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
  return NextResponse.json({
    sub,
    email: user.email,
    email_verified: user.email_verified === 1,
    name: user.name,
    picture: user.avatar_url?.trim() || null,
    tax_residency: user.tax_residency?.trim() || null,
    pro_until: ent.pro_until,
    entitlements: {
      trefolio_pro: ent.plan === "pro",
      clara_daily_limit: ent.plan === "pro" ? 200 : 30,
      will_daily_limit: ent.plan === "pro" ? 200 : 30,
    },
  });
}
