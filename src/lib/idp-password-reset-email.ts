import { Resend } from "resend";

import { getIdpPasswordResetEmailStrings } from "@/lib/i18n/idp-messages";
import type { IdpLocale } from "@/lib/i18n/idp-locale";
import { normalizeIdpLocale } from "@/lib/i18n/idp-locale";
import { getPublicIssuer } from "@/lib/public-url";
import { idpSkipsPasswordResetEmail } from "@/lib/idp-email-policy";

const LOGO_BASE =
  process.env.TREFOLIO_EMAIL_ASSETS_ORIGIN || "https://trefolio.com";

function emailLogoCell(): string {
  return `<td style="width:36px;height:36px;vertical-align:middle;">
  <img src="${LOGO_BASE}/email-logo@2x.png" alt="" width="36" height="36" style="display:block;width:36px;height:36px;border-radius:8px;" />
</td>`;
}

function passwordResetEmailHtml(resetUrl: string, locale: IdpLocale): string {
  const s = getIdpPasswordResetEmailStrings(locale);
  return `<!DOCTYPE html>
<html lang="${s.htmlLang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#059669 0%,#10b981 100%);padding:32px 32px 28px;text-align:center;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr>
              ${emailLogoCell()}
              <td style="padding-left:10px;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">trefolio</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:36px 32px 16px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;text-align:center;">${s.heading}</h1>
          <p style="margin:0 0 28px;font-size:15px;color:#475569;text-align:center;line-height:1.6;">${s.body}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr><td align="center">
              <a href="${resetUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 36px;background-color:#10b981;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:10px;letter-spacing:0.2px;">${s.ctaLabel}</a>
            </td></tr>
          </table>
          <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.5;">${s.fallbackLink}</p>
          <p style="margin:6px 0 0;font-size:12px;color:#10b981;text-align:center;word-break:break-all;line-height:1.5;">
            <a href="${resetUrl}" style="color:#10b981;text-decoration:underline;">${resetUrl}</a>
          </p>
        </td></tr>
        <tr><td style="padding:0 32px;"><div style="border-top:1px solid #e2e8f0;margin:24px 0;"></div></td></tr>
        <tr><td style="padding:0 32px 32px;">
          <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;text-align:center;line-height:1.5;">${s.expiry}</p>
          <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.5;">${s.ignore}</p>
        </td></tr>
      </table>
      <p style="margin:24px 0 0;font-size:11px;color:#94a3b8;text-align:center;">
        &copy; ${new Date().getFullYear()} trefolio — ${s.footerLine}
      </p>
    </td></tr>
  </table>
</body>
</html>`;
}

function getFromAddress(): string {
  return process.env.RESEND_FROM_ADDRESS || "trefolio <noreply@trefolio.com>";
}

export async function sendIdpPasswordResetEmail(
  email: string,
  token: string,
  localeInput?: string,
): Promise<{ success: boolean; error?: string }> {
  if (idpSkipsPasswordResetEmail()) {
    return { success: true };
  }

  const locale = normalizeIdpLocale(localeInput);
  const s = getIdpPasswordResetEmailStrings(locale);

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[idp-email] RESEND_API_KEY missing; cannot send password reset mail.");
    return { success: false, error: "email_not_configured" };
  }

  const issuer = getPublicIssuer().replace(/\/+$/, "");
  const resetUrl = `${issuer}/account/reset-password?token=${encodeURIComponent(token)}`;

  const resend = new Resend(apiKey);
  const textBody = `${s.heading}\n\n${s.body}\n\n${resetUrl}\n\n${s.expiry}\n\n${s.ignore}`;
  try {
    const { data, error } = await resend.emails.send({
      from: getFromAddress(),
      to: email,
      subject: s.subject,
      html: passwordResetEmailHtml(resetUrl, locale),
      text: textBody,
    });
    if (error) return { success: false, error: error.message };
    if (data?.id) {
      console.info("[idp-password-reset] Resend accepted, id:", data.id);
    }
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}
