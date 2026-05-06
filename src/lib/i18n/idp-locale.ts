export const IDP_LOCALES = ["en", "de", "es", "fr", "it"] as const;

export type IdpLocale = (typeof IDP_LOCALES)[number];

export const IDP_UI_LOCALE_COOKIE = "idp_ui_locale";

export function isIdpLocale(value: string | undefined | null): value is IdpLocale {
  return Boolean(value && (IDP_LOCALES as readonly string[]).includes(value));
}

export function normalizeIdpLocale(value: unknown): IdpLocale {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];
  return isIdpLocale(raw) ? raw : "en";
}

/**
 * Parse OIDC `ui_locales` (space-separated BCP47 tags); return first matching supported language.
 */
export function firstSupportedFromUiLocalesParam(uiLocales: string | undefined | null): IdpLocale | null {
  if (!uiLocales?.trim()) return null;
  const parts = uiLocales.trim().split(/\s+/);
  for (const p of parts) {
    const n = normalizeIdpLocale(p);
    if (n !== "en") return n;
  }
  for (const p of parts) {
    if (p.toLowerCase().startsWith("en")) return "en";
  }
  return null;
}

function firstSupportedFromAcceptLanguage(header: string | null): IdpLocale | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim();
    if (!tag) continue;
    const n = normalizeIdpLocale(tag);
    if (n !== "en") return n;
  }
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim();
    if (tag?.toLowerCase().startsWith("en")) return "en";
  }
  return null;
}

export function resolveIdpLocale(args: {
  uiLocalesParam?: string | null;
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
}): IdpLocale {
  const fromOidc = firstSupportedFromUiLocalesParam(args.uiLocalesParam ?? "");
  if (fromOidc) return fromOidc;
  if (isIdpLocale(args.cookieLocale)) return args.cookieLocale;
  const fromAl = firstSupportedFromAcceptLanguage(args.acceptLanguage ?? null);
  if (fromAl) return fromAl;
  return "en";
}
