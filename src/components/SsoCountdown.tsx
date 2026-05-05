"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  to: string;
  seconds?: number;
}

/**
 * Visible countdown that auto-navigates to `to` when it reaches zero.
 * Used by the /oauth2/authorize page when an existing IdP session is
 * about to short-circuit the login form — gives the user a moment to
 * notice the unified-account redirect instead of a silent jump.
 *
 * Uses one `setInterval` + a tick counter (not `remaining` in the effect
 * dependency list) so React Strict Mode and effect re-runs cannot clear the
 * timer between ticks — the previous pattern (`setTimeout` + `[remaining]`
 * deps) could leave the UI stuck (e.g. on "2…") after the first decrement.
 *
 * The redirect URL is captured once on first render (`targetUrlRef`). If `to`
 * were in the effect deps, any parent RSC re-flight with a newly minted `code`
 * would tear down the interval mid-countdown (often stranded on "1…") and
 * restart the timer.
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

    setRemaining(seconds);
    let tick = 0;
    const id = setInterval(() => {
      tick += 1;
      const next = Math.max(seconds - tick, 0);
      setRemaining(next);
      if (next <= 0) {
        clearInterval(id);
        // Defer past React commit / Strict Mode churn so navigation is not lost.
        window.setTimeout(() => {
          window.location.replace(target);
        }, 0);
      }
    }, 1000);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL locked in targetUrlRef; `to` updates must not reset the timer
  }, [seconds]);

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
