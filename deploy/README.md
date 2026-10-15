# Deploying the public demo

Target: `https://creditly.longtn.shop` → Cloudflare → Nginx Proxy Manager →
`creditly-app:3101` on the Docker network `portfolio`.

## 1. Build the image

```bash
docker buildx build --platform linux/amd64 -t creditly:latest --load .
```

About 81 MB compressed (`docker save | gzip`), 233 MB on disk. Next.js
`output: "standalone"` on `node:22-alpine`; migrate/seed/demo-reset ship as
esbuild bundles in `scripts/`. To move it without a registry:
`docker save creditly:latest | gzip | ssh <host> 'gunzip | docker load'`.

## 2. Database

Creditly needs **its own database** on the shared Postgres (it has tables such
as `users` and its own `drizzle.__drizzle_migrations`):

```sql
CREATE ROLE creditly LOGIN PASSWORD '...';
CREATE DATABASE creditly OWNER creditly;
```

Migrations and an idempotent seed run on every container start; the app waits
up to 30 s for the database to accept connections.

## 3. Environment

Copy [`.env.vps.example`](.env.vps.example) to `deploy/.env.vps` on the server.

| Variable | Required | Value |
| --- | --- | --- |
| `DATABASE_URL` | yes | `postgres://creditly:...@<postgres-host>:5432/creditly` |
| `AUTH_SECRET` | yes | `openssl rand -base64 32` |
| `STRIPE_WEBHOOK_SECRET` | yes | any long random string (`openssl rand -hex 32`). Keep it secret: it signs the simulator's webhook events, so anyone with it could grant credits. |
| `SEED_ADMIN_PASSWORD` | yes | random; visitors use the one-click admin button, not this password |
| `PUBLIC_URL` | no | default `https://creditly.longtn.shop` (sets `APP_URL` and `AUTH_URL`) |
| `CLIENT_IP_HEADER` | no | default `cf-connecting-ip` |
| `ANTHROPIC_API_KEY` | no | leave empty: the offline demo summarizer costs nothing. With a key, any visitor can spend it (5 runs/min per account, unlimited accounts). |
| `CREDITLY_IMAGE` | no | default `creditly:latest` |

Fixed in the compose file: `DEMO_PUBLIC=1`, `STRIPE_SECRET_KEY=sk_test_123`,
`STRIPE_API_BASE=http://stripe-mock:12111`,
`SIMULATOR_WEBHOOK_URL=http://127.0.0.1:3101/api/stripe/webhook`,
`AUTH_TRUST_HOST=true`.

## 4. Run

```bash
docker compose -f deploy/compose.vps.yml --env-file deploy/.env.vps up -d
docker compose -f deploy/compose.vps.yml --env-file deploy/.env.vps ps   # app should be "healthy"
```

No host ports are published. In Nginx Proxy Manager: forward
`creditly.longtn.shop` to `http` / `creditly-app` / `3101`, with websockets off
and SSL handled as for the other sites. Health check: `GET /api/health` →
`{"ok":true}`.

## 5. Nightly reset

Wipes everything visitors created and seeds the demo data again (~1 s; only
Creditly's own tables are touched):

```cron
30 3 * * * cd /path/to/creditly && docker compose -f deploy/compose.vps.yml --env-file deploy/.env.vps exec -T app node scripts/demo-reset.mjs >> /var/log/creditly-reset.log 2>&1
```

Sessions of reset accounts become invalid; visitors just click "Try the live
demo" again.

## What public demo mode changes

| | |
| --- | --- |
| Sign-in | "Try as customer" / "Try as admin" on the landing and login pages; credentials never leave the server |
| URL summaries | refused server-side (the host runs private services; SSRF), explained in the UI |
| Demo accounts | password reset refused for `ava@demo.creditly.test` and `admin@creditly.test` |
| Forgot password | sends nothing; shows a demo notice |
| Rate limits | per IP, in Postgres: login 20 / 10 min, demo sign-in 30 / 10 min, sign-up 5 / hour |
| Admin area | emails typed by visitors are masked (`j***@g***.com`); sign-up warns that the admin area is shared |
