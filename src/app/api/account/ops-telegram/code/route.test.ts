import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  findUserBySub: vi.fn(),
}));

vi.mock("@/lib/ops-telegram-session", () => ({
  resolveOpsTelegramOwnerSub: vi.fn(),
}));

vi.mock("@/lib/staff", () => ({
  isPlatformStaff: vi.fn(),
}));

vi.mock("@/lib/trefolio-prodops", () => ({
  mintProdOpsTelegramLink: vi.fn(),
}));

describe("POST /api/account/ops-telegram/code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("proxies minting to trefolio ProdOps", async () => {
    const { resolveOpsTelegramOwnerSub } = await import("@/lib/ops-telegram-session");
    const { findUserBySub } = await import("@/lib/db");
    const { isPlatformStaff } = await import("@/lib/staff");
    const { mintProdOpsTelegramLink } = await import("@/lib/trefolio-prodops");

    vi.mocked(resolveOpsTelegramOwnerSub).mockResolvedValue("sub_staff");
    vi.mocked(findUserBySub).mockResolvedValue({ sub: "sub_staff", email: "ops@trefolio.com" } as never);
    vi.mocked(isPlatformStaff).mockReturnValue(true);
    vi.mocked(mintProdOpsTelegramLink).mockResolvedValue({
      deep_link: "https://t.me/trefoliobot?start=aabbccddeeff",
      expires_in_seconds: 900,
    });

    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost/api/account/ops-telegram/code", { method: "POST" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      deep_link: "https://t.me/trefoliobot?start=aabbccddeeff",
      expires_in_seconds: 900,
    });
    expect(mintProdOpsTelegramLink).toHaveBeenCalledOnce();
  });

  it("returns 502 when trefolio mint fails", async () => {
    const { resolveOpsTelegramOwnerSub } = await import("@/lib/ops-telegram-session");
    const { findUserBySub } = await import("@/lib/db");
    const { isPlatformStaff } = await import("@/lib/staff");
    const { mintProdOpsTelegramLink } = await import("@/lib/trefolio-prodops");

    vi.mocked(resolveOpsTelegramOwnerSub).mockResolvedValue("sub_staff");
    vi.mocked(findUserBySub).mockResolvedValue({ sub: "sub_staff", email: "ops@trefolio.com" } as never);
    vi.mocked(isPlatformStaff).mockReturnValue(true);
    vi.mocked(mintProdOpsTelegramLink).mockRejectedValue(new Error("trefolio_link_failed"));

    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost/api/account/ops-telegram/code", { method: "POST" }),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "trefolio_unavailable",
      reason: "trefolio_link_failed",
    });
  });
});
