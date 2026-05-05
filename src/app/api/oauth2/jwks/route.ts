import { NextResponse } from "next/server";
import { getPublicJwk } from "@/lib/oidc";

export const dynamic = "force-dynamic";

export async function GET() {
  const jwk = await getPublicJwk();
  return NextResponse.json({ keys: [jwk] });
}
