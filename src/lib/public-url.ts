function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getPublicIssuer(): string {
  const raw =
    process.env.IDP_ISSUER ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_BASE_URL ||
    "http://localhost:3300";
  return trimTrailingSlash(raw);
}
