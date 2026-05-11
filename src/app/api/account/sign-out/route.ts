import { NextResponse } from "next/server";

import { sessionCookieAttributes } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Clears IdP session cookie (same-origin account hub sign-out). */
export async function POST() {
  const attrs = sessionCookieAttributes();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(attrs.name, "", {
    httpOnly: attrs.httpOnly,
    sameSite: attrs.sameSite,
    path: attrs.path,
    secure: attrs.secure,
    maxAge: 0,
  });
  return res;
}
