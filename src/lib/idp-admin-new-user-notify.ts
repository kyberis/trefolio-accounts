import { Resend } from "resend";

import { getPublicIssuer } from "@/lib/public-url";

const DEFAULT_NOTIFY_TO = "info@trefolio.com";

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
 * Infer how the user was provisioned for operator-facing mail (mirrors trefolio
 * `authProvider` strings in sendAdminNewCustomerNotification).
 */
export function inferIdpSignupAuthProvider(args: {
  googleId?: string;
  appleId?: string;
  passwordPlain?: string;
  passwordHash?: string;
}): string {
  if (args.googleId) return "Google";
  if (args.appleId) return "Apple";
  if (args.passwordPlain || args.passwordHash) return "Email";
  return "Other";
}

/**
 * Best-effort email to operators when a new IdP row is created — same role as
 * trefolio `sendAdminNewCustomerNotification` (production-only, Resend).
 * Failures are logged and must not block signup.
 */
export function notifyAdminOfNewIdpUser(args: {
  sub: string;
  email: string;
  name: string;
  authProvider: string;
}): void {
  if (process.env.NODE_ENV !== "production") return;

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to =
    process.env.SIGNUP_NOTIFY_EMAIL?.trim() || DEFAULT_NOTIFY_TO;
  if (!apiKey || !to) {
    console.warn(
      "[idp-admin-notify] skipped missing RESEND_API_KEY or notify recipient",
    );
    return;
  }

  const providerLabel =
    args.authProvider.charAt(0).toUpperCase() + args.authProvider.slice(1);
  const displayName = args.name.trim() || "—";
  const issuer = getPublicIssuer().replace(/\/+$/, "");
  const adminLine = issuer ? `\nIdP admin: ${issuer}/admin` : "";

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 0;">
      <h2 style="color:#10b981;margin:0 0 16px;">trefolio IdP — New user</h2>
      <table style="width:100%;border-collapse:collapse;font-size:15px;">
        <tr><td style="padding:8px 0;color:#64748b;">Name</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(displayName)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Email</td><td style="padding:8px 0;">${escapeHtml(args.email)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Sub</td><td style="padding:8px 0;font-size:13px;word-break:break-all;">${escapeHtml(args.sub)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Auth</td><td style="padding:8px 0;">${escapeHtml(providerLabel)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">When</td><td style="padding:8px 0;">${escapeHtml(new Date().toISOString())}</td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:13px;color:#64748b;">Context: unified account created on user.trefolio.com (IdP).</p>
    </div>`;

  const text = [
    "trefolio IdP — New user",
    "",
    `Name: ${displayName}`,
    `Email: ${args.email}`,
    `Sub: ${args.sub}`,
    `Auth: ${providerLabel}`,
    `When: ${new Date().toISOString()}`,
    "",
    "Context: unified account created on user.trefolio.com (IdP).",
    adminLine,
  ].join("\n");

  void (async () => {
    try {
      const resend = new Resend(apiKey);
      const { error } = await resend.emails.send({
        from: getFromAddress(),
        to,
        subject: `[trefolio IdP] New user: ${displayName !== "—" ? displayName : args.email}`,
        html,
        text,
      });
      if (error) {
        console.error("[idp-admin-notify] Resend error:", error.message);
      }
      const { ingestProdOpsEvent } = await import("./trefolio-prodops");
      const domain = args.email.includes("@") ? args.email.split("@")[1]!.slice(0, 48) : "";
      const tail = domain ? ` · @${domain}` : "";
      const subShort = args.sub.length > 12 ? `${args.sub.slice(0, 12)}…` : args.sub;
      await ingestProdOpsEvent({
        eventType: "user_registered",
        userId: args.sub,
        dedupeKey: `accounts:user_registered:${args.sub}`,
        summary: `IdP signup · ${subShort}${tail}`,
        metadata: { displayName: args.name, emailDomain: domain },
      });
    } catch (e) {
      console.error(
        "[idp-admin-notify]",
        e instanceof Error ? e.message : String(e),
      );
    }
  })();
}
