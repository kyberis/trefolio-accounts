import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail, createUser, setPlan } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || token !== process.env.IDP_SERVICE_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "missing email" }, { status: 400 });

  let user = findUserByEmail(email);
  if (!user) {
    user = { ...createUser({ email, name: body.name || email.split("@")[0], password: body.passwordHash || "imported-no-password" }), password_plain: "" };
  }
  if (body.plan === "pro") {
    setPlan(user.sub, "pro", body.planExpiresAt || null);
  }
  return NextResponse.json({ sub: user.sub, email: user.email, plan: body.plan || "free" });
}
