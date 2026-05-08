# trefolio-accounts-dev

Local Identity Provider (IdP) used to test unified auth for:

- `trefolio` (`http://localhost:3010`)
- `clara` (`http://localhost:3001`)
- `will` (`http://localhost:3200`)

This project emulates `user.trefolio.com` on `http://localhost:3300`.

## What it provides

- OpenID discovery: `/.well-known/openid-configuration`
- OIDC Authorization Code + PKCE endpoints:
  - `/oauth2/authorize`
  - `/oauth2/token`
  - `/oauth2/userinfo`
  - `/oauth2/jwks`
- Service-to-service API:
  - `/v1/entitlements/:sub`
  - `/v1/telegram/link`
  - `/v1/telegram/by-id/:tgUserId`
  - `/v1/admin/users/import`
- Dev UI styled as the trefolio ecosystem (Warren + Clara + Will).

## Node.js and `better-sqlite3`

This app loads **`better-sqlite3`** (native addon). The `.node` binary must match the Node.js ABI (`process.versions.modules`) of the `node` that runs Next.

- **Node 22** is required — see [`.nvmrc`](./.nvmrc) and [`.node-version`](./.node-version) (same as the rest of the trefolio stack).
- After **`npm install`**, **`postinstall`** runs [`scripts/ensure-sqlite-native.mjs`](./scripts/ensure-sqlite-native.mjs): it loads the module and, on ABI mismatch (e.g. addon built with Node 18, runtime is 22), runs **`npm rebuild better-sqlite3`** automatically.
- **`npm run dev`**, **`npm run build`**, and **`npm run start`** run the same check via **`predev` / `prebuild` / `prestart`**, so switching Node without reinstalling usually self-heals on the next command.
- **`src/instrumentation.ts`** runs the same script when the server boots, so starting with **`next dev -p 3300`** (without npm) still self-heals.
- The rebuild step prepends the directory of **`process.execPath`** to **`PATH`** so `node-gyp` compiles with the same Node binary that runs Next (avoids “rebuilt with 18, server runs 22”).

If you still see **`NODE_MODULE_VERSION`** errors, rebuild manually with the **same** `node` that runs Next:

  ```bash
  cd external/accounts   # or repo root if you cloned accounts standalone
  export PATH="/opt/homebrew/opt/node@22/bin:$PATH"   # example: Homebrew Node 22
  node -p "process.version + ' module=' + process.versions.modules"
  npm rebuild better-sqlite3
  ```

  **`PATH` pitfall:** `PATH=/foo/bar cd … && npm rebuild` only applies `PATH` to `cd`, not to `npm`. Either `export PATH=…` first in the shell or run `env PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm rebuild better-sqlite3` from this directory.

## OIDC issuer (`iss`) vs relying-party `IDP_BASE_URL`

ID tokens use JWT claim **`iss`**. Each client (trefolio, Clara, Will) verifies that claim against the **`issuer`** from OIDC discovery (NextAuth) or against **`IDP_ISSUER`** on trefolio’s custom OIDC client.

- Behind **Caddy / Vercel**, discovery metadata and signed ID tokens derive the issuer from **`X-Forwarded-Host`** + **`X-Forwarded-Proto`** when present, so `https://user.trefolio-dev.com` matches clients that use **`IDP_BASE_URL=https://user.trefolio-dev.com`** even if **`IDP_ISSUER`** is unset.
- Without forwarded headers (direct `localhost:3300` metadata fetch), set **`IDP_ISSUER`** on this app to the **browser-facing** origin (e.g. `https://user.trefolio-dev.com`). JWTs and **`authorization_endpoint`** will use that issuer so users are not sent to `localhost` when apps use loopback **`IDP_BASE_URL`**.
- In **`NODE_ENV !== 'production'`**, if the resolved issuer would be **`https://user.trefolio.com`** (e.g. `NEXT_PUBLIC_APP_URL` copied from prod), [`getPublicIssuer`](./src/lib/public-url.ts) **rewrites it to `https://user.trefolio-dev.com`** so local Clara/Will never open production login by mistake. Set **`IDP_ALLOW_PRODUCTION_ISSUER=true`** to keep the production issuer string.
- Optional **`IDP_SERVER_ORIGIN`** (e.g. `http://127.0.0.1:3300`): when metadata is fetched without `X-Forwarded-Host`, **`token_endpoint`**, **`userinfo_endpoint`**, and **`jwks_uri`** in discovery point at this origin so Node clients avoid TLS to `*.trefolio-dev.com` while the authorize URL stays on **`IDP_ISSUER`**. See parent monorepo [`dev/README.md`](../../dev/README.md).

