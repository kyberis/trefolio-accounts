import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  countPersonalAccessTokensCreatedInLastHour,
  insertPersonalAccessToken,
  listPersonalAccessTokensForSub,
} from "@/lib/db";
import { generatePatPlaintext } from "@/lib/personal-access-token-crypto";
import { IDP_SESSION_COOKIE, verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";

const MAX_CREATE_PER_HOUR = 3;

export async function GET() {
  const jar = await cookies();
  const sub = verifySession(jar.get(IDP_SESSION_COOKIE)?.value);
  if (!sub) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tokens = await listPersonalAccessTokensForSub(sub);
  return NextResponse.json({
    tokens: tokens.map((t) => ({
      id: t.id,
      prefix: t.prefix,
      name: t.name,
      created_at: t.created_at,
      last_used_at: t.last_used_at,
      expires_at: t.expires_at,
      revoked_at: t.revoked_at,
    })),
  });
}

export async function POST(req: Request) {
  const jar = await cookies();
  const sub = verifySession(jar.get(IDP_SESSION_COOKIE)?.value);
  if (!sub) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const recent = await countPersonalAccessTokensCreatedInLastHour(sub);
  if (recent >= MAX_CREATE_PER_HOUR) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many tokens created. Try again later." },
      { status: 429 },
    );
  }

  let name = "MCP";
  let expiresInDays: number | null = null;
  try {
    const body = (await req.json()) as { name?: string; expires_in_days?: number | null };
    if (typeof body.name === "string" && body.name.trim()) {
      name = body.name.trim().slice(0, 80);
    }
    if (body.expires_in_days === null || body.expires_in_days === undefined) {
      expiresInDays = null;
    } else if (typeof body.expires_in_days === "number" && body.expires_in_days > 0) {
      expiresInDays = Math.min(365, Math.floor(body.expires_in_days));
    }
  } catch {
    // empty body ok
  }

  const gen = generatePatPlaintext();
  const expiresAt =
    expiresInDays != null
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  const { id } = await insertPersonalAccessToken({
    sub,
    tokenHash: gen.tokenHash,
    prefix: gen.prefix,
    name,
    expiresAt,
  });

  return NextResponse.json({
    id,
    token: gen.plaintext,
    prefix: gen.prefix,
    name,
    expires_at: expiresAt?.toISOString() ?? null,
  });
}
