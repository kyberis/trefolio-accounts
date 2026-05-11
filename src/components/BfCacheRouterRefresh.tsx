"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * When Chrome restores this tab from the back/forward cache, React can show an
 * outdated tree while cookies were cleared or expired. Revalidate so the UI
 * matches the browser cookie jar before the user calls authenticated APIs.
 */
export function BfCacheRouterRefresh() {
  const router = useRouter();
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) router.refresh();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [router]);
  return null;
}
