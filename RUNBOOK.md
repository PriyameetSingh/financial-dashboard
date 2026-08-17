# Airawat Finance Dashboard — dev/demo Docker runbook

This stack is **dev/demo grade**, not a production deployment. It runs Postgres (pgvector), pgAdmin, a one-shot migrate/seed, and the Next.js **dev server** so the built-in `/api/dev/session` sign-in works. There is no Keycloak container.

Postgres and pgAdmin are bound to **localhost only**. Postgres is published on **127.0.0.1:5433** (host port 5432 is already in use on this server by another container). The app is published on `0.0.0.0:3000` so tenant hostnames on this machine can reach it.

## 1. One-time host setup

Add tenant hostnames (required — `localhost` cannot tell Odisha from Suryapur once both tenants exist):

```bash
sudo tee -a /etc/hosts >/dev/null <<'EOF'
127.0.0.1  odisha.airawat.test demo.airawat.test
EOF
```

Copy env files and put a real auth secret in `.env`:

```bash
cp .env.example .env
cp .env.test.example .env.test.local
# Edit .env: set AUTH_SECRET (`openssl rand -base64 32`) and KEYCLOAK_CLIENT_SECRET
# from the Keycloak client's Credentials tab. Other KEYCLOAK_* values are already
# pointed at the airawat-dashboard realm.
```

Keep `NEXT_PUBLIC_BASE_PATH` empty. To restore the historical `/hudd-dashboard` URL prefix, set it in `.env` **and** in the Compose `app.environment` block, then recreate the app container (`docker compose up -d --force-recreate app`). That value is read when `next dev` starts.

## 2. Bring up

```bash
docker compose up -d --build
```

First boot runs `init` (creates `hudd_test`, enables pgvector on both databases, migrates both, seeds). The app starts only after `init` exits 0. `next dev` can take a minute; wait until `docker compose ps` shows `app` healthy, or:

```bash
curl -sf http://127.0.0.1:3000/api/health
```

## 3. What was seeded

On **hudd_nexus** (the running app):

1. `prisma migrate deploy`
2. `npm run db:seed` — Odisha master data, roles, finance-desk user
3. `npm run db:seed:roles` — TASU bootstrap admin
4. `node prisma/seed_demo_tenant.js` — Suryapur Development Authority (slug `demo`)

On **hudd_test** (golden / vitest):

1. `prisma migrate deploy`
2. `npm run db:seed:test` equivalent — full Odisha seed only. The Suryapur script is **never** run here.

## 4. Reach Odisha and Suryapur

The app is at the **site root** (no `/hudd-dashboard`).

### The short way: one host, no /etc/hosts, no sign-in

With `DEV_AUTH_ENABLED=1` in development, a tenant can be addressed by the FIRST
PATH SEGMENT on plain `localhost`. Nothing to add to `/etc/hosts`, no login
screen, no Keycloak.

| What | URL |
|---|---|
| Public Airawat landing | http://localhost:3000/ |
| Odisha workspace | http://localhost:3000/odisha/dashboard |
| Suryapur (the demo) | http://localhost:3000/demo/dashboard |
| Onboarding (public) | http://localhost:3000/onboarding |

The prefix is an ENTRY POINT, not a permanent address: `/odisha/dashboard` mints
a dev session for Odisha's tenant-administrator and redirects to `/dashboard`,
after which the session cookie carries the tenant and the URLs are the ordinary
ones. Visit `/demo/…` to switch — the mint replaces the session. Any deep link
works the same way (`/odisha/financial`, `/demo/kpis`).

An unknown first segment lands on the landing. Reserved roots (`/onboarding`,
`/api`, `/_next`, and every top-level page) are never read as tenant slugs.

### The production shape: a host per tenant

This is what a deployment actually does, and it still works locally with
`/etc/hosts` entries. Per-tenant hosts take precedence: on `odisha.airawat.test`
the first path segment is just a path, and `/` belongs to Odisha's workspace.

| Tenant | Open in a browser | Sign in (dev-auth, no Keycloak) |
|---|---|---|
| Odisha | http://odisha.airawat.test:3000/ | http://odisha.airawat.test:3000/api/dev/session?tenant=odisha |
| Suryapur | http://demo.airawat.test:3000/ | http://demo.airawat.test:3000/api/dev/session?tenant=demo |

After the mint URL returns JSON `{ "minted": true, ... }`, go to `/dashboard` on the **same host**. Optional `?user=` (user code or email). Defaults: Odisha `finance.desk@hudd.bootstrap`; Suryapur Avery Lindqvist (`SDA_DIR`).

From the shell (Host header, cookie replayed):

```bash
curl -sf -c /tmp/odisha.jar -H 'Host: odisha.airawat.test' \
  'http://127.0.0.1:3000/api/dev/session?tenant=odisha'
curl -sf -b /tmp/odisha.jar -H 'Host: odisha.airawat.test' \
  -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:3000/dashboard'

curl -sf -c /tmp/demo.jar -H 'Host: demo.airawat.test' \
  'http://127.0.0.1:3000/api/dev/session?tenant=demo'
curl -sf -b /tmp/demo.jar -H 'Host: demo.airawat.test' \
  -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:3000/dashboard'
```

Expect `200` (or `307` then follow) on `/dashboard` after mint. An unauthenticated visit to `/` redirects to `/login`.

pgAdmin: http://127.0.0.1:5050 (admin@gmail.com / admin). Server host inside the network is `postgres`, user `hudd_user`, databases `hudd_nexus` and `hudd_test`.

## 5. Golden / tests against this Postgres

From the **host**, with `.env` / `.env.test.local` pointing at `127.0.0.1:5433`:

```bash
# filesystem + compile (no extra DB beyond what init seeded)
npx tsc --noEmit
npm run build
node scripts/check-api-guards.mjs
node scripts/verify-behaviors.mjs
node scripts/check-no-hardcoded-color.mjs
node scripts/check-proxy-matcher.mjs
npx tsx scripts/check-route-module-map.ts
node scripts/check-tenant-chokepoint.mjs

# DB-backed
npx vitest run
node --env-file=.env.test.local scripts/check-tenant-integrity.mjs

# Boots its own `next dev` (does not use the Compose app). Needs both tenants
# on hudd_nexus, so use .env.local or .env pointing at hudd_nexus.
cp -n .env .env.local
node --env-file=.env.local scripts/check-http-smoke.mjs
```

`check-a11y` needs a Chromium at `A11Y_CHROMIUM` (default `/opt/pw-browsers/chromium`). Skip it if that browser is not installed.

## 6. Tear down and reset

```bash
# Stop containers; keep the database volume
docker compose down

# Wipe Postgres data (next `up` re-runs init from scratch)
docker compose down -v
```

Re-running `init` without `-v` is safe: migrate deploy is incremental, Odisha seed upserts, Suryapur seed resets only the demo tenant then recreates it.

If `hudd_postgres_data` already existed from an older Compose that never created `hudd_test`, `init` still creates that database — `docker-entrypoint-initdb.d` is not used, because it does not run on an existing volume.

## 7. Out of scope

TLS / reverse proxy, backups, a secrets manager, production hardening, per-tenant auth, file-storage namespacing, a public sandboxed demo, and a Keycloak container. The Keycloak env vars exist so the app can boot; sign-in for this stack is **dev-auth**.
