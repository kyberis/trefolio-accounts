import { findSubByMembershipGrantToken } from "@/lib/db";

import MembershipGrantActivateClient from "./membership-grant-activate-client";

export const dynamic = "force-dynamic";

export default async function MembershipGrantActivatePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const token = typeof searchParams.token === "string" ? searchParams.token.trim() : "";
  const tokenValid = token ? Boolean(await findSubByMembershipGrantToken(token)) : false;

  return <MembershipGrantActivateClient token={token} tokenValid={tokenValid} />;
}
