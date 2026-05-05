import { NextRequest, NextResponse } from "next/server";

import { findUserByEmail } from "@/lib/db";
import { sendIdpVerificationEmail } from "@/lib/idp-verification-email";
import { idpSkipsVerificationEmail } from "@/lib/idp-email-policy";
import {
  createIdpEmailVerificationJwt,
} from "@/lib/idp-verification-token";
import { cookies } from "next/headers";
import { IDP_PENDING_OAUTH_RESUME_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (idpSkipsVerificationEmail()) {
    return NextResponse.json({ ok: true });
  }

  let body: { email?: string; resume?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  let resumeJson = typeof body.resume === "string" ? body.resume.trim() : "";
  if (!resumeJson) {
    const jar = await cookies();
    resumeJson = jar.get(IDP_PENDING_OAUTH_RESUME_COOKIE)?.value ?? "";
  }
  if (!resumeJson) {
    return NextResponse.json({ error: "missing_resume" }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  if (!user || user.email_verified === 1) {
    return NextResponse.json({ ok: true });
  }

  const token = await createIdpEmailVerificationJwt({
    sub: user.sub,
    email: user.email,
    resumeJson,
  });

  const sent = await sendIdpVerificationEmail(user.email, token);
  if (!sent.success) {
    return NextResponse.json(
      { error: sent.error || "send_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
