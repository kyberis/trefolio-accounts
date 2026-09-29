import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { findUserBySub } from "@/lib/db";
import { isRegistrationApproved } from "@/lib/registration-approval";
import { IDP_SESSION_COOKIE, verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Waiting for approval · trefolio accounts",
  robots: { index: false, follow: false },
};

export default async function PendingApprovalPage() {
  const jar = await cookies();
  const sub = verifySession(jar.get(IDP_SESSION_COOKIE)?.value);
  if (!sub) {
    redirect("/oauth2/authorize");
  }
  const user = await findUserBySub(sub);
  if (!user) {
    redirect("/oauth2/authorize");
  }
  if (isRegistrationApproved(user)) {
    redirect("/account");
  }

  return (
    <div className="page-shell">
      <main className="page-main">
        <div className="card-narrow">
          <h1>Tu cuenta está en espera</h1>
          <p>
            Recibimos tu registro. Un administrador tiene que habilitarla antes
            de que puedas usar trefolio, Clara o Will. Te vamos a avisar por
            email cuando esté lista.
          </p>
          <p>
            Your account is waiting for an operator to enable it. We will email
            you when you can sign in.
          </p>
          <p>
            <a href="/api/oauth2/end_session">Sign out</a>
          </p>
        </div>
      </main>
    </div>
  );
}
