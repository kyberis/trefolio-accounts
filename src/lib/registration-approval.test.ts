import { afterEach, describe, expect, it } from "vitest";

import {
  createRegistrationApprovalJwt,
  isRegistrationApproved,
  requiresRegistrationApproval,
  verifyRegistrationApprovalJwt,
} from "./registration-approval";

describe("requiresRegistrationApproval", () => {
  afterEach(() => {
    delete process.env.REGISTRATION_REQUIRES_APPROVAL;
  });

  it("defaults to true", () => {
    delete process.env.REGISTRATION_REQUIRES_APPROVAL;
    expect(requiresRegistrationApproval()).toBe(true);
  });

  it("accepts falsey env values", () => {
    for (const v of ["0", "false", "no", "off", "FALSE"]) {
      process.env.REGISTRATION_REQUIRES_APPROVAL = v;
      expect(requiresRegistrationApproval()).toBe(false);
    }
  });
});

describe("isRegistrationApproved", () => {
  afterEach(() => {
    delete process.env.REGISTRATION_REQUIRES_APPROVAL;
  });

  it("is true when env disables the gate", () => {
    process.env.REGISTRATION_REQUIRES_APPROVAL = "false";
    expect(isRegistrationApproved({ registration_approved_at: null })).toBe(true);
  });

  it("requires a non-empty timestamp when gate is on", () => {
    process.env.REGISTRATION_REQUIRES_APPROVAL = "true";
    expect(isRegistrationApproved({ registration_approved_at: null })).toBe(false);
    expect(isRegistrationApproved({ registration_approved_at: "" })).toBe(false);
    expect(
      isRegistrationApproved({ registration_approved_at: "2026-01-01T00:00:00.000Z" }),
    ).toBe(true);
  });
});

describe("registration approval JWT", () => {
  it("round-trips sub and email", async () => {
    const token = await createRegistrationApprovalJwt({
      sub: "usr_test",
      email: "a@example.com",
    });
    const payload = await verifyRegistrationApprovalJwt(token);
    expect(payload).toEqual({ sub: "usr_test", email: "a@example.com" });
  });

  it("rejects garbage", async () => {
    expect(await verifyRegistrationApprovalJwt("not.a.jwt")).toBeNull();
  });
});
