import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { IDP_SESSION_COOKIE, sessionCookieAttributes } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Clears IdP session cookie (same-origin account hub sign-out). */
export async function POST() {
  const store = await cookies();
  const attrs = sessionCookieAttributes();
  store.set(attrs.name, "", {
    httpOnly: attrs.httpOnly,
    sameSite: attrs.sameSite,
    path: attrs.path,
    secure: attrs.secure,
    maxAge: 0,
  });
  return NextResponse.json({ ok: true });
}
