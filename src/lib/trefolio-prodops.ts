import { getTrefolioServerOrigin, getProductTargets } from "./product-links";

const TIMEOUT_MS = 8000;

function trefolioHeaders(): Record<string, string> {
  const token = process.env.IDP_SERVICE_TOKEN?.trim();
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const bypass = process.env.TREFOLIO_VERCEL_PROTECTION_BYPASS?.trim();
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  return headers;
}

function trefolioOrigin(): string {
  return getTrefolioServerOrigin();
}

async function trefolioFetch(path: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${trefolioOrigin()}${path}`, {
      ...init,
      headers: { ...trefolioHeaders(), ...(init.headers || {}) },
      cache: "no-store",
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchProdOpsLinkStatus(): Promise<{
  linked: boolean;
  botUsername: string;
  enabled: boolean;
} | null> {
  if (!process.env.IDP_SERVICE_TOKEN?.trim()) return null;
  try {
    const res = await trefolioFetch("/api/internal/prodops-link", { method: "GET" });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      linked?: unknown;
      botUsername?: unknown;
      enabled?: unknown;
    };
    return {
      linked: json.linked === true,
      botUsername: typeof json.botUsername === "string" ? json.botUsername : "",
      enabled: json.enabled === true,
    };
  } catch (err) {
    console.warn("[trefolio-prodops] link status failed", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function mintProdOpsTelegramLink(): Promise<{
  deep_link: string;
  expires_in_seconds: number;
}> {
  const res = await trefolioFetch("/api/internal/prodops-link", { method: "POST" });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    deep_link?: string;
    deepLink?: string;
    expires_in_seconds?: number;
  };
  if (!res.ok) {
    throw new Error(json.error || `trefolio_link_failed_${res.status}`);
  }
  const deepLink = String(json.deep_link || json.deepLink || "");
  if (!deepLink) throw new Error("trefolio_link_missing");
  return {
    deep_link: deepLink,
    expires_in_seconds: json.expires_in_seconds || 15 * 60,
  };
}

export async function unlinkProdOpsTelegram(): Promise<void> {
  const res = await trefolioFetch("/api/internal/prodops-link", { method: "DELETE" });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error || `trefolio_unlink_failed_${res.status}`);
  }
}

export async function ingestProdOpsEvent(input: {
  eventType: "user_registered" | "membership_paid" | "ops_digest";
  userId: string;
  dedupeKey: string;
  summary: string;
  adminUrl?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!process.env.IDP_SERVICE_TOKEN?.trim()) {
    console.warn("[trefolio-prodops] skip ingest: IDP_SERVICE_TOKEN missing");
    return;
  }
  const issuer =
    (process.env.IDP_ISSUER || process.env.IDP_BASE_URL || "https://user.trefolio.com").replace(
      /\/+$/,
      "",
    );
  const adminUrl =
    input.adminUrl ||
    `${issuer}/admin/users`;
  try {
    const res = await trefolioFetch("/api/internal/prodops-ingest", {
      method: "POST",
      body: JSON.stringify({
        eventType: input.eventType,
        userId: input.userId,
        dedupeKey: input.dedupeKey,
        summary: input.summary.slice(0, 500),
        adminUrl,
        metadata: input.metadata || {},
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[trefolio-prodops] ingest failed", res.status, text.slice(0, 200));
    }
  } catch (err) {
    console.warn("[trefolio-prodops] ingest error", err instanceof Error ? err.message : err);
  }
}

export function trefolioPublicAdminSettingsUrl(): string {
  const publicBase =
    getProductTargets().find((t) => t.app === "trefolio")?.baseUrl || "https://trefolio.com";
  return `${publicBase}/admin/settings`;
}
