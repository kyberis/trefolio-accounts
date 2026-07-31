/** MCP PAT scopes — mirrored in trefolio MCP enforcement and IdP token minting. */
export const TREFOLIO_PAT_SCOPE_IDS = [
  "portfolio:read",
  "tools:read",
  "warren:moat",
  "warren:ai",
  "tax:read",
  "portfolio:write",
  "market:fmp",
] as const;

export const CLARA_PAT_SCOPE_IDS = ["finance:read", "finance:write"] as const;

export const WILL_PAT_SCOPE_IDS = ["notes:read", "notes:write"] as const;

export const MCP_PAT_SCOPE_IDS = [
  ...TREFOLIO_PAT_SCOPE_IDS,
  ...CLARA_PAT_SCOPE_IDS,
  ...WILL_PAT_SCOPE_IDS,
] as const;

export type McpPatScope = (typeof MCP_PAT_SCOPE_IDS)[number];

/** Default scopes for newly minted PATs (sister apps are opt-in). */
export const DEFAULT_MCP_PAT_SCOPES: McpPatScope[] = [
  "portfolio:read",
  "tools:read",
  "warren:moat",
];

/** Legacy tokens with null/empty scopes_json receive full ecosystem access. */
export const LEGACY_MCP_PAT_SCOPES: McpPatScope[] = [...MCP_PAT_SCOPE_IDS];

export const MCP_PAT_SCOPE_LABELS: Record<McpPatScope, { title: string; description: string }> = {
  "portfolio:read": {
    title: "Portfolio read",
    description: "Portfolios, holdings, cash, live summary, quotes (trefolio)",
  },
  "tools:read": {
    title: "Tools read",
    description: "Transactions, dividends, screener, alerts, watchlist, news, portfolio score",
  },
  "warren:moat": {
    title: "Warren MOAT",
    description: "MOAT evaluation, screener, saved reports (read)",
  },
  "warren:ai": {
    title: "Warren AI narrative",
    description: "AI markdown narrative for MOAT (uses ai_consult quota)",
  },
  "tax:read": {
    title: "Tax reports",
    description: "Year-end tax report data (sensitive; not filing advice)",
  },
  "portfolio:write": {
    title: "Save MOAT reports",
    description: "Persist MOAT evaluations to your library",
  },
  "market:fmp": {
    title: "FMP market data",
    description: "Financial Modeling Prep stable API proxy via trefolio MCP (Pro; rate limited)",
  },
  "finance:read": {
    title: "Clara read",
    description: "Budget, expenses, savings summary via Clara MCP",
  },
  "finance:write": {
    title: "Clara write",
    description: "Create or update Clara expenses and savings (requires confirm on mutating tools)",
  },
  "notes:read": {
    title: "Will read",
    description: "Search and list notes via Will MCP",
  },
  "notes:write": {
    title: "Will write",
    description: "Create notes via Will MCP (logNote / createNote)",
  },
};

export function isMcpPatScope(value: string): value is McpPatScope {
  return (MCP_PAT_SCOPE_IDS as readonly string[]).includes(value);
}

export function normalizeMcpPatScopes(input: unknown): McpPatScope[] | null {
  if (input == null) return null;
  if (!Array.isArray(input)) return [];
  const out: McpPatScope[] = [];
  for (const item of input) {
    if (typeof item === "string" && isMcpPatScope(item) && !out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}

export function serializeMcpPatScopes(scopes: McpPatScope[]): string {
  return JSON.stringify(scopes);
}

export function parseMcpPatScopesJson(raw: string | null | undefined): McpPatScope[] | null {
  if (raw == null || raw === "") return null;
  try {
    return normalizeMcpPatScopes(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function resolveEffectiveMcpPatScopes(stored: McpPatScope[] | null): McpPatScope[] {
  if (stored === null) return LEGACY_MCP_PAT_SCOPES;
  return stored.length > 0 ? stored : DEFAULT_MCP_PAT_SCOPES;
}
