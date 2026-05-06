"use client";

import { useEffect, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";

interface Props {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  appHint: string;
  passkeyLabel?: string;
  passkeyWaitingLabel?: string;
  /**
   * Where to navigate when the passkey verifies successfully **outside**
   * an OIDC flow (no `clientId`). Defaults to `/`.
   */
  fallbackNext?: string;
}

/**
 * "Sign in with a passkey" button rendered on `/oauth2/authorize`. Hidden
 * automatically on browsers / contexts that can't autofill a passkey to
 * keep the form clean (we don't want a button that always errors).
 *
 * The flow is fully client-side:
 *  1. POST /api/auth/passkey/login-options → mint a challenge cookie.
 *  2. navigator.credentials.get() via @simplewebauthn/browser.
 *  3. POST /api/auth/passkey/login-verify with the assertion + the
 *     in-flight OIDC params; the server replies with `redirectTo`.
 *  4. We push the browser there (server-side cookie has been set).
 */
export function PasskeySignInButton(props: Props) {
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signInLabel = props.passkeyLabel ?? "Sign in with a passkey";
  const waitingLabel = props.passkeyWaitingLabel ?? "Waiting for passkey…";

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSupported(
      typeof (window as unknown as { PublicKeyCredential?: unknown })
        .PublicKeyCredential !== "undefined",
    );
  }, []);

  if (!supported) return null;

  async function handleClick() {
    setError(null);
    setBusy(true);
    try {
      const opts = await fetch("/api/auth/passkey/login-options", {
        method: "POST",
      }).then((r) => r.json());
      const credential = await startAuthentication({ optionsJSON: opts });
      const verifyRes = await fetch("/api/auth/passkey/login-verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          credential,
          oidc: props.clientId
            ? {
                client_id: props.clientId,
                redirect_uri: props.redirectUri,
                code_challenge: props.codeChallenge,
                code_challenge_method: props.codeChallengeMethod,
                nonce: props.nonce || undefined,
                state: props.state || undefined,
              }
            : undefined,
        }),
      });
      if (!verifyRes.ok) {
        const j = await verifyRes.json().catch(() => ({}));
        setError(
          typeof j.detail === "string"
            ? j.detail
            : typeof j.error === "string"
              ? j.error
              : "Passkey sign-in failed",
        );
        setBusy(false);
        return;
      }
      const json = (await verifyRes.json()) as { redirectTo?: string };
      window.location.href = json.redirectTo || props.fallbackNext || "/";
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Passkey sign-in failed";
      // Users cancelling the OS prompt throw NotAllowedError — silence it.
      if (!/NotAllowedError|cancel|aborted/i.test(msg)) setError(msg);
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-block"
        onClick={handleClick}
        disabled={busy}
      >
        <KeyGlyph />
        <span>{busy ? waitingLabel : signInLabel}</span>
      </button>
      {error && (
        <p
          role="alert"
          style={{
            margin: "4px 0 0",
            color: "var(--danger)",
            fontSize: 12,
          }}
        >
          {error}
        </p>
      )}
    </>
  );
}

function KeyGlyph() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="15" r="4" />
      <path d="M10.85 12.15 19 4" />
      <path d="M18 5l3 3" />
      <path d="M15 8l3 3" />
    </svg>
  );
}
