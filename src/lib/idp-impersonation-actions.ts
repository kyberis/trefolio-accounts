"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { findUserBySub } from "@/lib/db";
import { getIdpAdmin, isAdminEmail } from "@/lib/admin";
import {
  IDP_IMPERSONATOR_COOKIE,
  IDP_SESSION_COOKIE,
  idpCookieAttributes,
  signSession,
  verifySession,
} from "@/lib/session";

/**
 * Operator signs in as another IdP user (sets `idp_session` to victim, stamps `idp_impersonator`).
 * Only callable by a real IdP admin — not while already impersonating.
 */
export async function impersonateUserAction(formData: FormData) {
  const ctx = await getIdpAdmin();
  if (!ctx) return;

  const store = await cookies();
  if (verifySession(store.get(IDP_IMPERSONATOR_COOKIE)?.value)) {
    return;
  }

  const sub = String(formData.get("sub") || "");
  if (!sub || sub === ctx.user.sub) return;

  const target = await findUserBySub(sub);
  if (!target) return;
  if (isAdminEmail(target.email)) return;

  const sessionAttrs = idpCookieAttributes(IDP_SESSION_COOKIE);
  const impAttrs = idpCookieAttributes(IDP_IMPERSONATOR_COOKIE);

  store.set(sessionAttrs.name, signSession(sub), {
    httpOnly: sessionAttrs.httpOnly,
    sameSite: sessionAttrs.sameSite,
    path: sessionAttrs.path,
    maxAge: sessionAttrs.maxAge,
    secure: sessionAttrs.secure,
  });
  store.set(impAttrs.name, signSession(ctx.user.sub), {
    httpOnly: impAttrs.httpOnly,
    sameSite: impAttrs.sameSite,
    path: impAttrs.path,
    maxAge: impAttrs.maxAge,
    secure: impAttrs.secure,
  });

  redirect("/");
}

/**
 * Restore operator session and clear impersonation stamp.
 */
export async function exitImpersonationAction() {
  const store = await cookies();
  const adminSub = verifySession(store.get(IDP_IMPERSONATOR_COOKIE)?.value);
  if (!adminSub) {
    redirect("/");
  }

  const admin = await findUserBySub(adminSub);
  const s = idpCookieAttributes(IDP_SESSION_COOKIE);
  const i = idpCookieAttributes(IDP_IMPERSONATOR_COOKIE);

  if (!admin || !isAdminEmail(admin.email)) {
    store.set(s.name, "", {
      httpOnly: s.httpOnly,
      sameSite: s.sameSite,
      path: s.path,
      maxAge: 0,
      secure: s.secure,
    });
    store.set(i.name, "", {
      httpOnly: i.httpOnly,
      sameSite: i.sameSite,
      path: i.path,
      maxAge: 0,
      secure: i.secure,
    });
    redirect("/");
  }

  store.set(s.name, signSession(adminSub), {
    httpOnly: s.httpOnly,
    sameSite: s.sameSite,
    path: s.path,
    maxAge: s.maxAge,
    secure: s.secure,
  });
  store.set(i.name, "", {
    httpOnly: i.httpOnly,
    sameSite: i.sameSite,
    path: i.path,
    maxAge: 0,
    secure: i.secure,
  });

  redirect("/admin/users");
}
