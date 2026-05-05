"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  to: string;
  seconds?: number;
}

function hardNavigate(url: string): void {
  // Full-page exit from the IdP; prefer assign + synthetic anchor — some embedded /
  // dev tooling contexts handle these more reliably than replace alone.
  try {
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener noreferrer";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    /* ignore */
  }
  window.location.assign(url);
}

/**
 * Visible countdown that auto-navigates to `to` when it reaches zero.
 * Used by the /oauth2/authorize page when an existing IdP session is
 * about to short-circuit the login form — gives the user a moment to
 * notice the unified-account redirect instead of a silent jump.
 *
 * Implementation notes:
 * - Redirect URL is locked on first render (`targetUrlRef`) so RSC updates with a
 *   new `code` do not reset timers (see authorize page).
 * - One **single** `setTimeout` fires the navigation at `seconds * 1000`. Visual
 *   ticks use a short polling interval. This avoids relying on `setInterval` firing
 *   exactly N times (Strict Mode + cleanup can strand “Redirecting in 2…”).
 * - Effect deps are **empty**: run once per mount so Strict Mode’s mount→unmount→mount
 *   cycle leaves only the second timer arm active (still ~`seconds` wall time).
 *
 * No-JS: users follow the parent page's primary link ("Continue now").
 */
export function SsoCountdown({ to, seconds = 3 }: Props) {
  const [remaining, setRemaining] = useState(seconds);
  const targetUrlRef = useRef<string | null>(null);
  if (!targetUrlRef.current && to) {
    targetUrlRef.current = to;
  }

  useEffect(() => {
    const target = targetUrlRef.current ?? to;
    if (!target) return;

    const totalMs = Math.max(seconds, 1) * 1000;
    const tickMs = 200;
    const started = performance.now();

    setRemaining(seconds);

    const pollId = window.setInterval(() => {
      const elapsedSec = (performance.now() - started) / 1000;
      const left = Math.max(seconds - elapsedSec, 0);
      setRemaining(Math.ceil(left));
    }, tickMs);

    const redirectId = window.setTimeout(() => {
      window.clearInterval(pollId);
      setRemaining(0);
      hardNavigate(target);
    }, totalMs);

    return () => {
      window.clearInterval(pollId);
      window.clearTimeout(redirectId);
    };
    // Intentionally empty: lock timing to first mount; `to` is in targetUrlRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <p
      aria-live="polite"
      style={{
        margin: "14px 0 4px",
        textAlign: "center",
        color: "var(--text-muted)",
        fontSize: 13,
      }}
    >
      Redirecting in{" "}
      <strong style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
        {Math.max(remaining, 0)}
      </strong>
      …
    </p>
  );
}
