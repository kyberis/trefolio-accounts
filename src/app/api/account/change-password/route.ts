import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

import { findUserBySub, updateUserBySub } from "@/lib/db";
import { IDP_SESSION_COOKIE, verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** bcrypt only uses the first 72 bytes; keep input bounded. */
const MAX_PASSWORD_LEN = 72;

async function sessionSub(): Promise<string | null> {
  const store = await cookies();
  return verifySession(store.get(IDP_SESSION_COOKIE)?.value);
}

export async function POST(req: NextRequest) {
  const sub = await sessionSub();
  if (!sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await findUserBySub(sub);
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const current = typeof body.current_password === "string" ? body.current_password : "";
  const nextPwd = typeof body.new_password === "string" ? body.new_password : "";

  if (!nextPwd || nextPwd.length < 8 || nextPwd.length > MAX_PASSWORD_LEN) {
    return NextResponse.json({ error: "invalid_new_password" }, { status: 400 });
  }

  if (user.password_hash?.trim()) {
    if (!current || current.length > MAX_PASSWORD_LEN) {
      return NextResponse.json({ error: "current_required" }, { status: 400 });
    }
    const ok = await bcrypt.compare(current, user.password_hash);
    if (!ok) return NextResponse.json({ error: "wrong_password" }, { status: 401 });
  }

  const hash = await bcrypt.hash(nextPwd, 12);
  await updateUserBySub(sub, { password_hash: hash, password_plain: "" });
  return NextResponse.json({ ok: true });
}
