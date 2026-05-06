---
name: integration-trefolio-accounts
description: >-
  Explains the trefolio-accounts IdP service — OIDC authorize/token, static OAuth
  clients for trefolio/clara/will, sessions, entitlements, and how product apps call it.
  Use when editing external/accounts auth routes, OIDC registry, or IdP DB behaviour.
---

# trefolio-accounts (IdP service)

This repo **is** the Identity Provider at `user.trefolio.com`. Product apps (trefolio, Clara, Will) are **OAuth2/OIDC clients** using Authorization Code + **PKCE**.

## Knowledge base (monorepo checkout)

When this folder exists as `stocktracker/external/accounts`, canonical product-wide specs live **outside** this package:

| Path from monorepo root | Purpose |
|-------------------------|---------|
| `knowledge/design-docs/unified-accounts-and-billing.md` | End-state architecture, ID token claims, billing |
| `knowledge/design-docs/clara-idp-integration.md` | Clara client expectations |
| `knowledge/design-docs/will-idp-integration.md` | Will client expectations |
| `knowledge/runbooks/unified-accounts-cutover.md` | Cutover operations |
| `dev/README.md` | Local proxy ports, TLS, `IDP_BASE_URL` hints |

From this skill’s directory (`.cursor/skills/integration-trefolio-accounts/` inside **accounts**), ascend **five** levels to the monorepo root, then into `knowledge/` or `dev/` (e.g. `../../../../../knowledge/design-docs/unified-accounts-and-billing.md`).

## Code map (this package)

| Area | Role |
|------|------|
| [`src/app/oauth2/authorize/page.tsx`](../../../src/app/oauth2/authorize/page.tsx) | Login + signup UI; `app_hint`, `screen_hint`, `signup`, `prompt=login` |
| [`src/app/api/oauth2/token/route.ts`](../../../src/app/api/oauth2/token/route.ts) | Token endpoint (code exchange) |
| [`src/lib/oidc.ts`](../../../src/lib/oidc.ts) | Client registry, auth codes |
| [`src/lib/db.ts`](../../../src/lib/db.ts) | Users, entitlements, Telegram links |
| [`src/lib/oidc-pending.ts`](../../../src/lib/oidc-pending.ts) | Google/passkey side-trip cookie |
| [`src/lib/idp-email-policy.ts`](../../../src/lib/idp-email-policy.ts) | Future verification-mail gating |
| [`README.md`](../../../README.md) | Local setup, issuer vs `IDP_BASE_URL` |
| [`src/lib/public-url.ts`](../../../src/lib/public-url.ts) | `IDP_ISSUER`, `getMetadataApiOrigin` / **`IDP_SERVER_ORIGIN`** for split OIDC discovery |
| [`src/app/api/.well-known/openid-configuration/route.ts`](../../../src/app/api/.well-known/openid-configuration/route.ts) | Discovery: public issuer + authorize; optional loopback token/jwks |

## Clients

Static OAuth clients (see `src/lib/oidc.ts`) use ids **`trefolio`**, **`clara`**, **`will`** with per-client secrets (`IDP_CLIENT_SECRET_*`). Each client registers redirect URIs for prod and dev hosts.

## Non-standard authorize query params

Documented in [`README.md`](../../../README.md): `app_hint`, `screen_hint=signup` (or `signup=1`), `login_hint`, `prompt=login`.

## Environment (IdP host)

- **`IDP_ISSUER`** — Fallback issuer when discovery is requested **without** `X-Forwarded-Host` (e.g. clients fetch metadata from `http://localhost:3300`). Use `https://user.trefolio-dev.com` with the Caddy proxy stack so `authorization_endpoint` is not `localhost`.
- **`IDP_SERVER_ORIGIN`** (optional, e.g. `http://127.0.0.1:3300`) — When set and the metadata request has no forwarded host, **`token_endpoint`**, **`userinfo_endpoint`**, and **`jwks_uri`** in discovery use this origin so Node clients avoid HTTPS to `*.trefolio-dev.com` without trusting Caddy’s CA.

See parent [`dev/README.md`](../../../../../dev/README.md).

## Standalone clone (no monorepo)

If this repo is the only folder in the workspace, use the personal skill at **`~/.cursor/skills/integration-trefolio-accounts/SKILL.md`** for a compact hub; copy `knowledge/design-docs/*` from a stocktracker checkout when you need full specs.

## Related skills in sibling repos

- Monorepo root: `.cursor/skills/integration-trefolio-accounts/SKILL.md` (trefolio client)
- `external/etracker/.cursor/skills/integration-trefolio-accounts/SKILL.md` (Clara)
- `external/notetaker/.cursor/skills/integration-trefolio-accounts/SKILL.md` (Will)
