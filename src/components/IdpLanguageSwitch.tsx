import Link from "next/link";

import type { IdpLocale } from "@/lib/i18n/idp-locale";
import { LANGUAGE_CHOICES } from "@/lib/i18n/idp-messages";

export function IdpLanguageSwitch(props: {
  nextPath: string;
  current: IdpLocale;
  label: string;
}) {
  const enc = encodeURIComponent(props.nextPath);
  return (
    <nav className="idp-lang-switch" aria-label={props.label}>
      <span className="idp-lang-switch-label">{props.label}:</span>
      {LANGUAGE_CHOICES.map(({ locale, label }) =>
        locale === props.current ? (
          <span key={locale} className="idp-lang-current" aria-current="true">
            {label}
          </span>
        ) : (
          <Link
            key={locale}
            className="idp-lang-link"
            href={`/api/auth/set-ui-locale?locale=${locale}&next=${enc}`}
          >
            {label}
          </Link>
        ),
      )}
    </nav>
  );
}
