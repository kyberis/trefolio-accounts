/**
 * Resolve the per-product base URL the IdP should call when fanning out to
 * find local user records (admin-only use-case). Mirrors the env-aware
 * helpers used by the products themselves so the IdP automatically picks
 * the right host in dev and prod.
 *
 * Lookups never fail loudly: if a product is unreachable we just report
 * `linked: false` for that app — the admin page renders a tiny "?" badge
 * and surfaces the error inline. We do not throw so a single down product
 * doesn't break the entire user listing.
 */

const isProd = process.env.NODE_ENV === "production";

function trim(s: string | undefined | null): string | null {
  if (!s) return null;
  return s.replace(/\/+$/, "") || null;
}

/**
 * When a product is hosted on Vercel with Deployment Protection, unauthenticated
 * server-to-server GETs return 403 before the Next app runs. Copy each project's
 * "Protection Bypass for Automation" secret into the matching env var on the IdP.
 * @see https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection
 */
function vercelProtectionBypassHeader(
  app: ProductTarget["app"],
): Record<string, string> {
  const envName =
    app === "trefolio"
      ? "TREFOLIO_VERCEL_PROTECTION_BYPASS"
      : app === "clara"
        ? "CLARA_VERCEL_PROTECTION_BYPASS"
        : "WILL_VERCEL_PROTECTION_BYPASS";
  const secret = trim(process.env[envName] ?? null);
  if (!secret) return {};
  return { "x-vercel-protection-bypass": secret };
}

export interface ProductTarget {
  app: "trefolio" | "clara" | "will";
  label: string;
  baseUrl: string;
  /**
   * Absolute URL pointing at the product's admin page for this user. Lets
   * the operator jump from the IdP admin into the product-native admin tools
   * for deeper management (impersonate, refunds, feature flags…).
   */
  adminLink(localUserId: string): string;
}

export function getProductTargets(): ProductTarget[] {
  const trefolio =
    trim(process.env.TREFOLIO_BASE_URL) ||
    (isProd ? "https://trefolio.com" : "http://localhost:3010");
  const clara =
    trim(process.env.CLARA_BASE_URL) ||
    (isProd ? "https://clara.trefolio.com" : "http://localhost:3001");
  const will =
    trim(process.env.WILL_BASE_URL) ||
    (isProd ? "https://will.trefolio.com" : "http://localhost:3200");

  return [
    {
      app: "trefolio",
      label: "trefolio",
      baseUrl: trefolio,
      adminLink: (id) => `${trefolio}/admin/users?focus=${encodeURIComponent(id)}`,
    },
    {
      app: "clara",
      label: "Clara",
      baseUrl: clara,
      adminLink: (id) => `${clara}/admin?user=${encodeURIComponent(id)}`,
    },
    {
      app: "will",
      label: "Will",
      baseUrl: will,
      adminLink: (id) => `${will}/admin?user=${encodeURIComponent(id)}`,
    },
  ];
}

/**
 * Origin for IdP → trefolio server calls. Prefer `TREFOLIO_SERVER_ORIGIN` (Vercel
 * alias) when `trefolio.com` is Cloudflare-proxied with Bot Fight.
 */
export function getTrefolioServerOrigin(): string {
  return (
    trim(process.env.TREFOLIO_SERVER_ORIGIN) ||
    getProductTargets().find((t) => t.app === "trefolio")!.baseUrl
  );
}

export interface ProductLinkResult {
  app: ProductTarget["app"];
  label: string;
  exists: boolean;
  /** Local user id in that product, when found. */
  id?: string;
  /** Optional plan/role/active flags rendered in the admin detail view. */
  details?: Record<string, unknown>;
  error?: string;
  adminLink?: string;
}

/**
 * Fan-out helper used by the admin pages. Calls each product's
 * `/api/v1/users/by-sub/:sub?email=…` endpoint with the service token. Runs
 * all probes in parallel; per-app failures are isolated so the admin page
 * stays responsive even if one app is down.
 */
