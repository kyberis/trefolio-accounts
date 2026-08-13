import { createHash, timingSafeEqual } from "crypto";

import type { NextRequest } from "next/server";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function verifyIdpServiceBearer(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") || "";
  const [scheme, token] = auth.split(" ");
  const expected = process.env.IDP_SERVICE_TOKEN?.trim();
  if (!expected || scheme !== "Bearer" || !token) return false;
  const got = sha256(token);
  const want = sha256(expected);
  return got.length === want.length && timingSafeEqual(got, want);
}
