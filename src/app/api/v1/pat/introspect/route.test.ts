import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generatePatPlaintext, hashPat } from "@/lib/personal-access-token-crypto";

const mockFind = vi.fn();
const mockTouch = vi.fn();

vi.mock("@/lib/db", () => ({
  findActivePersonalAccessTokenByHash: (h: string) => mockFind(h),
  touchPersonalAccessTokenLastUsed: (id: string) => mockTouch(id),
}));

import { POST } from "./route";

const SERVICE_SECRET = "b".repeat(64);

describe("POST /api/v1/pat/introspect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TREFOLIO_PAT_INTROSPECTION_SECRET = SERVICE_SECRET;
    mockTouch.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.TREFOLIO_PAT_INTROSPECTION_SECRET;
  });

  it("returns 503 when introspection secret is not configured", async () => {
    delete process.env.TREFOLIO_PAT_INTROSPECTION_SECRET;
    const res = await POST(
      new Request("http://localhost/api/v1/pat/introspect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: "tfp_pat_x" }),
      }),
    );
    expect(res.status).toBe(503);
  });

  it("returns 401 when service bearer is wrong", async () => {
    const res = await POST(
      new Request("http://localhost/api/v1/pat/introspect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_SECRET.slice(0, -1)}c`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: "tfp_pat_x" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await POST(
      new Request("http://localhost/api/v1/pat/introspect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_SECRET}`,
          "Content-Type": "application/json",
        },
        body: "not-json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns active false for wrong prefix", async () => {
    const res = await POST(
      new Request("http://localhost/api/v1/pat/introspect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: "clara_pat_abc" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ active: false });
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("returns active false when no token row matches", async () => {
    const { plaintext } = generatePatPlaintext();
    mockFind.mockResolvedValueOnce(null);
    const res = await POST(
      new Request("http://localhost/api/v1/pat/introspect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: plaintext }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ active: false });
    expect(mockFind).toHaveBeenCalledWith(hashPat(plaintext));
  });

  it("returns active true with sub and token_id when row exists", async () => {
    const { plaintext } = generatePatPlaintext();
    const h = hashPat(plaintext);
    mockFind.mockResolvedValueOnce({ id: "pat-row-1", sub: "idp|user-99", scopesJson: '["portfolio:read","warren:moat"]' });
    const res = await POST(
      new Request("http://localhost/api/v1/pat/introspect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: plaintext }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toMatchObject({
      active: true,
      sub: "idp|user-99",
      token_id: "pat-row-1",
      scope: "mcp:ecosystem",
      scopes: ["portfolio:read", "warren:moat"],
    });
    expect(mockFind).toHaveBeenCalledWith(h);
    await vi.waitFor(() => {
      expect(mockTouch).toHaveBeenCalledWith("pat-row-1");
    });
  });
});
