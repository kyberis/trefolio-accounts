"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";

/**
 * Client-only widget that handles the *enrollment* half of the WebAuthn
 * dance. The page server-renders the list of already-registered keys; we
 * trigger a router refresh after a successful add so the new row appears
 * without a manual reload.
 */
export function PasskeyManager() {
  const router = useRouter();
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSupported(
      typeof (window as unknown as { PublicKeyCredential?: unknown })
        .PublicKeyCredential !== "undefined",
    );
  }, []);

  async function handleAdd() {
    setError(null);
    setBusy(true);
    try {
      const opts = await fetch("/api/auth/passkey/register-options", {
        method: "POST",
      }).then((r) => r.json());
      if (opts.error) throw new Error(opts.error);
      const credential = await startRegistration({ optionsJSON: opts });
      const verifyRes = await fetch("/api/auth/passkey/register-verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          credential,
          deviceName: name.trim() || guessDeviceName(),
        }),
      });
      if (!verifyRes.ok) {
        const j = await verifyRes.json().catch(() => ({}));
        throw new Error(
          typeof j.detail === "string"
            ? j.detail
            : typeof j.error === "string"
              ? j.error
              : "Failed to enroll passkey",
        );
      }
      setName("");
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to enroll passkey";
      if (!/NotAllowedError|cancel|aborted/i.test(msg)) setError(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <div className="alert alert-warning" style={{ marginTop: 16 }}>
        This browser doesn&apos;t support passkeys. Try Safari, Chrome,
        Firefox, or Edge on a recent OS.
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 16,
        padding: 16,
        border: "1px solid var(--border)",
        borderRadius: 12,
        display: "flex",
        gap: 12,
        alignItems: "flex-end",
        flexWrap: "wrap",
      }}
    >
      <label className="field" style={{ flex: 1, minWidth: 220 }}>
        <span>Name this device</span>
        <input
          className="input"
          type="text"
          placeholder={guessDeviceName()}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
        />
      </label>
      <button
        type="button"
        className="btn btn-primary"
        onClick={handleAdd}
        disabled={busy}
        style={{ minWidth: 180 }}
      >
        {busy ? "Waiting for device…" : "Add a passkey"}
      </button>
      {error && (
        <p
          role="alert"
          style={{
            flexBasis: "100%",
            margin: 0,
            color: "var(--danger)",
            fontSize: 13,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

function guessDeviceName(): string {
  if (typeof navigator === "undefined") return "This device";
  const ua = navigator.userAgent;
  if (/iPad/i.test(ua)) return "iPad";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return "Android device";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Linux/i.test(ua)) return "Linux PC";
  return "This device";
}
