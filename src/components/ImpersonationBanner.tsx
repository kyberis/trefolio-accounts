import { cookies } from "next/headers";

import { findUserBySub } from "@/lib/db";
import {
  IDP_IMPERSONATOR_COOKIE,
  IDP_SESSION_COOKIE,
  verifySession,
} from "@/lib/session";
import { exitImpersonationAction } from "@/lib/idp-impersonation-actions";

/**
 * Shown when an IdP admin used “Sign in as this user”: primary session is the
 * victim; `idp_impersonator` holds the operator’s sub (signed).
 */
export async function ImpersonationBanner() {
  const store = await cookies();
  const impersonatorSub = verifySession(store.get(IDP_IMPERSONATOR_COOKIE)?.value);
  if (!impersonatorSub) return null;

  const victimSub = verifySession(store.get(IDP_SESSION_COOKIE)?.value);
  if (!victimSub) return null;

  const [operator, victim] = await Promise.all([
    findUserBySub(impersonatorSub),
    findUserBySub(victimSub),
  ]);
  if (!operator || !victim) return null;

  return (
    <div className="impersonation-banner" role="region" aria-label="Impersonation session">
      <div className="impersonation-banner-inner">
        <p>
          You are signed in as <strong>{victim.email}</strong>
          <span className="impersonation-banner-meta">
            {" "}
            · operator <span className="mono">{operator.email}</span>
          </span>
        </p>
        <form action={exitImpersonationAction}>
          <button type="submit" className="btn-mini impersonation-banner-exit">
            Exit to admin
          </button>
        </form>
      </div>
    </div>
  );
}
