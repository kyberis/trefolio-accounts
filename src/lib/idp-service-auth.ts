import { NextRequest, NextResponse } from "next/server";

/** Validates `Authorization: Bearer IDP_SERVICE_TOKEN` for S2S routes. */
export function requireIdpServiceToken(req: NextRequest): NextResponse | null {
  const auth = req.headers.get("authorization") || "";
  const [scheme, token] = auth.split(" ");
  const expected = process.env.IDP_SERVICE_TOKEN;
  if (!expected || scheme !== "Bearer" || token !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
