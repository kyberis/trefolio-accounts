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
      "Full portfolio tracking, broker imports, and AI insights on the web and mobile Warren apps — plus the same Pro tier on Clara and Will.",
  },
  clara: {
    id: "clara",
    title: "Clara",
    body:
      "Financial agents for research and automation with a much higher per-day AI message cap on Pro than on Free — same login as trefolio and Will.",
  },
  will: {
    id: "will",
    title: "Will",
    body:
      "Notes and AI on Telegram and the web journal with a much higher per-day message cap on Pro than on Free — same login as trefolio and Clara.",
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
      return "You opened this upgrade from trefolio — one subscription unlocks Pro here and raises per-day AI caps on Clara and Will with the same account.";
    case "clara":
      return "You opened this upgrade from Clara — one subscription unlocks much higher per-day agent limits here, Pro on trefolio, and the same higher AI caps on Will.";
    case "will":
      return "You opened this upgrade from Will — one subscription unlocks much higher per-day AI limits here, Pro on trefolio, and the same higher caps on Clara.";
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
      return "One checkout covers the whole bundle: Warren, Clara, and Will share Pro entitlements and higher per-day AI message caps on the assistants.";
    case "clara":
      return "Clara is first — the same subscription covers Warren and Will with no extra checkout, including higher per-day AI caps on both assistants.";
    case "will":
      return "Will is first — the same subscription covers Warren and Clara with no extra checkout, including higher per-day AI caps on both assistants.";
  }
}

/** Footnote under the checkout CTA. */
export function getCheckoutFootnote(from: FromApp): string {
  switch (from) {
    case "trefolio":
      return "Billing runs on your trefolio account at user.trefolio.com; Stripe emails the receipt. Clara and Will pick up Pro automatically with higher per-day AI caps than Free (fair use may apply).";
    case "clara":
      return "Billing runs on your trefolio account at user.trefolio.com; Stripe emails the receipt. trefolio and Will pick up Pro automatically with higher per-day AI caps than Free (fair use may apply).";
    case "will":
      return "Billing runs on your trefolio account at user.trefolio.com; Stripe emails the receipt. trefolio and Clara pick up Pro automatically with higher per-day AI caps than Free (fair use may apply).";
  }
}

/** Same ordering as benefit bullets — use for “where to go next” after checkout. */
export function getSuccessStepOrder(from: FromApp): FromApp[] {
  return BULLET_ORDER[from];
}
