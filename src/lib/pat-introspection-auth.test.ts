import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getPatIntrospectionSecret,
  isPatIntrospectionAuthorized,
} from "./pat-introspection-auth";

const SECRET = "a".repeat(64);

describe("pat-introspection-auth", () => {
  afterEach(() => {
    delete process.env.TREFOLIO_PAT_INTROSPECTION_SECRET;
  });

  it("getPatIntrospectionSecret returns null when unset", () => {
    expect(getPatIntrospectionSecret()).toBeNull();
  });

  it("getPatIntrospectionSecret trims whitespace", () => {
    process.env.TREFOLIO_PAT_INTROSPECTION_SECRET = `  ${SECRET}  `;
    expect(getPatIntrospectionSecret()).toBe(SECRET);
  });

  describe("isPatIntrospectionAuthorized", () => {
    beforeEach(() => {
      process.env.TREFOLIO_PAT_INTROSPECTION_SECRET = SECRET;
    });

    it("returns false when secret is not configured", () => {
      delete process.env.TREFOLIO_PAT_INTROSPECTION_SECRET;
      const req = new Request("http://localhost", {
        headers: { Authorization: `Bearer ${SECRET}` },
      });
      expect(isPatIntrospectionAuthorized(req)).toBe(false);
    });

    it("returns true for matching Bearer secret", () => {
      const req = new Request("http://localhost", {
        headers: { Authorization: `Bearer ${SECRET}` },
      });
      expect(isPatIntrospectionAuthorized(req)).toBe(true);
    });

    it("is case-insensitive on Bearer scheme", () => {
      const req = new Request("http://localhost", {
        headers: { Authorization: `bearer ${SECRET}` },
      });
      expect(isPatIntrospectionAuthorized(req)).toBe(true);
    });

    it("returns false for wrong token", () => {
      const req = new Request("http://localhost", {
        headers: { Authorization: `Bearer ${SECRET.slice(0, -1)}b` },
      });
      expect(isPatIntrospectionAuthorized(req)).toBe(false);
    });

    it("returns false for Basic auth", () => {
      const req = new Request("http://localhost", {
        headers: { Authorization: `Basic ${SECRET}` },
      });
      expect(isPatIntrospectionAuthorized(req)).toBe(false);
    });

    it("returns false when Authorization is missing", () => {
      expect(isPatIntrospectionAuthorized(new Request("http://localhost"))).toBe(false);
    });
  });
});
