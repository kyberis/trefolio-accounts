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
  const user = findUserBySub(sub);
  if (!user) return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  const ent = getEntitlement(sub);
  return NextResponse.json({
    sub,
    email: user.email,
    email_verified: true,
    name: user.name,
    pro_until: ent.pro_until,
    entitlements: {
      trefolio_pro: ent.plan === "pro",
      clara_daily_limit: ent.plan === "pro" ? 200 : 30,
      will_daily_limit: ent.plan === "pro" ? 200 : 30,
    },
  });
}
