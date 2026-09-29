import { NextRequest, NextResponse } from "next/server";

import { approveRegistration, findUserBySub } from "@/lib/db";
import { sendRegistrationApprovedEmail } from "@/lib/idp-registration-approved-email";
import { verifyRegistrationApprovalJwt } from "@/lib/registration-approval";

export const dynamic = "force-dynamic";

function htmlPage(title: string, body: string, ok: boolean): NextResponse {
  const color = ok ? "#10b981" : "#b91c1c";
  return new NextResponse(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
</head>
<body style="margin:0;font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;">
  <main style="max-width:480px;margin:72px auto;padding:0 20px;">
    <h1 style="color:${color};font-size:22px;">${title}</h1>
    <p style="line-height:1.55;color:#334155;">${body}</p>
    <p><a href="/admin/users" style="color:#0f172a;">IdP admin</a></p>
  </main>
</body>
</html>`,
    {
      status: ok ? 200 : 400,
      headers: { "content-type": "text/html; charset=utf-8" },
    },
  );
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const parsed = token ? await verifyRegistrationApprovalJwt(token) : null;
  if (!parsed) {
    return htmlPage(
      "Invalid or expired link",
      "This approval link is not valid. Ask the operator to send a new one from the IdP admin.",
      false,
    );
  }

  const existing = await findUserBySub(parsed.sub);
  if (!existing || existing.email.toLowerCase() !== parsed.email.toLowerCase()) {
    return htmlPage(
      "User not found",
      "That account is no longer on the identity service.",
      false,
    );
  }

  const result = await approveRegistration(parsed.sub);
  if (!result.user) {
    return htmlPage("User not found", "That account is no longer on the identity service.", false);
  }

  if (!result.alreadyApproved) {
    void sendRegistrationApprovedEmail({
      email: result.user.email,
      name: result.user.name,
      locale: result.user.locale,
    });
  }

  return htmlPage(
    result.alreadyApproved ? "Already approved" : "Account approved",
    result.alreadyApproved
      ? `${result.user.email} was already enabled. They can sign in to trefolio, Clara, and Will.`
      : `${result.user.email} is now enabled. We emailed them that they can sign in.`,
    true,
  );
}
