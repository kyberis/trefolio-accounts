import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * `idp_session` is host-scoped. If users hit `www.user.trefolio.com` but logged in
 * on `user.trefolio.com` (or vice versa), the cookie is missing and /agents looks
 * "logged out". Normalize to the apex host used in OIDC issuer / links.
 */
export function middleware(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || req.nextUrl.host;

  if (host === "www.user.trefolio.com" || host === "www.user.trefolio-dev.com") {
    const url = req.nextUrl.clone();
    url.hostname = host.replace(/^www\./, "");
    return NextResponse.redirect(url, 308);
  }

  const res = NextResponse.next();
  const p = req.nextUrl.pathname;
  if (
    p.startsWith("/agents") ||
    p.startsWith("/account") ||
    p.startsWith("/admin") ||
    p.startsWith("/api/account") ||
    p.startsWith("/sign-in") ||
    p.startsWith("/oauth2/")
  ) {
    res.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
