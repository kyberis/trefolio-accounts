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
 * No-JS fallback: a `<meta http-equiv="refresh">` rendered server-side
 * by the parent page ensures the redirect still happens.
 */
export function SsoCountdown({ to, seconds = 3 }: Props) {
  const [remaining, setRemaining] = useState(seconds);
  const toRef = useRef(to);
  toRef.current = to;

  useEffect(() => {
    setRemaining(seconds);
    let tick = 0;
    const id = setInterval(() => {
      tick += 1;
      const next = Math.max(seconds - tick, 0);
      setRemaining(next);
      if (next <= 0) {
        clearInterval(id);
        window.location.replace(toRef.current);
      }
    }, 1000);

    return () => clearInterval(id);
  }, [to, seconds]);

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
