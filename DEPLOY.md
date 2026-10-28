# Deploy HDP meal verification (PWA + API)

This app is one Node process: the API (`@hdp/api`) serves `/api/*` and the built Vite PWA from `apps/web/dist`. Do **not** use InfinityFree.

## Production environment (required)

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | Long random string (32+ chars). Server refuses to start without it. |
| `SEED` | Leave unset or `false`. Training seed runs in production **only** if `SEED=true`. |
| `PORT` | Host-provided port (Railway/Render set this). Default `8787`. |
| `DATABASE_URL` | Optional. Postgres URL for multi-tablet field use. If unset, built-in PGlite file DB is used. |

Also replace all training users (`admin.taiz`, `focal.*`, password `Train-Hdp-2026`, PIN `2468`) before a live distribution.

## Simplest free path (recommended for training / pilot)

### 1. Optional free Postgres (multi-tablet)

1. Create a free project at [neon.tech](https://neon.tech) (or Railway Postgres / Supabase Postgres).
2. Copy the connection string → `DATABASE_URL`.

Skip this for a single training box; the built-in file DB works, but data can be lost on redeploy unless you attach a persistent volume.

### 2. Host the Node app on Railway or Render

**Railway** ([railway.app](https://railway.app)):

1. New project → Deploy from GitHub (push this repo) or CLI.
2. Root directory = repo root (`hdp-meal-verify`).
3. Build command:

```bash
npm install && npm run build
```

4. Start command:

```bash
npm run start -w @hdp/api
```

(`npm start` at the root also builds then starts the API.)

5. Variables: `NODE_ENV=production`, `JWT_SECRET=…`, `SEED=false`, and optional `DATABASE_URL`.
6. Open the public HTTPS URL. Install the PWA from Chrome on Android tablets (“Add to Home Screen”).

**Render** ([render.com](https://render.com)) — same idea: Web Service, Node, build `npm install && npm run build`, start `npm run start -w @hdp/api`, same env vars.

### 3. Why not split front end to Vercel/Cloudflare Pages?

Possible later, but not required. The API already serves the static PWA. Splitting means configuring CORS and a separate API host. One service is simpler for Taiz field tablets.

## Local production-like check

```bash
npm install
npm test
npm run build
NODE_ENV=production JWT_SECRET='replace-with-long-secret' SEED=false npm run start -w @hdp/api
```

Open `http://localhost:8787`. Health: `GET /api/health`.

## Field blockers to plan for

- **Camera / QR:** Needs **HTTPS** (or localhost). Chrome on Android; grant camera permission. Manual card code entry works if the camera fails.
- **Offline:** PWA + IndexedDB queue scans; first successful Served for household+Aden day wins on sync. Tablets must sync when network returns. First login and caseload sync need network.
- **PWA install:** HTTPS + `manifest.webmanifest` + service worker (already in the Vite build).
- **Geolocation:** Every scan stores tablet lat/lng when available. Per-point GPS check (Admin → Points) can be on or off; when on, outside-radius or missing fix blocks the meal.
- **Ephemeral disk:** Without `DATABASE_URL` and without a volume, PGlite data may reset on redeploy — use Postgres for live distribution.
- **Training seed:** Never leave `SEED=true` or training passwords on a live kitchen server.

## Optional local Postgres

```bash
docker compose up -d
export DATABASE_URL=postgres://hdp:hdp@localhost:5432/hdp
npm run dev
```
