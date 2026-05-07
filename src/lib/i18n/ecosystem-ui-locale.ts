/**
 * Shared non-secret cookie so product apps and the IdP agree on UI language for
 * OIDC (see stocktracker `src/lib/idp/ecosystem-ui-locale.ts` — keep in sync).
 */
export const TREFOLIO_UI_LOCALE_COOKIE = "trefolio_ui_locale";

const IDP_SUPPORTED = new Set(["en", "de", "es", "fr", "it"]);

export function mapAppLanguageToIdpUiLocalesTag(lang: string | undefined | null): string {
  if (!lang?.trim()) return "en";
  const primary = lang.trim().toLowerCase().split(/[-_]/)[0];
  if (IDP_SUPPORTED.has(primary)) return primary;
  return "en";
}

export function ecosystemCookieDomainFromHost(host: string | null | undefined): string | undefined {
  if (!host) return undefined;
  const h = host.split(",")[0]?.trim().split(":")[0]?.toLowerCase() ?? "";
  if (!h || h === "localhost" || h.startsWith("127.")) return undefined;
  const parts = h.split(".");
  if (parts.length < 2) return undefined;
  return `.${parts.slice(-2).join(".")}`;
}