If `iss` and what the client expects differ, clients reject the ID token and restart OIDC — you will see repeated `/oauth2/authorize` navigations with a new `state` each time.

When you already have an IdP session cookie, `/oauth2/authorize` **HTTP-redirects** straight to the client `redirect_uri` with `code` (no intermediate page). Add **`prompt=login`** to the authorize URL if you must show the password form (e.g. sign in as another user).

### Authorize UI hints (non-standard query params)

These are **ignored by the OAuth protocol** but read by this app’s `/oauth2/authorize` UI:

| Param | Meaning |
| ----- | ------- |
| `app_hint` | `trefolio` · `clara` · `will` — branding on the login/signup screen (falls back to `client_id`). |
| `screen_hint=signup` | Opens **create-account-first** layout (equivalent: `signup=1`). |
| `login_hint` | Pre-fills the email field. |
| `ui_locales` | Space-separated BCP47 tags (e.g. `de en`) — IdP UI + verification email language; trefolio sends the browser’s preferred language when starting OIDC. |
| `prompt=login` | Forces the password/passkey form even if an IdP session cookie exists. |

Google and passkey side-trips stash these via the signed `oidc_pending` cookie so errors return you to the same mode.

## Local setup

```bash
cp .env.example .env.local
npm install
node -e "
const { generateKeyPairSync } = require('crypto');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
require('fs').writeFileSync('idp-private.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }));
require('fs').writeFileSync('idp-public.pem', publicKey.export({ type: 'spki', format: 'pem' }));
"
npm run dev
```

Open `http://localhost:3300`.

## Seed users

- `dev@trefolio.test` / `password123` (Pro)
- `free@trefolio.test` / `password123` (Free)

You can switch plan per user from the homepage.

## Stripe billing (`/upgrade`)

Uses the **same Stripe account and Price IDs as Warren (trefolio.com)**. Configure on Vercel:

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Server-side API |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for **`POST /api/billing/webhook`** on this deployment |
| `STRIPE_PRICE_PRO_MONTHLY` | Same `price_…` as Warren (`STRIPE_PRICE_PRO_MONTHLY`) |
| `STRIPE_PRICE_PRO_ANNUAL` | Same `price_…` as Warren (`STRIPE_PRICE_PRO_ANNUAL`) |

Billing UI: **`/upgrade`** (requires IdP session cookie). Checkout API: **`POST /api/billing/checkout`** (JSON body `{ "interval": "monthly" \| "annual", "from": "clara" \| "will" \| "trefolio" }`).

If Stripe returns **“No such price”**, the `price_…` in `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_PRO_ANNUAL` does not exist **for the Stripe account and mode** implied by **`STRIPE_SECRET_KEY`** on this deployment (e.g. live price ID with `sk_test_…`, or keys from a different Stripe account than where the product was created). Fix the Vercel env vars so all three match Warren’s production Stripe account.

## Notes

- This repo is **dev-only**. Do not use these secrets in production.
- The local DB (`idp-dev.db`) and keys (`idp-private.pem`, `idp-public.pem`) are ignored by git.
- **Vercel / production:** PEM files are **not** in the deployment bundle. Set **`IDP_PRIVATE_KEY_PEM`** and **`IDP_PUBLIC_KEY_PEM`** (full PEM text; Vercel supports multiline secrets) on the `trefolio-accounts` project. Without them, `/api/oauth2/token` returns **500** when minting `id_token` after authorize — Will/Clara/trefolio then show `OAuthCallback` / token exchange errors.
- **Email verification (password sign-up):** In production, set **`RESEND_API_KEY`** (and typically **`RESEND_FROM_ADDRESS`**, same as trefolio). New password accounts start **unverified** until the user opens the link on **`user.trefolio.com/api/auth/verify-email`**. Use **`IDP_SKIP_VERIFICATION_EMAIL=true`** only on staging if you must disable outbound mail.
- **Password reset (email/password accounts):** Users can open **`/account/forgot-password`** (linked from the login form on **`/oauth2/authorize`**) to request a link. The email points to **`/account/reset-password?token=…`** (JWT, 1h TTL). Signing uses **`IDP_PASSWORD_RESET_SECRET`** if set, else the same secret stack as email verification (`IDP_EMAIL_VERIFICATION_SECRET`, `IDP_SESSION_SECRET`, …). In local dev, reset URLs are printed to the server log instead of being emailed.
- **Resend on the IdP project:** Production mail (verification + password reset) requires **`RESEND_API_KEY`** (and usually **`RESEND_FROM_ADDRESS`**) on the **trefolio-accounts** Vercel project — not only on the trefolio app. If those are missing, password reset returns an error instead of pretending the email was sent.
- Production `trefolio-accounts` uses PostgreSQL; key rotation remains a future ops task.
