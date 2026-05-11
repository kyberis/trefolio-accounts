import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { findUserBySub, updateUserBySub, hasOpsTelegramLinkForSub } from "@/lib/db";
import { IDP_SESSION_COOKIE, verifySession } from "@/lib/session";
import { isPlatformStaff } from "@/lib/staff";
import { buildTelegramAgentsPayload } from "@/lib/telegram-agents";

export const dynamic = "force-dynamic";

async function sessionSub(): Promise<string | null> {
  const store = await cookies();
  return verifySession(store.get(IDP_SESSION_COOKIE)?.value);
}

export async function GET() {
  const sub = await sessionSub();
  if (!sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await findUserBySub(sub);
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const opsLinked = await hasOpsTelegramLinkForSub(sub);
  const staff = isPlatformStaff(user);
  const telegram_agents = await buildTelegramAgentsPayload(sub, {
    isStaff: staff,
    opsTelegramLinked: opsLinked,
  });

  return NextResponse.json({
    sub: user.sub,
    email: user.email,
    name: user.name,
    avatar_url: user.avatar_url,
    tax_residency: user.tax_residency,
    email_verified: user.email_verified === 1,
    google_linked: Boolean(user.google_id),
    apple_linked: Boolean(user.apple_id),
    has_password: Boolean(user.password_hash?.trim()),
    is_platform_staff: staff,
    ops_telegram_linked: opsLinked,
    telegram_agents,
  });
}

export async function PATCH(req: NextRequest) {
  const sub = await sessionSub();
  if (!sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await findUserBySub(sub);
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  const patch: Parameters<typeof updateUserBySub>[1] = {};

  if (typeof body.name === "string") {
    patch.name = body.name.trim().slice(0, 120);
  }
  if (typeof body.avatar_url === "string") {
    patch.avatar_url = body.avatar_url.trim().slice(0, 2048);
  }
  if (typeof body.tax_residency === "string") {
    const t = body.tax_residency.trim().toUpperCase().slice(0, 2);
    patch.tax_residency = /^[A-Z]{2}$/.test(t) ? t : "";
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no_fields" }, { status: 400 });
  }

  await updateUserBySub(sub, patch);
  const next = await findUserBySub(sub);
  return NextResponse.json({
    ok: true,
    sub,
    name: next?.name ?? "",
    avatar_url: next?.avatar_url ?? "",
    tax_residency: next?.tax_residency ?? "",
  });
}
