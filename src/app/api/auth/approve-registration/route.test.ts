import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindUserBySub = vi.fn();
const mockApproveRegistration = vi.fn();
const mockSendApprovedEmail = vi.fn();

vi.mock("@/lib/db", () => ({
  findUserBySub: (sub: string) => mockFindUserBySub(sub),
  approveRegistration: (sub: string) => mockApproveRegistration(sub),
}));

vi.mock("@/lib/idp-registration-approved-email", () => ({
  sendRegistrationApprovedEmail: (args: unknown) => mockSendApprovedEmail(args),
}));

import { NextRequest } from "next/server";

import { createRegistrationApprovalJwt } from "@/lib/registration-approval";
import { GET } from "./route";

function req(url: string): NextRequest {
  return new NextRequest(url);
}

describe("GET /api/auth/approve-registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.IDP_REGISTRATION_APPROVAL_SECRET = "test-approval-secret-32chars!!";
    mockSendApprovedEmail.mockResolvedValue({ ok: true });
  });

  it("rejects a missing token", async () => {
    const res = await GET(req("http://localhost/api/auth/approve-registration"));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Invalid or expired");
    expect(mockApproveRegistration).not.toHaveBeenCalled();
  });

  it("approves via the signed email link and emails the user once", async () => {
    const token = await createRegistrationApprovalJwt({
      sub: "u_new",
      email: "new@example.com",
    });
    mockFindUserBySub.mockResolvedValue({
      sub: "u_new",
      email: "new@example.com",
      name: "New",
      locale: "es",
      registration_approved_at: null,
    });
    mockApproveRegistration.mockResolvedValue({
      approved: true,
      alreadyApproved: false,
      user: {
        sub: "u_new",
        email: "new@example.com",
        name: "New",
        locale: "es",
        registration_approved_at: "2026-09-26T00:00:00.000Z",
      },
    });

    const res = await GET(
      req(
        `http://localhost/api/auth/approve-registration?token=${encodeURIComponent(token)}`,
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Account approved");
    expect(mockApproveRegistration).toHaveBeenCalledWith("u_new");
    expect(mockSendApprovedEmail).toHaveBeenCalledWith({
      email: "new@example.com",
      name: "New",
      locale: "es",
    });
  });

  it("is idempotent when already approved", async () => {
    const token = await createRegistrationApprovalJwt({
      sub: "u_old",
      email: "old@example.com",
    });
    mockFindUserBySub.mockResolvedValue({
      sub: "u_old",
      email: "old@example.com",
      name: "Old",
      locale: "en",
      registration_approved_at: "2026-01-01T00:00:00.000Z",
    });
    mockApproveRegistration.mockResolvedValue({
      approved: true,
      alreadyApproved: true,
      user: {
        sub: "u_old",
        email: "old@example.com",
        name: "Old",
        locale: "en",
        registration_approved_at: "2026-01-01T00:00:00.000Z",
      },
    });

    const res = await GET(
      req(
        `http://localhost/api/auth/approve-registration?token=${encodeURIComponent(token)}`,
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Already approved");
    expect(mockSendApprovedEmail).not.toHaveBeenCalled();
  });
});
