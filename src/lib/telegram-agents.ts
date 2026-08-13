import { fetchTrefolioTelegramLinkStatus, getProductTargets } from "./product-links";

export type TelegramAgentId = "trefolio" | "will" | "clara" | "ops";

export interface TelegramAgentPayload {
  id: TelegramAgentId;
  title: string;
  description: string;
  linked: boolean | null;
  has_product_account: boolean | null;
  connect_url: string;
  staff_only?: boolean;
}

export async function buildTelegramAgentsPayload(
  sub: string,
  opts: { isStaff: boolean; opsTelegramLinked: boolean },
): Promise<TelegramAgentPayload[]> {
  const targets = getProductTargets();
  const trefolioTarget = targets.find((t) => t.app === "trefolio")!;
  const claraTarget = targets.find((t) => t.app === "clara")!;
  const willTarget = targets.find((t) => t.app === "will")!;

  const warren = await fetchTrefolioTelegramLinkStatus(sub);

  const agents: TelegramAgentPayload[] = [
    {
      id: "trefolio",
      title: "trefolio (Warren)",
      description:
        "Portfolio help, alerts, and Warren on Telegram. Sign in at trefolio with this account, then connect Telegram from your profile.",
      linked: warren.linked,
      has_product_account: warren.hasAccount,
      connect_url: `${trefolioTarget.baseUrl}/profile`,
    },
    {
      id: "will",
      title: "Will",
      description:
        "Notes and AI on Telegram and the web. Open Will and connect Telegram from the app if you use it there.",
      linked: null,
      has_product_account: null,
      connect_url: `${willTarget.baseUrl}/app`,
    },
    {
      id: "clara",
      title: "Clara",
      description:
        "Financial agents on the web. Use Clara in the browser; Telegram is not linked from this directory yet.",
      linked: null,
      has_product_account: null,
      connect_url: `${claraTarget.baseUrl}/app`,
    },
  ];

  if (opts.isStaff) {
    agents.push({
      id: "ops",
      title: "Business ops (staff)",
      description:
        "Platform staff bot (@trefoliobot): product alerts, IdP signups, billing, and daily digest. Same link as trefolio admin ProdOps.",
      linked: opts.opsTelegramLinked,
      has_product_account: true,
      connect_url: "",
      staff_only: true,
    });
  }

  return agents;
}
