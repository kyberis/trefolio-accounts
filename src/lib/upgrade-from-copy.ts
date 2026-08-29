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
      "Portfolio tracking, broker imports, and AI insights on web and mobile — paid plans raise quotas here and on Clara and Will.",
  },
  clara: {
    id: "clara",
    title: "Clara",
    body:
      "Personal-finance agents with higher per-day AI caps on paid plans than on Free — same login as trefolio and Will.",
  },
  will: {
    id: "will",
    title: "Will",
    body:
      "Notes and AI on Telegram and the web journal with higher per-day caps on paid plans than on Free — same login as trefolio and Clara.",
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
  return "Choose your plan";
}

/**
 * Paragraph body after the email line on the upgrade page (server).
 * The template wraps the address in <strong> separately.
 */
export function getUpgradePageLeadBody(from: FromApp): string {
  switch (from) {
    case "trefolio":
      return "You opened this from trefolio — one subscription covers Basic, Pro, or Wealth here and raises per-day AI caps on Clara and Will with the same account. Upgrading a paid plan credits unused time on the same invoice.";
    case "clara":
      return "You opened this from Clara — one subscription raises per-day agent limits here and on Will, and unlocks the matching trefolio plan. Upgrading a paid plan credits unused time on the same invoice.";
    case "will":
      return "You opened this from Will — one subscription raises per-day AI limits here and on Clara, and unlocks the matching trefolio plan. Upgrading a paid plan credits unused time on the same invoice.";
  }
}

/** Section heading on the benefits landing (client). */
export function getLandingBenefitsHeading(from: FromApp): string {
  switch (from) {
    case "trefolio":
      return "What a paid plan adds for you on trefolio";
    case "clara":
      return "What a paid plan adds for you on Clara";
    case "will":
      return "What a paid plan adds for you on Will";
  }
}

/** One line under the benefits heading. */
export function getLandingBenefitsSub(from: FromApp): string {
  switch (from) {
    case "trefolio":
      return "One checkout covers the whole bundle. Warren, Clara, and Will share the plan you pick and higher per-day AI caps on the assistants. Switching paid plans credits unused time on the same invoice.";
    case "clara":
      return "Clara is first — the same subscription covers Warren and Will with no extra checkout, including higher per-day AI caps on both assistants. Switching paid plans credits unused time on the same invoice.";
    case "will":
      return "Will is first — the same subscription covers Warren and Clara with no extra checkout, including higher per-day AI caps on both assistants. Switching paid plans credits unused time on the same invoice.";
  }
}

/** Footnote under the checkout CTA. */
export function getCheckoutFootnote(from: FromApp): string {
  switch (from) {
    case "trefolio":
      return "Billing runs on your trefolio account at user.trefolio.com; Stripe emails the receipt. Clara and Will pick up the same plan automatically (fair use may apply).";
    case "clara":
      return "Billing runs on your trefolio account at user.trefolio.com; Stripe emails the receipt. trefolio and Will pick up the same plan automatically (fair use may apply).";
    case "will":
      return "Billing runs on your trefolio account at user.trefolio.com; Stripe emails the receipt. trefolio and Clara pick up the same plan automatically (fair use may apply).";
  }
}

/** Same ordering as benefit bullets — use for “where to go next” after checkout. */
export function getSuccessStepOrder(from: FromApp): FromApp[] {
  return BULLET_ORDER[from];
}
