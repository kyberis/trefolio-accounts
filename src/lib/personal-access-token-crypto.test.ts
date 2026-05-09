import { describe, expect, it } from "vitest";

import { generatePatPlaintext, hashPat, patPrefixOk, TFP_PAT_PREFIX } from "./personal-access-token-crypto";

describe("personal-access-token-crypto", () => {
  it("generates tfp_pat_ prefix", () => {
    const g = generatePatPlaintext();
    expect(g.plaintext.startsWith(TFP_PAT_PREFIX)).toBe(true);
    expect(patPrefixOk(g.plaintext)).toBe(true);
    expect(g.tokenHash).toBe(hashPat(g.plaintext));
    expect(g.prefix.length).toBeGreaterThan(TFP_PAT_PREFIX.length);
  });

  it("rejects wrong prefix", () => {
    expect(patPrefixOk("clara_pat_abc")).toBe(false);
  });
});
