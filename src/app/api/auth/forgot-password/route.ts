import { NextRequest, NextResponse } from "next/server";

import { findUserByEmail } from "@/lib/db";
import { isBlockedEmailDomain } from "@/lib/blocked-email-domains";
import { idpSkipsPasswordResetEmail } from "@/lib/idp-email-policy";
import { sendIdpPasswordResetEmail } from "@/lib/idp-password-reset-email";
import { createIdpPasswordResetJwt } from "@/lib/idp-password-reset-token";
import { getPublicIssuer } from "@/lib/public-url";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { email?: string };
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

  if (isBlockedEmailDomain(email)) {
    return NextResponse.json({ ok: true });
  }

  const user = await findUserByEmail(email);
  if (user?.password_hash) {
    const token = await createIdpPasswordResetJwt({
      sub: user.sub,
      email: user.email,
    });

    const issuer = getPublicIssuer().replace(/\/+$/, "");
    const resetUrl = `${issuer}/account/reset-password?token=${encodeURIComponent(token)}`;

    if (idpSkipsPasswordResetEmail()) {
      console.info(`[idp-password-reset] email skipped (non-production); reset URL:\n${resetUrl}`);
    } else {
      const sent = await sendIdpPasswordResetEmail(user.email, token, user.locale);
      if (!sent.success) {
        console.warn("[idp-password-reset] send failed:", sent.error);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
