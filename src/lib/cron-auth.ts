import { NextRequest, NextResponse } from "next/server";

/**
 * Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` when configured.
 * Also accept `x-vercel-cron: 1` for project cron jobs (defense in depth: still set CRON_SECRET in production).
 */
export function verifyIdpCronAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization") || "";
  const vercelCron = req.headers.get("x-vercel-cron");
  if (vercelCron === "1") return true;
  if (!secret) return process.env.NODE_ENV !== "production";
  return auth === `Bearer ${secret}`;
}
