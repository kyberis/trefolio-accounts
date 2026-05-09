import { NextResponse } from "next/server";

import {
  findActivePersonalAccessTokenByHash,
  touchPersonalAccessTokenLastUsed,
} from "@/lib/db";
import { hashPat, patPrefixOk } from "@/lib/personal-access-token-crypto";
import {
  getPatIntrospectionSecret,
  isPatIntrospectionAuthorized,
} from "@/lib/pat-introspection-auth";

export const dynamic = "force-dynamic";

const MCP_SCOPE = "mcp:ecosystem";

/**
 * Server-to-server: validates a user PAT minted on this IdP.
 *
 * `Authorization: Bearer <TREFOLIO_PAT_INTROSPECTION_SECRET>`
 * Body JSON: `{ "token": "tfp_pat_…" }`
 *
 * Response: `{ "active": true, "sub": "…", "token_id": "…", "scope": "mcp:ecosystem" }` or `{ "active": false }`.
 */
export async function POST(req: Request) {
  if (!getPatIntrospectionSecret()) {
    return NextResponse.json(
      { error: "pat_introspection_not_configured" },
      { status: 503 },
    );
  }
  if (!isPatIntrospectionAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { token?: string };
  try {
    body = (await req.json()) as { token?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const raw = String(body.token ?? "").trim();
  if (!raw || !patPrefixOk(raw)) {
    return NextResponse.json({ active: false });
  }

  const hit = await findActivePersonalAccessTokenByHash(hashPat(raw));
  if (!hit) {
    return NextResponse.json({ active: false });
  }

  void touchPersonalAccessTokenLastUsed(hit.id).catch((err) => {
    console.error("[pat/introspect] last_used bump failed", err);
  });

  return NextResponse.json({
    active: true,
    sub: hit.sub,
    token_id: hit.id,
    scope: MCP_SCOPE,
  });
}
