import { Resend } from "resend";

import { getPublicIssuer } from "@/lib/public-url";

function getFromAddress(): string {
  return process.env.RESEND_FROM_ADDRESS || "trefolio <noreply@trefolio.com>";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Tell the user their IdP account is approved and they can sign in to any
 * product (trefolio / Clara / Will). Best-effort; never throws to callers.
 */
export async function sendRegistrationApprovedEmail(args: {
  email: string;
  name?: string;
  locale?: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[idp-registration-approved] skipped RESEND_API_KEY unset");
    return { ok: false, reason: "not_configured" };
  }

  const issuer = getPublicIssuer().replace(/\/+$/, "");
  const loginUrl = `${issuer}/`;
  const displayName = (args.name || "").trim() || args.email;
  const es = (args.locale || "en").toLowerCase().startsWith("es");

  const subject = es
    ? "Tu cuenta ya está habilitada"
    : "Your account is ready";
  const heading = es
    ? "Listo — ya podés entrar"
    : "You're in — go ahead and sign in";
  const body = es
    ? "Un administrador habilitó tu cuenta de trefolio. Ya podés usar Clara, Will y el portfolio tracker."
    : "An administrator enabled your trefolio account. You can use Clara, Will, and the portfolio tracker.";
  const cta = es ? "Entrar" : "Sign in";

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 0;">
      <h2 style="margin:0 0 16px;">${escapeHtml(heading)}</h2>
      <p style="font-size:15px;line-height:1.5;color:#334155;">Hola ${escapeHtml(displayName)},</p>
      <p style="font-size:15px;line-height:1.5;color:#334155;">${escapeHtml(body)}</p>
      <p style="margin:24px 0;">
        <a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">${escapeHtml(cta)}</a>
      </p>
    </div>`;

  const text = [
    heading,
    "",
    `Hola ${displayName},`,
    body,
    "",
    `${cta}: ${loginUrl}`,
  ].join("\n");

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: getFromAddress(),
      to: args.email,
      subject,
      html,
      text,
    });
    if (error) {
      console.error("[idp-registration-approved] Resend error:", error.message);
      return { ok: false, reason: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.error(
      "[idp-registration-approved]",
      e instanceof Error ? e.message : String(e),
    );
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
