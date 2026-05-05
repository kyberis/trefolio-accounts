import { redirect } from "next/navigation";

import {
  AuthorizeBrandHeader,
  AuthorizePageFooter,
  appKeyFromHint,
} from "@/components/Brand";
import { EmailConfirmedCountdown } from "@/components/EmailConfirmedCountdown";

export const dynamic = "force-dynamic";

export default async function EmailConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" ? next.trim() : "";
  if (!nextPath.startsWith("/oauth2/authorize?")) {
    redirect("/");
  }

  const appKey = appKeyFromHint(undefined);

  return (
    <div className="page-shell" data-authorize-app={appKey}>
      <main className="page-main">
        <div className="card-narrow">
          <div style={{ textAlign: "center" }}>
            <AuthorizeBrandHeader app={appKey} />
          </div>
          <div className="heading-stack">
            <h1>Email confirmed</h1>
            <p>
              Your email is verified. You can use this account on trefolio, Clara, and Will.
            </p>
          </div>
          <div className="card" style={{ textAlign: "center" }}>
            <p style={{ margin: "0 0 8px", fontSize: 44, lineHeight: 1 }} aria-hidden="true">
              ✓
            </p>
            <EmailConfirmedCountdown nextPath={nextPath} seconds={5} />
          </div>
        </div>
      </main>
      <AuthorizePageFooter app={appKey} />
    </div>
  );
}
