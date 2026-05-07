import { Resend } from "resend";

import { getPublicIssuer } from "@/lib/public-url";

function getFromAddress(): string {
  return process.env.RESEND_FROM_ADDRESS || "trefolio <noreply@trefolio.com>";
}

function grantEmailHtml(args: {
  activateUrl: string;
  days: number;
  name: string;
  locale: string;
}): string {
  const isEs = args.locale.toLowerCase().startsWith("es");
  const heading = isEs ? "¡Te han concedido acceso Pro!" : "You've been granted Pro access";
  const body = isEs
    ? `El equipo de trefolio te ha concedido ${args.days} días de Trefolio Pro en tu cuenta unificada. El periodo empieza cuando actives el enlace — no antes.`
    : `The trefolio team granted you ${args.days} days of Trefolio Pro on your unified account. Your included period starts when you activate — not before.`;
  const cta = isEs ? "Activar membresía" : "Activate membership";

  return `<!DOCTYPE html>
<html lang="${isEs ? "es" : "en"}">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="480" style="max-width:480px;background:#fff;border-radius:16px;padding:32px;">
        <tr><td>
          <h1 style="margin:0 0 12px;font-size:22px;color:#0f172a;">${heading}</h1>
          <p style="margin:0 0 8px;color:#475569;">${isEs ? `Hola ${args.name},` : `Hi ${args.name},`}</p>
          <p style="margin:0 0 24px;color:#475569;line-height:1.6;">${body}</p>
          <a href="${args.activateUrl}" style="display:inline-block;padding:14px 28px;background:#059669;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;">${cta}</a>
          <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;word-break:break-all;"><a href="${args.activateUrl}" style="color:#059669;">${args.activateUrl}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function sendIdpMembershipGrantEmail(args: {
  to: string;
  displayName: string;
  locale: string;
  days: number;
  token: string;
}): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[idp-email] RESEND_API_KEY missing; cannot send membership grant.");
    return { success: false, error: "email_not_configured" };
  }

  const issuer = getPublicIssuer().replace(/\/+$/, "");
  const activateUrl = `${issuer}/membership-grant/activate?token=${encodeURIComponent(args.token)}`;
  const name =
    args.displayName?.trim() ||
    (args.locale.toLowerCase().startsWith("es") ? "hola" : "there");
  const isEs = args.locale.toLowerCase().startsWith("es");
  const subject = isEs
    ? "Te han concedido acceso Pro en trefolio"
    : "You've been granted trefolio Pro access";

  const resend = new Resend(apiKey);
  const text = `${subject}\n\n${activateUrl}`;

  try {
    const { error } = await resend.emails.send({
      from: getFromAddress(),
      to: args.to,
      subject,
      html: grantEmailHtml({
        activateUrl,
        days: args.days,
        name,
        locale: args.locale,
      }),
      text,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
