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
    (isProd ? "https://trefolio.com" : "http://localhost:3000");
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
  /** Hard timeout per product call. Defaults to 1.8 s — admin lists fan
   *  out to N users × 3 products, so we cannot afford long hangs. */
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
  const timeout = args.timeoutMs ?? 1800;
  const params = new URLSearchParams({ email: args.email }).toString();

  const calls = targets.map(async (t): Promise<ProductLinkResult> => {
    const ctrl = new AbortController();
    const handle = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(
        `${t.baseUrl}/api/v1/users/by-sub/${encodeURIComponent(args.sub)}?${params}`,
        {
          method: "GET",
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: args.signal ?? ctrl.signal,
        },
      );
      if (!res.ok) {
        return {
          app: t.app,
          label: t.label,
          exists: false,
          error: `HTTP ${res.status}`,
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
