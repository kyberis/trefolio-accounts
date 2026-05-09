import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AccountHub from "./account-hub";
import { isGoogleConfigured } from "@/lib/google";
import { IDP_SESSION_COOKIE, verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Account · trefolio accounts",
  robots: { index: false, follow: false },
};

const FROM_APP = new Set(["clara", "will", "trefolio"]);

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const jar = await cookies();
  const sub = verifySession(jar.get(IDP_SESSION_COOKIE)?.value);
  if (!sub) {
    redirect(`/?next=${encodeURIComponent("/account")}`);
  }

  const raw = typeof searchParams.from === "string" ? searchParams.from : undefined;
  const fromApp =
    raw && FROM_APP.has(raw) ? (raw as "trefolio" | "clara" | "will") : undefined;

  return <AccountHub fromApp={fromApp} googleConfigured={isGoogleConfigured()} />;
}
