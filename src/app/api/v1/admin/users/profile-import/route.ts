import { NextRequest, NextResponse } from "next/server";

import { findUserBySub, updateUserBySub } from "@/lib/db";

export const dynamic = "force-dynamic";

function unauthorized(req: NextRequest): NextResponse | null {
  const auth = req.headers.get("authorization") || "";
  const [scheme, token] = auth.split(" ");
  const expected = process.env.IDP_SERVICE_TOKEN;
  if (!expected || scheme !== "Bearer" || token !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * One-shot migration: merge profile fields from product apps into IdP users.
 *
 * `fill_empty` — only set a field when IdP currently has empty string for it.
 * `overwrite` — set provided fields unconditionally.
 */
export async function POST(req: NextRequest) {
  const fail = unauthorized(req);
  if (fail) return fail;

  const body = await req.json().catch(() => ({}));
  const sub = String(body.sub || "").trim();
  if (!sub) return NextResponse.json({ error: "missing_sub" }, { status: 400 });

  const mode = body.mode === "overwrite" ? "overwrite" : "fill_empty";

  const user = await findUserBySub(sub);
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const incomingName =
    body.name !== undefined ? String(body.name ?? "").trim() : undefined;
  const incomingAvatar =
    body.avatar_url !== undefined ? String(body.avatar_url ?? "").trim() : undefined;
  const incomingTax =
    body.tax_residency !== undefined ? String(body.tax_residency ?? "").trim().toUpperCase() : undefined;

  const patch: Parameters<typeof updateUserBySub>[1] = {};

  if (incomingName !== undefined && incomingName) {
    if (mode === "overwrite" || !user.name?.trim()) {
      patch.name = incomingName;
    }
  }

  if (incomingAvatar !== undefined) {
    if (mode === "overwrite") {
      patch.avatar_url = incomingAvatar;
    } else if (!user.avatar_url?.trim() && incomingAvatar) {
      patch.avatar_url = incomingAvatar;
    }
  }

  if (incomingTax !== undefined) {
    const tax = incomingTax.slice(0, 2);
    if (mode === "overwrite") {
      patch.tax_residency = tax;
    } else if (!user.tax_residency?.trim() && tax) {
      patch.tax_residency = tax;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, sub, updated: false });
  }

  await updateUserBySub(sub, patch);
  return NextResponse.json({ ok: true, sub, updated: true, patch });
}
