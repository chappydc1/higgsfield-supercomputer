---
name: local-postgres-proxy
description: Spin up the Cloud SQL Auth Proxy against the lita-ehousing postgres instance and wire FastAPI to use it locally. Use whenever a task needs real production-like applicants/applications/transactions data — anything reading/writing `applications`, `canonical_transactions`, `canonical_financial_accounts`, `canonical_income_summaries`, KYC tables, or the `/applicants` and `/dashboard` pages — instead of dummy demo data or SQLite. Trigger on phrases like "use postgres", "real data", "Cloud SQL", "GCP database", "tobias's data", "spin up the proxy", "the API still shows demo applicants", or any time a backend write needs to land in the production-like dev DB rather than a local file.
---

# Local Cloud SQL Postgres + Proxy

The lita-ehousing postgres lives in **GCP Cloud SQL** (`elemental-day-443510-e0:us-central1:lita-ehousing`). Locally we reach it through the **Cloud SQL Auth Proxy**, which authenticates with a service account key and exposes plain TCP on `127.0.0.1:5432`. With the proxy up, the FastAPI backend talks to it like any local postgres — no IAM, no Cloud SQL Connector, no ADC headaches.

The reason this skill exists: every fresh dev session re-runs the same diagnosis ("why is /applicants showing Alice/Bob/Carol/David/Emma?"). It's always the same answer — proxy isn't running, or the backend's MySQL engine crashed at import, or the Next.js fetch timed out. Encoding the fix here saves ~30 minutes per session.

## When to use

Trigger this skill when the task involves any of:
- `/applicants` or `/dashboard` page changes
- backend `applications` endpoints (`/api/v1/applications*`)
- canonical transactions, income summaries, financial accounts
- KYC fields (postal_address, residence_permit_number, profession, current_employer, job_title)
- writing test data for `applicant_id` (e.g. seeding income/transactions for a specific applicant)
- "real data" / "postgres" / "Cloud SQL" / "GCP" requests
- /applicants showing dummy demo rows (`Alice Johnson`, `Bob Smith`, `Carol White`, `David Lee`, `Emma Brown` — those are the dev fallback at [frontend/app/api/applications/route.ts:79-110](frontend/app/api/applications/route.ts:79))

## Step 1 — Confirm the proxy is running

```bash
lsof -iTCP:5432 -sTCP:LISTEN | head -3
PGPASSWORD='Litaehousingpassword123?' psql -h 127.0.0.1 -p 5432 -U postgres -d lita-ehousing -c "SELECT 1" >/dev/null && echo "proxy OK" || echo "proxy NOT reachable"
```

If `psql` returns `proxy OK`, skip to Step 2.

If nothing is listening, spin it up. The proxy binary and key live in the user's main checkout root:

```bash
cd /Users/chappy/Downloads/old/chappy2/coding/backup/dwilar/lita-ehousing
ls cloud-sql-proxy service-key.json   # both must exist
./cloud-sql-proxy elemental-day-443510-e0:us-central1:lita-ehousing \
  --credentials-file=./service-key.json \
  > /tmp/cloud-sql-proxy.log 2>&1 &
# wait until "ready for new connections" appears
until grep -q "ready for new connections" /tmp/cloud-sql-proxy.log 2>/dev/null; do sleep 0.5; done
echo "proxy listening on 127.0.0.1:5432"
```

If `cloud-sql-proxy` or `service-key.json` is missing, tell the user — do not attempt to download the binary or fetch credentials yourself. If the proxy fails with auth errors, the service key may be expired; ask the user to refresh it.

## Step 2 — Connection details (Cloud SQL postgres)

```
host:     127.0.0.1
port:     5432
user:     postgres
password: Litaehousingpassword123?
database: lita-ehousing
```

These are dev credentials for a Cloud SQL instance Tobias owns; they're already in `~/.zshrc` exports and not considered secret-secret. Don't paste them into commits, PR descriptions, or external services.

Quick reference:
```bash
PGPASSWORD='Litaehousingpassword123?' psql -h 127.0.0.1 -p 5432 -U postgres -d lita-ehousing
```

