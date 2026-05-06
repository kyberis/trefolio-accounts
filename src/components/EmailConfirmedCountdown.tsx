"use client";

import { useEffect, useState } from "react";

export function EmailConfirmedCountdown({
  nextPath,
  seconds,
  countdownBefore,
  countdownAfter,
}: {
  nextPath: string;
  seconds: number;
  countdownBefore: string;
  countdownAfter: string;
}) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) {
      window.location.assign(`${window.location.origin}${nextPath}`);
      return;
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, nextPath]);

  return (
    <p className="legal" style={{ marginTop: 16, textAlign: "center" }}>
      {countdownBefore} <strong>{Math.max(remaining, 0)}</strong>
      {countdownAfter}
    </p>
  );
}
