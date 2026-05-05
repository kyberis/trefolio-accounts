"use client";

import { useEffect, useState } from "react";

export function EmailConfirmedCountdown({
  nextPath,
  seconds,
}: {
  nextPath: string;
  seconds: number;
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
      Continuing to your app in <strong>{Math.max(remaining, 0)}</strong>s…
    </p>
  );
}
