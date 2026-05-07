import { NextRequest, NextResponse } from "next/server";

import { syncTrialTokenFromProductApp } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Service token: trefolio cron copies trial_token onto the IdP so invitation
 * links hosted on user.trefolio.com can be validated and activated.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || token !== process.env.IDP_SERVICE_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const trialToken = String(body.trialToken || "").trim();
  if (!email || !trialToken) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const result = await syncTrialTokenFromProductApp(email, trialToken);
  if (!result.ok) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
