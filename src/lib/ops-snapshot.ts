import { getIdpOpsDbStats } from "./db";
import { getProductTargets, type ProductTarget } from "./product-links";

const FETCH_TIMEOUT_MS = 8000;

export type OpsMetricsPayload = {
  product: "trefolio" | "clara" | "will";
  generatedAt: string;
  totals: Record<string, number>;
  notes?: string;
  error?: string;
};

function vercelBypassHeaders(app: ProductTarget["app"]): Record<string, string> {
  const envName =
    app === "trefolio"
      ? "TREFOLIO_VERCEL_PROTECTION_BYPASS"
      : app === "clara"
        ? "CLARA_VERCEL_PROTECTION_BYPASS"
        : "WILL_VERCEL_PROTECTION_BYPASS";
  const s = process.env[envName]?.trim();
  if (!s) return {};
  return { "x-vercel-protection-bypass": s };
}

async function fetchProductOpsMetrics(
  target: ProductTarget,
  token: string,
): Promise<OpsMetricsPayload | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${target.baseUrl}/api/internal/ops-metrics`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
        ...vercelBypassHeaders(target.app),
      },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      return {
        product: target.app,
        generatedAt: new Date().toISOString(),
        totals: {},
        error: `HTTP ${res.status}`,
      };
    }
    const json = (await res.json()) as OpsMetricsPayload;
    return json;
  } catch (err) {
    return {
      product: target.app,
      generatedAt: new Date().toISOString(),
      totals: {},
      error: err instanceof Error ? err.message : "fetch_failed",
    };
  } finally {
    clearTimeout(t);
  }
}

function formatMetricsBlock(label: string, m: OpsMetricsPayload | null): string {
  if (!m) return `${label}: (no data)`;
  if (m.error) return `${label}: error — ${m.error}`;
  const lines = Object.entries(m.totals)
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
    .map(([k, v]) => `  · ${k}: ${v}`)
    .join("\n");
  return lines ? `${label}:\n${lines}` : `${label}: (empty)`;
}

/**
 * Daily-style digest: IdP database rollups plus best-effort per-product metrics.
 */
export async function buildOpsDigestMarkdown(): Promise<string> {
  const idp = await getIdpOpsDbStats();
  const token = process.env.IDP_SERVICE_TOKEN?.trim() || "";
  const targets = getProductTargets();

  const productBlocks: OpsMetricsPayload[] = [];
  if (token) {
    const fetched = await Promise.all(targets.map((t) => fetchProductOpsMetrics(t, token)));
    for (const p of fetched) {
      if (p) productBlocks.push(p);
    }
  }

  const header = `trefolio ops · ${new Date().toISOString().replace("T", " ").slice(0, 19)}Z`;

  const idpBlock = [
    "IdP (user.trefolio.com):",
    `  · users_total: ${idp.totalUsers}`,
    `  · users_verified: ${idp.verifiedUsers}`,
    `  · entitlements_pro: ${idp.proEntitlements}`,
    `  · signups_24h: ${idp.signupsLast24h}`,
    `  · signups_7d: ${idp.signupsLast7d}`,
    `  · checkout_intents_7d: ${idp.checkoutIntentsLast7d}`,
  ].join("\n");

  const appLines = targets.map((t) => {
    const m = productBlocks.find((b) => b.product === t.app) ?? null;
    return formatMetricsBlock(t.label, m);
  });

  if (!token) {
    appLines.push("(Product metrics skipped: IDP_SERVICE_TOKEN unset on IdP.)");
  }

  return [header, "", idpBlock, "", ...appLines].join("\n");
}
