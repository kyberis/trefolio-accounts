/**
 * IdP-side auth/billing breadcrumbs (no tokens, secrets, or passwords).
 */

type Level = "info" | "warn";

export type HeaderBag = Pick<Headers, "get">;

function probeInboundHeaders(h: HeaderBag): Record<string, unknown> {
  return {
    fwdHost: h.get("x-forwarded-host") ?? undefined,
    fwdProto: h.get("x-forwarded-proto") ?? undefined,
    cfRay: h.get("cf-ray") ?? undefined,
    vercelId: h.get("x-vercel-id") ?? undefined,
    requestId: h.get("x-request-id") ?? h.get("cf-request-id") ?? undefined,
  };
}

function probeDeployFields(): Record<string, unknown> {
  return {
    vercelEnv: process.env.VERCEL_ENV,
    region: process.env.VERCEL_REGION,
    deployCommit:
      typeof process.env.VERCEL_GIT_COMMIT_SHA === "string"
        ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12)
        : undefined,
    nodeEnv: process.env.NODE_ENV,
  };
}

function emit(
  level: Level,
  phase: string,
  data: Record<string, unknown>,
  inboundHeaders?: HeaderBag,
): void {
  const payload = JSON.stringify({
    svc: "accounts",
    phase,
    ts: new Date().toISOString(),
    ...probeDeployFields(),
    ...(inboundHeaders ? probeInboundHeaders(inboundHeaders) : {}),
    ...data,
  });
  if (level === "warn") console.warn("[accounts.auth.probe]", payload);
  else console.info("[accounts.auth.probe]", payload);
}

export function accountsAuthProbeLog(
  phase: string,
  data?: Record<string, unknown>,
  inboundHeaders?: HeaderBag,
): void {
  emit("info", phase, data ?? {}, inboundHeaders);
}

export function accountsAuthProbeWarn(
  phase: string,
  data?: Record<string, unknown>,
  inboundHeaders?: HeaderBag,
): void {
  emit("warn", phase, data ?? {}, inboundHeaders);
}

export function emailDomainHint(email: string | undefined | null): string | undefined {
  if (!email) return undefined;
  const at = email.indexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : undefined;
}

export function subTail(sub: string): string {
  if (sub.length <= 10) return "***";
  return `…${sub.slice(-8)}`;
}
