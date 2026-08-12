import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCookiesGet = vi.fn();
const mockFindUserBySub = vi.fn();
const mockDeleteUserBySub = vi.fn();
const mockCancelStripe = vi.fn();
const mockNotifyTrefolio = vi.fn();
const mockBcryptCompare = vi.fn();
const mockIsAdminEmail = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => mockCookiesGet(name),
  }),
}));

vi.mock("@/lib/db", () => ({
  findUserBySub: (sub: string) => mockFindUserBySub(sub),
  deleteUserBySub: (sub: string) => mockDeleteUserBySub(sub),
}));

vi.mock("@/lib/idp-stripe-subscription", () => ({
  cancelStripeSubscriptionsForAccountDeletion: (sub: string) => mockCancelStripe(sub),
}));

vi.mock("@/lib/product-links", () => ({
  notifyTrefolioAccountDeleted: (sub: string) => mockNotifyTrefolio(sub),
}));

vi.mock("@/lib/admin", () => ({
  isAdminEmail: (email: string) => mockIsAdminEmail(email),
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: (...args: unknown[]) => mockBcryptCompare(...args),
  },
}));

vi.mock("@/lib/session", () => ({
  IDP_SESSION_COOKIE: "idp_session",
  IDP_IMPERSONATOR_COOKIE: "idp_impersonator",
  verifySession: (value: string | undefined | null) => {
    if (!value) return null;
    if (value === "valid.sig") return "u_test";
    return null;
  },
  sessionCookieAttributes: () => ({
    name: "idp_session",
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 1,
    secure: false,
  }),
}));

import { DELETE_CONFIRM_PHRASE } from "@/lib/account-delete";
import { POST } from "./route";

function authedCookies() {
  mockCookiesGet.mockImplementation((name: string) => {
    if (name === "idp_session") return { value: "valid.sig" };
    return undefined;
  });
}

describe("POST /api/account/delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdminEmail.mockReturnValue(false);
    mockDeleteUserBySub.mockResolvedValue(undefined);
    mockCancelStripe.mockResolvedValue(undefined);
    mockNotifyTrefolio.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not signed in", async () => {
    mockCookiesGet.mockReturnValue(undefined);
    const res = await POST(
      new Request("http://localhost/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "x" }),
      }) as never,
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 while impersonating", async () => {
    mockCookiesGet.mockImplementation((name: string) => {
      if (name === "idp_impersonator") return { value: "admin.sig" };
      if (name === "idp_session") return { value: "valid.sig" };
      return undefined;
    });
    const res = await POST(
      new Request("http://localhost/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "secret" }),
      }) as never,
    );
    expect(res.status).toBe(403);
    expect(mockDeleteUserBySub).not.toHaveBeenCalled();
  });

  it("returns 403 for admin allow-list emails", async () => {
    authedCookies();
    mockFindUserBySub.mockResolvedValue({
      sub: "u_test",
      email: "admin@trefolio.com",
      password_hash: "hash",
    });
    mockIsAdminEmail.mockReturnValue(true);
    const res = await POST(
      new Request("http://localhost/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "secret" }),
      }) as never,
    );
    expect(res.status).toBe(403);
    expect(mockDeleteUserBySub).not.toHaveBeenCalled();
  });

  it("requires password when the account has one", async () => {
    authedCookies();
    mockFindUserBySub.mockResolvedValue({
      sub: "u_test",
      email: "user@example.com",
      password_hash: "hash",
    });
    const res = await POST(
      new Request("http://localhost/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("password_required");
  });

  it("rejects wrong password", async () => {
    authedCookies();
    mockFindUserBySub.mockResolvedValue({
      sub: "u_test",
      email: "user@example.com",
      password_hash: "hash",
    });
    mockBcryptCompare.mockResolvedValue(false);
    const res = await POST(
      new Request("http://localhost/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "nope" }),
      }) as never,
    );
    expect(res.status).toBe(401);
    expect(mockDeleteUserBySub).not.toHaveBeenCalled();
  });

  it("deletes after correct password and clears session", async () => {
    authedCookies();
    mockFindUserBySub.mockResolvedValue({
      sub: "u_test",
      email: "user@example.com",
      password_hash: "hash",
    });
    mockBcryptCompare.mockResolvedValue(true);
    const res = await POST(
      new Request("http://localhost/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "correct" }),
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(mockCancelStripe).toHaveBeenCalledWith("u_test");
    expect(mockNotifyTrefolio).toHaveBeenCalledWith("u_test");
    expect(mockDeleteUserBySub).toHaveBeenCalledWith("u_test");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie.toLowerCase()).toContain("idp_session=");
  });

  it("requires DELETE phrase for passwordless accounts", async () => {
    authedCookies();
    mockFindUserBySub.mockResolvedValue({
      sub: "u_test",
      email: "oauth@example.com",
      password_hash: "",
    });
    const bad = await POST(
      new Request("http://localhost/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "delete" }),
      }) as never,
    );
    expect(bad.status).toBe(400);

    const ok = await POST(
      new Request("http://localhost/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: DELETE_CONFIRM_PHRASE }),
      }) as never,
    );
    expect(ok.status).toBe(200);
    expect(mockDeleteUserBySub).toHaveBeenCalledWith("u_test");
  });
});
