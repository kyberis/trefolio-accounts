import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthorizePageFooter, AuthorizeBrandHeader, appKeyFromHint } from "@/components/Brand";
import { CheckEmailActions } from "@/components/CheckEmailActions";

export const dynamic = "force-dynamic";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const { e } = await searchParams;
  const email = typeof e === "string" ? decodeURIComponent(e).trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
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
            <h1>Check your email</h1>
            <p>We sent a verification link to confirm your trefolio account.</p>
          </div>
          <div className="card">
            <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--text-muted)" }}>
              Open the message we sent to{" "}
              <strong style={{ color: "var(--text)" }}>{email}</strong> and tap{" "}
              <strong>Verify Email</strong>. The link opens on{" "}
              <strong>user.trefolio.com</strong> and expires in 24 hours.
            </p>
            <CheckEmailActions email={email} />
          </div>
          <p className="legal">
            Wrong inbox?{" "}
            <Link href="/oauth2/authorize">
              Start over
            </Link>
          </p>
        </div>
      </main>
      <AuthorizePageFooter app={appKey} />
    </div>
  );
}
