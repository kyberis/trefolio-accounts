/** Limit open redirects after IdP sign-in. */
export function idpSafeInternalPath(next: string | undefined | null): string {
  const raw = (next || "/account").trim();
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return "/account";
  return raw.slice(0, 512) || "/account";
}
