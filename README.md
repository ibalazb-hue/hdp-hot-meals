# HDP meal verification — Taiz

Offline-capable tablet PWA for one hot meal per household per day in Al-Mudhaffar and Al-Qahira. Cards replace fingerprints. The calendar day is Asia/Aden.

## Run

```powershell
npm install
npm test
npm run dev
```

Open http://localhost:5173 . The API is http://localhost:8787 .

`npm run build` then `npm start` serves the installed app and the API on port 8787.

Set `DATABASE_URL` to use PostgreSQL (`docker compose up -d` and `postgres://hdp:hdp@localhost:5432/hdp`). With no URL, the API uses a PostgreSQL-compatible file database and the same migration in `db/migrations`.

On a live deployment set `NODE_ENV=production` and `JWT_SECRET`, leave `SEED` unset or `false` (training seed runs in production only if `SEED=true`), then replace the training users. See `DEPLOY.md`.

## Training sign-in

Password `Train-Hdp-2026`. Supervisor PIN `2468`.

| User | Role |
| --- | --- |
| focal.mudhaffar | DP focal for MDF01 and MDF02 |
| focal.qahira | DP focal for QAH01 |
| meal.taiz | Registration / MEAL |
| supervisor.taiz | Supervisor |
| admin.taiz | Admin |

Sample card `CMDF01000101` is household `TZ-MDF01-000101`. `CMDF01000103` is voided. `CQAH01000201` belongs to Qahira.

## Rules that are not configurable in the app

- One counting scan (Served, Override, or ManualException) per household per Aden day.
- A voided card never counts. Reissue voids the old card and issues a new one.
- A card used at the wrong point is blocked unless a supervisor enters a reason and PIN. That scan is an Override.
- A manual household code with the supervisor PIN is a ManualException, including at another point. It still cannot add a second meal or revive a voided card.
- If two tablets both serve offline, the earlier device time wins. The other row stays in the audit as a duplicate and does not count.
- Unscanned meals are not distributions. Reconciliation compares meals prepared with unique counting scans and alerts above 1%.
