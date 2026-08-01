import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

import { isAdminEmail } from "@/lib/admin";
import { deleteUserBySub, findUserBySub } from "@/lib/db";
import { cancelStripeSubscriptionsForAccountDeletion } from "@/lib/idp-stripe-subscription";
import { notifyTrefolioAccountDeleted } from "@/lib/product-links";
import {
  IDP_IMPERSONATOR_COOKIE,
  IDP_SESSION_COOKIE,
  sessionCookieAttributes,
  verifySession,
} from "@/lib/session";

export const dynamic = "force-dynamic";

/** bcrypt only uses the first 72 bytes; keep input bounded. */
const MAX_PASSWORD_LEN = 72;

/** Typed confirmation for passwordless (Google/passkey-only) accounts. */
export const DELETE_CONFIRM_PHRASE = "DELETE";

async function sessionSub(): Promise<string | null> {
  const store = await cookies();
  return verifySession(store.get(IDP_SESSION_COOKIE)?.value);
}

function clearSessionCookie(res: NextResponse): void {
  const attrs = sessionCookieAttributes();
  res.cookies.set(attrs.name, "", {
    httpOnly: attrs.httpOnly,
    sameSite: attrs.sameSite,
    path: attrs.path,
    secure: attrs.secure,
    maxAge: 0,
  });
  res.cookies.set(IDP_IMPERSONATOR_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
}

export async function POST(req: NextRequest) {
  const store = await cookies();
  if (store.get(IDP_IMPERSONATOR_COOKIE)?.value) {
    return NextResponse.json({ error: "impersonation_forbidden" }, { status: 403 });
  }

  const sub = await sessionSub();
  if (!sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await findUserBySub(sub);
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (isAdminEmail(user.email)) {
    return NextResponse.json({ error: "admin_accounts_cannot_be_deleted" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  const confirm = typeof body.confirm === "string" ? body.confirm.trim() : "";
  const hasPassword = Boolean(user.password_hash?.trim());

  if (hasPassword) {
    if (!password || password.length > MAX_PASSWORD_LEN) {
      return NextResponse.json({ error: "password_required" }, { status: 400 });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return NextResponse.json({ error: "wrong_password" }, { status: 401 });
  } else {
    if (confirm !== DELETE_CONFIRM_PHRASE) {
      return NextResponse.json({ error: "confirm_required" }, { status: 400 });
    }
  }

  try {
    await cancelStripeSubscriptionsForAccountDeletion(sub);
    // Notify product analytics / local purge before IdP row is gone.
    await notifyTrefolioAccountDeleted(sub);
    await deleteUserBySub(sub);
  } catch (err) {
    console.error("[account/delete] failed", err);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