export async function probeProductLinks(args: {
  sub: string;
  email: string;
  signal?: AbortSignal;
  /** Hard timeout per product call. Defaults to 4 s — probes for the same
   *  page run in parallel (not summed), so this only caps worst-case page
   *  latency when a product is actually down. 1.8 s was tight enough that
   *  an ordinary Vercel cold start on a rarely-hit product could trip it
   *  and render a real account as falsely "not linked". */
  timeoutMs?: number;
}): Promise<ProductLinkResult[]> {
  const token = process.env.IDP_SERVICE_TOKEN;
  if (!token) {
    return getProductTargets().map((t) => ({
      app: t.app,
      label: t.label,
      exists: false,
      error: "IDP_SERVICE_TOKEN missing",
    }));
  }

  const targets = getProductTargets();
  const timeout = args.timeoutMs ?? 4000;
  const params = new URLSearchParams({ email: args.email }).toString();

  const calls = targets.map(async (t): Promise<ProductLinkResult> => {
    const ctrl = new AbortController();
    const handle = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(
        `${t.baseUrl}/api/v1/users/by-sub/${encodeURIComponent(args.sub)}?${params}`,
        {
          method: "GET",
          headers: {
            authorization: `Bearer ${token}`,
            ...vercelProtectionBypassHeader(t.app),
          },
          cache: "no-store",
          signal: args.signal ?? ctrl.signal,
        },
      );
      if (!res.ok) {
        const hint =
          res.status === 403
            ? " — if the app uses Vercel Deployment Protection, set TREFOLIO_VERCEL_PROTECTION_BYPASS / CLARA_VERCEL_PROTECTION_BYPASS / WILL_VERCEL_PROTECTION_BYPASS on the IdP"
            : "";
        return {
          app: t.app,
          label: t.label,
          exists: false,
          error: `HTTP ${res.status}${hint}`,
        };
      }
      const json = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const exists = Boolean(json.exists);
      const id = typeof json.id === "string" ? json.id : undefined;
      return {
        app: t.app,
        label: t.label,
        exists,
        id,
        details: exists ? json : undefined,
        adminLink: exists && id ? t.adminLink(id) : undefined,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "fetch failed";
      return { app: t.app, label: t.label, exists: false, error: msg };
    } finally {
      clearTimeout(handle);
    }
  });

  return Promise.all(calls);
}

// 2s was too tight: a cold Next.js dev server compiles this route on the
// first hit (observed ~2.6s), which tripped the abort and showed a false
// "unreachable" status right after starting the dev servers / registering.
const TELEGRAM_LINK_STATUS_TIMEOUT_MS = 6000;
const ACCOUNT_DELETED_NOTIFY_TIMEOUT_MS = 4000;

/**
 * Notify trefolio that this IdP subject deleted their unified account so
 * product analytics can record `account_deleted` and local data can be purged.
 * Best-effort: failures are logged and do not block IdP erasure.
 */
export async function notifyTrefolioAccountDeleted(sub: string): Promise<void> {
  const token = process.env.IDP_SERVICE_TOKEN?.trim();
  if (!token) {
    console.warn("[account-deleted] IDP_SERVICE_TOKEN missing; skip trefolio notify");
    return;
  }

  const target = getProductTargets().find((t) => t.app === "trefolio");
  if (!target) return;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ACCOUNT_DELETED_NOTIFY_TIMEOUT_MS);
  try {
    const res = await fetch(`${target.baseUrl}/api/internal/account-deleted`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...vercelProtectionBypassHeader("trefolio"),
      },
      body: JSON.stringify({ sub }),
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn("[account-deleted] trefolio notify failed", res.status);
    }
  } catch (err) {
    console.warn("[account-deleted] trefolio notify error", err);
  } finally {
    clearTimeout(timer);
  }
}



/**
 * Warren (trefolio) Telegram integration status for an IdP subject — used on `/account`.
 */
export async function fetchTrefolioTelegramLinkStatus(sub: string): Promise<{
  linked: boolean | null;
  hasAccount: boolean | null;
}> {
  const token = process.env.IDP_SERVICE_TOKEN?.trim();
  if (!token) return { linked: null, hasAccount: null };

  const target = getProductTargets().find((t) => t.app === "trefolio");
  if (!target) return { linked: null, hasAccount: null };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TELEGRAM_LINK_STATUS_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${target.baseUrl}/api/internal/telegram-link-status?sub=${encodeURIComponent(sub)}`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
          ...vercelProtectionBypassHeader("trefolio"),
        },
        cache: "no-store",
        signal: ctrl.signal,
      },
    );
    if (!res.ok) return { linked: null, hasAccount: null };
    const json = (await res.json()) as { linked?: unknown; hasAccount?: unknown };
    return {
      linked: typeof json.linked === "boolean" ? json.linked : null,
      hasAccount: typeof json.hasAccount === "boolean" ? json.hasAccount : null,
    };
  } catch {
    return { linked: null, hasAccount: null };
  } finally {
    clearTimeout(timer);
  }
}
