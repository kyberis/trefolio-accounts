import { describe, expect, it, beforeEach, afterEach } from "vitest";

import {
  createIdpEmailVerificationJwt,
  verifyIdpEmailVerificationJwt,
} from "@/lib/idp-verification-token";
import {
  createIdpPasswordResetJwt,
  verifyIdpPasswordResetJwt,
} from "@/lib/idp-password-reset-token";

describe("idp-password-reset-token", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env.IDP_PASSWORD_RESET_SECRET = "test-reset-secret-32chars!!";
    process.env.IDP_EMAIL_VERIFICATION_SECRET = "test-verify-secret-32chars!!";
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it("round-trips sub and email", async () => {
    const token = await createIdpPasswordResetJwt({
      sub: "u_testsub",
      email: "user@example.com",
    });
    const parsed = await verifyIdpPasswordResetJwt(token);
    expect(parsed).toEqual({ sub: "u_testsub", email: "user@example.com" });
  });

  it("rejects verification JWT purpose", async () => {
    const wrong = await createIdpEmailVerificationJwt({
      sub: "u_x",
      email: "x@example.com",
      resumeJson: "{}",
    });
    expect(await verifyIdpPasswordResetJwt(wrong)).toBeNull();
  });

  it("rejects tampered token", async () => {
    const token = await createIdpPasswordResetJwt({
      sub: "u_a",
      email: "a@example.com",
    });
    const tampered = `${token.slice(0, -4)}xxxx`;
    expect(await verifyIdpPasswordResetJwt(tampered)).toBeNull();
  });

  it("verification JWT rejects password reset verifier", async () => {
    const token = await createIdpPasswordResetJwt({
      sub: "u_b",
      email: "b@example.com",
    });
    expect(await verifyIdpEmailVerificationJwt(token)).toBeNull();
  });
});
