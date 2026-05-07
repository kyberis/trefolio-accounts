/**
 * Per-product copy for `/upgrade?from=trefolio|clara|will`.
 * Keeps one Stripe product while tailoring the story to where the user arrived from.
 */

export type FromApp = "trefolio" | "clara" | "will";

export function parseFromApp(raw: string): FromApp {
  if (raw === "trefolio" || raw === "clara" || raw === "will") return raw;
  return "clara";
}

export function upgradeFromCssClass(from: FromApp): string {
  return `upgrade-from-${from}`;
}

type Bullet = { id: FromApp; title: string; body: string };

const BULLETS: Record<FromApp, Bullet> = {
  trefolio: {
    id: "trefolio",
    title: "trefolio",
    body:
      "Full portfolio tracking, broker imports, AI insights, and Pro limits on the web and mobile Warren apps.",
  },
  clara: {
    id: "clara",
    title: "Clara",
    body: "Financial agents with higher daily message limits for research, automation, and chat-first workflows.",
  },
  will: {
    id: "will",
    title: "Will",
    body: "Notes and AI assistance with Pro-grade daily quotas across Telegram and the web journal.",
  },
};

const BULLET_ORDER: Record<FromApp, FromApp[]> = {
  trefolio: ["trefolio", "clara", "will"],
  clara: ["clara", "trefolio", "will"],
  will: ["will", "trefolio", "clara"],
};

export function getUpgradeBullets(from: FromApp): Bullet[] {
  return BULLET_ORDER[from].map((id) => BULLETS[id]);
}

/** Main h1 on the upgrade page (server). */
export function getUpgradePageTitle(): string {
  return "Trefolio Pro";
}

/**
 * Paragraph body after the email line on the upgrade page (server).
 * The template wraps the address in <strong> separately.
 */
export function getUpgradePageLeadBody(from: FromApp): string {
  switch (from) {
    case "trefolio":
      return "You opened this upgrade from trefolio — one subscription unlocks Pro limits here, in Clara, and in Will.";
    case "clara":
      return "You opened this upgrade from Clara — one subscription raises your agent limits and also unlocks Pro on trefolio and Will.";
    case "will":
      return "You opened this upgrade from Will — one subscription raises your AI quotas and also unlocks Pro on trefolio and Clara.";
  }
}

/** Section heading on the benefits landing (client). */
export function getLandingBenefitsHeading(from: FromApp): string {
  switch (from) {
    case "trefolio":
      return "What Pro adds for you on trefolio";
    case "clara":
      return "What Pro adds for you on Clara";
    case "will":
      return "What Pro adds for you on Will";
  }
}

/** One line under the benefits heading. */
export function getLandingBenefitsSub(from: FromApp): string {
  switch (from) {
    case "trefolio":
      return "Your portfolio app is first — you still get the same Pro entitlements across the whole trefolio account.";
    case "clara":
      return "Clara is first — the same subscription covers Warren and Will with no extra checkout.";
    case "will":
      return "Will is first — the same subscription covers Warren and Clara with no extra checkout.";
  }
}

/** Footnote under the manual checkout CTA (non-countdown view). */
export function getCheckoutFootnote(from: FromApp): string {
  switch (from) {
    case "trefolio":
      return "Billing runs on your trefolio account at user.trefolio.com; Stripe emails the receipt. Clara and Will pick up Pro automatically.";
    case "clara":
      return "Billing runs on your trefolio account at user.trefolio.com; Stripe emails the receipt. trefolio and Will pick up Pro automatically.";
    case "will":
      return "Billing runs on your trefolio account at user.trefolio.com; Stripe emails the receipt. trefolio and Clara pick up Pro automatically.";
  }
}

/** Same ordering as benefit bullets — use for “where to go next” after checkout. */
export function getSuccessStepOrder(from: FromApp): FromApp[] {
  return BULLET_ORDER[from];
}
