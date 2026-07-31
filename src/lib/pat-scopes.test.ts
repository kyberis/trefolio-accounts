import { describe, it, expect } from "vitest";

import {
  DEFAULT_MCP_PAT_SCOPES,
  LEGACY_MCP_PAT_SCOPES,
  normalizeMcpPatScopes,
  resolveEffectiveMcpPatScopes,
} from "@/lib/pat-scopes";

describe("pat-scopes", () => {
  it("defaults new tokens to portfolio + tools + moat", () => {
    expect(DEFAULT_MCP_PAT_SCOPES).toEqual(["portfolio:read", "tools:read", "warren:moat"]);
  });

  it("legacy null scopes grant full ecosystem access", () => {
    expect(resolveEffectiveMcpPatScopes(null).length).toBe(11);
    expect(resolveEffectiveMcpPatScopes(null)).toContain("finance:read");
    expect(resolveEffectiveMcpPatScopes(null)).toContain("notes:write");
    expect(resolveEffectiveMcpPatScopes(null)).toContain("market:fmp");
  });

  it("filters unknown scope strings", () => {
    expect(normalizeMcpPatScopes(["portfolio:read", "bogus", "tax:read", "market:fmp"])).toEqual([
      "portfolio:read",
      "tax:read",
      "market:fmp",
    ]);
  });

  it("does not include market:fmp in default new-token scopes", () => {
    expect(DEFAULT_MCP_PAT_SCOPES).not.toContain("market:fmp");
  });
});
