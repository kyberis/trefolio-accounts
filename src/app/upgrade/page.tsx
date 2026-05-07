import Link from "next/link";
import { cookies } from "next/headers";

import { Brand } from "@/components/Brand";
import { findUserBySub, getEntitlement } from "@/lib/db";
import { getProductTargets } from "@/lib/product-links";
import { IDP_SESSION_COOKIE, verifySession } from "@/lib/session";
import UpgradeCheckout from "./upgrade-checkout";

export const dynamic = "force-dynamic";

const FROM_ALLOWED = new Set(["clara", "will", "trefolio"]);

function normalizeFrom(raw: string | undefined): string {
  const v = (raw ?? "clara").trim().toLowerCase();
  return FROM_ALLOWED.has(v) ? v : "clara";
}

function normalizeInterval(raw: string | undefined): "monthly" | "annual" | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "annual") return "annual";
  if (v === "monthly") return "monthly";
  return null;
}

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const from = normalizeFrom(
    typeof searchParams.from === "string" ? searchParams.from : undefined,
  );
  const intervalHint = normalizeInterval(
    typeof searchParams.interval === "string" ? searchParams.interval : undefined,
  );
  const billingRaw = typeof searchParams.billing === "string" ? searchParams.billing : "";
  const billingFlash:
    | "success"
    | "cancelled"
    | "portal_return"
    | null =
    billingRaw === "success"
      ? "success"
      : billingRaw === "cancelled"
        ? "cancelled"
        : billingRaw === "portal_return"
          ? "portal_return"
          : null;
  const skipLanding =
    typeof searchParams.skipLanding === "string" && searchParams.skipLanding === "1";

  const jar = await cookies();
  const sub = verifySession(jar.get(IDP_SESSION_COOKIE)?.value);

  if (!sub) {
    const targets = getProductTargets();
    const product = targets.find((t) => t.app === from) ?? targets.find((t) => t.app === "clara");
    const signInHref = product ? `${product.baseUrl}/login` : "/";

    return (
      <div className="page-shell">
        <main className="page-main" style={{ flexDirection: "column", gap: 24 }}>
          <div className="card card-wide">
            <div style={{ textAlign: "center" }}>
              <Brand href="https://trefolio.com" />
            </div>
            <div className="heading-stack">
              <h1>Sign in to upgrade</h1>
              <p>
                Your trefolio account manages billing for Warren, Clara, and Will. Sign in through{" "}
                <strong>{product?.label ?? "an app"}</strong> first, then open this page again.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
              <Link className="btn-primary-lg" href={signInHref} style={{ display: "inline-block", textAlign: "center" }}>
                Sign in via {product?.label ?? "app"}
              </Link>
              <Link href="/" className="link-muted">
                Back to account home
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const user = await findUserBySub(sub);
  const ent = await getEntitlement(sub);
  const isPro =
    ent.plan === "pro" && (!ent.pro_until || new Date(ent.pro_until) > new Date());

  const productTargets = getProductTargets().map((t) => ({
    app: t.app,
    label: t.label,
    baseUrl: t.baseUrl,
  }));

  const showProductLanding =
    FROM_ALLOWED.has(from) && !billingFlash && !skipLanding && !isPro;

  return (
    <div className="page-shell">
      <main className="page-main" style={{ flexDirection: "column", gap: 24 }}>
        <div className="card card-wide">
          <div style={{ textAlign: "center" }}>
            <Brand href="https://trefolio.com" />
          </div>
          <div className="heading-stack">
            <h1>Trefolio Pro</h1>
            <p>
              Signed in as <strong>{user?.email ?? sub}</strong>. One subscription unlocks higher limits for portfolio
              tracking, Clara, and Will.
            </p>
          </div>
          <UpgradeCheckout
            from={from}
            initialIsPro={isPro}
            billingFlash={billingFlash}
            initialInterval={intervalHint ?? undefined}
            showProductLanding={showProductLanding}
            productTargets={productTargets}
          />
        </div>
      </main>
    </div>
  );
}
