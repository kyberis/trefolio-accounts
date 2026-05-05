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

This app loads **`better-sqlite3`** (native addon). The `.node` binary must match the **same major Node** you use for `npm install` / `npm run dev`.

- If you see `NODE_MODULE_VERSION` mismatch (e.g. **127** vs **141**), you upgraded Node (e.g. 22 → 25) without rebuilding: run  
  `npm rebuild better-sqlite3`  
  (needs network the first time so `node-gyp` can fetch headers.)
- Until prebuilt binaries exist for your Node version, the least-friction setup on macOS/Homebrew is **Node 22** for this repo only, e.g.  
  `PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run dev`  
  or `nvm use` / `fnm use` with the version in [`.nvmrc`](./.nvmrc).

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