Useful tables:
- `applications` — the live housing-application rows. Tobias is `id=28` (`tobias@tobiasa.com`). Powers `/applicants`.
- `application_drafts` — in-progress submissions before final submit.
- `canonical_transactions` — transaction ledger. `applicant_id` is `varchar(36)`, format `app-NNNNNNNN` (zero-padded to 8). Tobias = `app-00000028`.
- `canonical_financial_accounts`, `canonical_income_summaries` — same applicant_id format.
- `open_banking_consents` — Salt Edge / Plaid consent records.

## Step 3 — Backend env (so FastAPI uses the proxy, not the connector)

Write `backend/.env` (gitignored — `.gitignore:135`):

```
APP_ENV=local
POSTGRES_DB_HOST=127.0.0.1
POSTGRES_DB_PORT=5432
POSTGRES_DB_USER=postgres
POSTGRES_DB_PASSWORD=Litaehousingpassword123?
POSTGRES_DB_NAME=lita-ehousing
```

The backend autoloads `.env` via `python-dotenv` in [backend/src/__init__.py:35](backend/src/__init__.py:35). The `_postgres_tx_engine` in [backend/src/config/database.py:194-256](backend/src/config/database.py:194) checks `POSTGRES_DB_HOST` before falling through to the Cloud SQL Connector path — so with these vars set, postgres connects via plain TCP through the proxy.

## Step 4 — Start the backend (the gotchas)

The user's shell typically exports these (verify with `env | grep -E '^(APP_ENV|DB_|CLOUD_SQL_)'`):
- `APP_ENV=prod`
- `DB_HOST=...`, `DB_USER=...`, `DB_PASSWORD=...`, `DB_NAME=...`, `DB_PORT=3306`
- `CLOUD_SQL_CONNECTION_NAME=elemental-day-443510-e0:us-central1:lita-ehousing`

Two failure modes these trigger:
1. **`APP_ENV=prod`** forces the production code path in `_default_engine` (line 98) which requires Cloud SQL Connector + ADC. ADC is usually expired → `RefreshError: Reauthentication is needed`.
2. **`python-dotenv` loads with `override=False`** ([backend/src/__init__.py:35](backend/src/__init__.py:35)) — so `.env` cannot beat shell exports.

Solution: pass overrides on the uvicorn command line (these win over both shell and dotenv). Also point the legacy MySQL engine at a throwaway SQLite file so it doesn't try to reach the prod MySQL at boot:

```bash
cd backend
# create venv if missing — must be Python 3.10+ (codebase uses PEP 604 `int | str` unions)
[ -d .venv ] || /opt/homebrew/bin/python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt

# start uvicorn with shell-env exorcism
APP_ENV=local DATABASE_URL='sqlite:///./local-mysql-shim.db' \
  env -u DB_HOST -u DB_PORT -u DB_USER -u DB_PASSWORD -u DB_NAME \
      -u CLOUD_SQL_CONNECTION_NAME \
      APP_ENV=local DATABASE_URL='sqlite:///./local-mysql-shim.db' \
      .venv/bin/python -m uvicorn src.main:app \
        --host 127.0.0.1 --port 8000 --log-level info \
        > /tmp/backend.log 2>&1 &

# wait for ready
until grep -E "Application startup complete|ERROR|Traceback" /tmp/backend.log 2>/dev/null | head -1; do sleep 1; done
```

Smoke-test the postgres path:
```bash
curl -s http://127.0.0.1:8000/api/v1/applications | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d), 'rows'); [print(a['id'], a['email'], a.get('country'), a.get('full_name')) for a in d]"
```
Expect to see Tobias (id 28, SE) and any other real applicants. If you see Alice/Bob/Carol/David/Emma — backend isn't reachable from the route, see Step 6.

## Step 5 — Frontend env (so /applicants stops showing dummy data)

