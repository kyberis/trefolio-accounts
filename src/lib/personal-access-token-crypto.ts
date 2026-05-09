import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Unified ecosystem PAT prefix (minted only on user.trefolio.com). */
export const TFP_PAT_PREFIX = "tfp_pat_";

const TOKEN_BYTES = 32;
const VISIBLE_PREFIX_LEN = TFP_PAT_PREFIX.length + 4;

export type GeneratedPat = {
  plaintext: string;
  tokenHash: string;
  prefix: string;
};

export function generatePatPlaintext(): GeneratedPat {
  const random = randomBytes(TOKEN_BYTES).toString("hex");
  const plaintext = `${TFP_PAT_PREFIX}${random}`;
  return {
    plaintext,
    tokenHash: hashPat(plaintext),
    prefix: plaintext.slice(0, VISIBLE_PREFIX_LEN),
  };
}

export function hashPat(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function patPrefixOk(plaintext: string): boolean {
  return plaintext.trim().startsWith(TFP_PAT_PREFIX);
}

export function safeEqualHashHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}
