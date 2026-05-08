/**
 * IdP-side auth/billing breadcrumbs (no tokens, secrets, or passwords).
 */

type Level = "info" | "warn";

function emit(level: Level, phase: string, data: Record<string, unknown>): void {
  const payload = JSON.stringify({
    svc: "accounts",
    phase,
    ts: new Date().toISOString(),
    ...data,
  });
  if (level === "warn") console.warn("[accounts.auth.probe]", payload);
  else console.info("[accounts.auth.probe]", payload);
}

export function accountsAuthProbeLog(phase: string, data?: Record<string, unknown>): void {
  emit("info", phase, data ?? {});
}

export function accountsAuthProbeWarn(phase: string, data?: Record<string, unknown>): void {
  emit("warn", phase, data ?? {});
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
