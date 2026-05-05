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

This app loads **`better-sqlite3`** (native addon). The `.node` binary must match the **exact Node.js ABI** you use for `npm install`, `npm rebuild`, and `npm run dev`.

- If you see **`NODE_MODULE_VERSION` mismatch** (e.g. **108** vs **141**: addon built with Node **18**, runtime is Node **22+**), rebuild with the **same** `node` that runs Next:

  ```bash
  cd external/accounts   # or repo root if you cloned accounts standalone
  export PATH="/opt/homebrew/bin:$PATH"   # example: prefer Homebrew’s current node over node@18 shims
  node -p "process.version + ' module=' + process.versions.modules"
  npm rebuild better-sqlite3
  ```

  **`PATH` pitfall:** `PATH=/foo/bar cd … && npm rebuild` only applies `PATH` to `cd`, not to `npm`. Either `export PATH=…` first in the shell or run `env PATH="/opt/homebrew/bin:$PATH" npm rebuild better-sqlite3` from this directory.

- After **any** Node major upgrade/downgrade, run `npm rebuild better-sqlite3` again (or delete `node_modules` and `npm install`).

- On macOS/Homebrew, **Node 22** ([`.nvmrc`](./.nvmrc)) keeps parity with the rest of the trefolio stack; point `PATH` at that binary if multiple Nodes are installed.

## OIDC issuer (`iss`) vs relying-party `IDP_BASE_URL`

ID tokens use JWT claim **`iss`**. Each client (trefolio, Clara, Will) verifies that claim against its **`IDP_BASE_URL`**.

- Behind **Caddy / Vercel**, discovery metadata and signed ID tokens derive the issuer from **`X-Forwarded-Host`** + **`X-Forwarded-Proto`** when present, so `https://user.trefolio-dev.com` matches `IDP_BASE_URL=https://user.trefolio-dev.com` even if `IDP_ISSUER` is unset.
- Without forwarded headers (direct `localhost:3300`), set **`IDP_ISSUER`** on this app to the same origin you configure as **`IDP_BASE_URL`** on clients.

If `iss` and `IDP_BASE_URL` differ, clients reject the ID token and restart OIDC — you will see repeated `/oauth2/authorize` navigations with a new `state` each time.

When you already have an IdP session cookie, `/oauth2/authorize` **HTTP-redirects** straight to the client `redirect_uri` with `code` (no intermediate page). Add **`prompt=login`** to the authorize URL if you must show the password form (e.g. sign in as another user).

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

## Notes

- This repo is **dev-only**. Do not use these secrets in production.
- The local DB (`idp-dev.db`) and keys (`idp-private.pem`, `idp-public.pem`) are ignored by git.
- Production `trefolio-accounts` should use PostgreSQL + Prisma and real key rotation.
