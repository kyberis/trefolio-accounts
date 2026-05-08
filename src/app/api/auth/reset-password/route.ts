import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { findUserBySub, updateUserBySub } from "@/lib/db";
import { verifyIdpPasswordResetJwt } from "@/lib/idp-password-reset-token";

export const dynamic = "force-dynamic";

const MIN_PASSWORD_LENGTH = 8;
/** bcrypt only uses the first 72 bytes; keep input bounded. */
const MAX_PASSWORD_LENGTH = 72;

export async function POST(req: NextRequest) {
  let body: { token?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!token) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const parsed = await verifyIdpPasswordResetJwt(token);
  if (!parsed) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: "password_too_short" }, { status: 400 });
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json({ error: "password_too_long" }, { status: 400 });
  }

  const user = await findUserBySub(parsed.sub);
  if (!user || user.email.toLowerCase() !== parsed.email.toLowerCase()) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }
  if (!user.password_hash) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const hash = await bcrypt.hash(password, 12);
  await updateUserBySub(parsed.sub, { password_hash: hash, password_plain: "" });

  return NextResponse.json({ ok: true });
}
