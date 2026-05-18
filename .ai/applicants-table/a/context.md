# applicants-table — Context Investigation

## TL;DR — why are there so many?

The postgres database is **shared between two completely different services** that each picked their own naming convention, plus this codebase's main FastAPI backend bundles **three separate domain concepts** that all happen to use the word "applicant":

1. **Housing applications** (`applications`) — the *consumer onboarding* flow. Live, 4 rows. **THIS is what `/applicants` and `/dashboard` show.**
2. **Customer-API applicants** (`applicants`, `customer_applicants`) — a B2B *partner integration* model where one "customer" (partner) has many "applicants". Empty, scaffolded for future product.
3. **Phone applications** (`phone_applications`) — a *phone-only quick signup* path. Empty, scaffolded.
4. **Prisma microservice schema** (`Applicant`, `ApplicantApplication`, + 27 other PascalCase tables) — owned by `services/us-api/`, a separate Prisma-managed microservice that shares this database. All 29 tables empty.
5. **Drafts** (`application_drafts`) — in-progress submissions before final submit. Just created by PR #145. Empty.

That's **6 tables by 4 names** for **4 separate concepts**, plus 29 Prisma-microservice scaffolding tables. Total 35 tables containing "applic"-shaped data, of which only `applications` is actually written to in production today.

## Per-table inventory

### Tables this FastAPI backend uses

| Table | Owner | Rows | Used by | Verdict |
|---|---|---|---|---|
| `applications` | postgres | **4** | Housing submission flow. **Powers the `/applicants` dashboard via `GET /api/v1/applications`.** | **KEEP — source of truth** |
| `application_drafts` | lita-ehousing | 0 | In-progress drafts. PR #145 created this for the postgres migration. Has FastAPI repository + endpoints. | **KEEP — supports drafts feature** |
| `applicants` | postgres | 0 | `ApplicantModel` in `infra/mysql/models.py:346`. Used by `services/applicant_service.py::ApplicantService.list_applicants(customer_id)`. Part of the customer-API path. **Not invoked by any code that the housing UI hits.** | **DROP candidate** — but check if customer-API endpoints expose it |
| `customer_applicants` | postgres | 0 | `CustomerApplicantModel` at `models.py:324`. Maps customer↔applicant↔application. FK to `applications`. Used by the same customer-API code path as `applicants`. | **DROP candidate** — customer API path |
| `phone_applications` | postgres | 0 | `PhoneApplicationModel`. Has `list_phone_applications` endpoint at `http_endpoints.py:1701`. The phone-only quick-submit flow. | **DROP candidate** — phone signup unused |

### Tables the separate `services/us-api/` Prisma microservice owns

29 PascalCase tables (all empty): `Applicant`, `ApplicantApplication`, `AccessLog`, `AccountBalance`, `Connection`, `Consent`, `ConsentLog`, `Decision`, `EvidenceSnapshot`, `FeatureDriftBaseline`, `FeatureDriftReport`, `FeatureSchemaVersion`, `FinancialAccount`, `FinancialTransaction`, `IdentityProfile`, `IncomeEvent`, `ModelArtifact`, `ModelDeployment`, `ModelPerformanceSnapshot`, `ProviderConnection`, `RawProviderPayload`, `RefreshEvent`, `RetrainTrigger`, `RiskSignal`, `Token`, `UnderwritingDecision`, `UnderwritingFeature`, `WebhookDelivery`, `WebhookEndpoint`.

These are scaffolded by `services/us-api/prisma/schema.prisma`. The us-api service is a parallel implementation that hasn't gone live yet. **DO NOT drop without explicit cross-team coordination** — they're empty today but the us-api team may be actively developing against them in lower environments.

## Dashboard / `/applicants` read path (current, working)

```
frontend/app/applicants/page.tsx (the visible dashboard page)
   ↓ fetch("/api/applicants")
frontend/app/api/applicants/route.ts (Next.js proxy)
   ↓ GET ${BACKEND}/api/v1/applications
backend/src/interface/http_endpoints.py:2367 (list_housing_applications_endpoint)
   ↓ SQLAlchemyHousingApplicationRepository.list_recent
postgres.applications (the LIVE table, 4 rows)
```

So the `/applicants` page **already reads from the right place** — the `applications` table. The path naming is misleading (it says "applicants" but the underlying table is "applications") but the data flow is correct.

## What "consolidation" would actually do

**Option A — Drop the 3 unused snake_case tables** (`applicants`, `customer_applicants`, `phone_applications`):
- Removes 36 + 7 + 4 = 47 dead columns from the schema.
- Removes 4 Pydantic schemas, 1 service file, 1 repository, 2-3 dead endpoints from the codebase.
- Zero data loss (all 3 tables empty).
- **Risk**: If the customer-API or phone-signup feature is still on the product roadmap, this is premature removal. The team may want them as scaffolds.

**Option B — Drop the 29 PascalCase Prisma tables** (us-api scaffolding):
- **NOT recommended** without coordination with whoever owns `services/us-api/`. Even if empty today, they're part of an in-development microservice.

**Option C — Just rename `applications` → `applicants`** so the dashboard URL matches the table name:
- Confusing because it would COLLIDE with the existing snake_case `applicants` table. Would need to drop that one first (Option A's first step).
- Would require updating every `HousingApplicationModel.__tablename__`, every migration file, every test that uses raw SQL. Big blast radius for a cosmetic gain.

**Option D — Status quo + better documentation**:
- Leave the schema alone. Add a `docs/db-schema.md` explaining what each table is for so the next person doesn't have to do this investigation.
- Zero risk, zero change.

## Recommendation

**Do A (with caveats) + D**:
1. Confirm with the product team that the customer-API and phone-signup features are NOT on the near-term roadmap. If they ARE, leave the tables alone.
2. If they're truly dead: drop `applicants`, `customer_applicants`, `phone_applications` from postgres (and their corresponding SQLAlchemy models, repositories, endpoints, and tests).
3. Add `docs/db-schema.md` documenting the remaining tables and what each is for.
4. Do NOT touch the 29 PascalCase tables — coordinate with the us-api team first.

The user's `/applicants` page already works against the `applications` table. The "make one that makes sense with /applicants and /dashboard" goal is **already met** at the data-flow level — the cleanup is just removing the noise around it.

## DeploymentSafety: NEEDS-CONFIRMATION
Production DDL (DROP TABLE) requires explicit user OK. Lead has paused the pipeline before any destructive action.
