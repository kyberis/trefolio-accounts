import { getPublicIssuer } from "./public-url";

/**
 * WebAuthn relying-party config for the IdP.
 *
 * The Relying-Party ID (`rpID`) is the *eTLD+1* host the IdP is served
 * from. WebAuthn requires it to be a registrable domain matching the
 * origin's host. We derive both from `IDP_ISSUER` so dev (localhost) and
 * prod (`user.trefolio.com`) just work.
 *
 * Examples:
 *   IDP_ISSUER=http://localhost:3300        → rpID=localhost,         origin=http://localhost:3300
 *   IDP_ISSUER=https://user.trefolio.com   → rpID=user.trefolio.com,  origin=https://user.trefolio.com
 *
 * `rpName` is what the browser shows in the OS-level passkey picker.
 */
export interface WebAuthnConfig {
  rpID: string;
  rpName: string;
  origin: string;
}

export function getWebAuthnConfig(): WebAuthnConfig {
  const origin = getPublicIssuer();
  let rpID = "localhost";
  try {
    const u = new URL(origin);
    rpID = u.hostname;
  } catch {
    // fall through with default
  }
  return {
    rpID,
    origin,
    rpName: "trefolio accounts",
  };
}
