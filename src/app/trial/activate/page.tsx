import { redirect } from "next/navigation";

import { checkTrialTokenIdp } from "@/lib/db";
import { getProductTargets } from "@/lib/product-links";

import TrialActivateClient from "./trial-activate-client";

export const dynamic = "force-dynamic";

export default async function TrialActivatePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const raw = searchParams.token;
  const token = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  if (!token) redirect("/");

  const tokenStatus = await checkTrialTokenIdp(token);
  const welcomeHref = `${getProductTargets()[0].baseUrl}/trial/welcome`;

  return <TrialActivateClient token={token} tokenStatus={tokenStatus} welcomeHref={welcomeHref} />;
}