In `.claude/launch.json`, the `Frontend (Next.js)` config needs:
```json
"env": {
  "BACKEND_API_URL": "http://localhost:8000",
  "NEXT_PUBLIC_BACKEND_API_URL": "http://localhost:8000"
}
```

Without these, the Next.js route in [frontend/app/api/applications/route.ts](frontend/app/api/applications/route.ts) tries `http://backend:8000` (the Docker hostname), times out, and falls back to **5 hardcoded demo applicants** because of this branch:

```ts
if (
  process.env.NEXT_PUBLIC_ENABLE_CREDIT_FALLBACK === "true" ||
  process.env.NODE_ENV !== "production"
) { return dummyDemoApps }
```

Note: `NODE_ENV !== "production"` is true in dev — so the fallback fires whenever fetch fails, regardless of the `NEXT_PUBLIC_ENABLE_CREDIT_FALLBACK` flag. Don't try to "disable the fallback" by changing that env var — it won't help. Fix the upstream fetch instead.

## Step 6 — Fetch timeout

The Next.js route's fetch timeout is set in [frontend/app/api/applications/common.ts](frontend/app/api/applications/common.ts) (`setTimeout(() => controller.abort(), 30_000)`). Cloud-postgres roundtrip through the proxy can be ~6-7s for the applications list — historically this was 5s, which silently fired the dummy fallback. If you're debugging and times look slow, verify this is at least 30s.

If the backend is consistently slow (>10s for `/api/v1/applications`), that's a separate perf bug worth investigating — N+1 from credit-score lookups per row is the usual suspect.

## Step 7 — Browser session note

`/applicants` is auth-gated. A fresh preview session won't render the page even when the API returns real rows — it auto-redirects to `/login`. To verify visually you need a logged-in browser session (Auth0). For automated verification, hit `/api/applications` directly via curl and assert on the JSON.

## Reversing test writes

If you seed test data into postgres, scope it so a single DELETE rolls it back. Convention used so far:

```sql
-- seed example: monthly $200k for tobias
INSERT INTO canonical_transactions
  (applicant_id, provider_name, provider_transaction_id, posted_date,
   amount_usd, direction, category_primary, counterparty_name,
   description_original, is_recurring)
SELECT 'app-00000028', 'manual',
       'manual-tobias-salary-' || to_char(d, 'YYYY-MM'),
       d::date, 200000.0000, 'credit', 'income',
       'Lita', 'Monthly salary - Lita', true
FROM generate_series('2024-06-01'::date, '2026-05-01'::date, interval '1 month') AS d;

-- rollback
DELETE FROM canonical_transactions
WHERE applicant_id='app-00000028' AND provider_name='manual';
```

`provider_name='manual'` (or any sentinel value) is the rollback handle. Always use a synthesized `provider_transaction_id` per row to satisfy the unique constraint `(provider_name, provider_transaction_id)`.

## Branch convention

The user's main checkout at `/Users/chappy/Downloads/old/chappy2/coding/backup/dwilar/lita-ehousing` is the `tobias` branch. When the user says "use tobias branch" they mean: apply edits in that checkout, not in a fresh `claude/<adjective-noun>` worktree. There are 60+ Claude worktrees under `.claude/worktrees/` — none of them are where the user's dev environment is running.

## Quick checklist (what "good" looks like)

- [ ] `lsof -iTCP:5432 -sTCP:LISTEN` shows `cloud-sql-proxy` listening
- [ ] `psql` connects and `SELECT count(*) FROM applications` returns ≥ 1
- [ ] `backend/.env` has `APP_ENV=local` + `POSTGRES_*` vars
- [ ] `backend/.venv` is Python 3.10+ and has `requirements.txt` installed
- [ ] uvicorn launched with `APP_ENV=local DATABASE_URL=sqlite:...` overrides + shell-env unset
- [ ] `curl http://127.0.0.1:8000/api/v1/applications` returns real rows including Tobias
- [ ] `.claude/launch.json` Frontend env has `BACKEND_API_URL=http://localhost:8000`
- [ ] `/api/applications` (proxied through Next.js) returns the same real rows, not dummy demo data
