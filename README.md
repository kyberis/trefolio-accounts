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
