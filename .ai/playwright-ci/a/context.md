# Playwright CI Fix — Implementation Context

## Task Description

Fix 4 Playwright E2E tests so they pass in CI (GitHub Actions) on PR #102 of `Dwilar/lita-ehousing`.

**Root cause**: Auth0 blocks GitHub Actions IP ranges. The browser navigates to `http://localhost:3000/` which redirects to Auth0's `/authorize`, which redirects to `/u\/login` — but that last step never completes in CI. `loginToApplicantsPortal()` in `login-page.ts` calls `getPage().waitForURL(/\/u\/login/, { timeout: 30000 })` which times out.

**Fix**: When `process.env.CI === 'true'`, bypass Auth0 entirely by injecting fake session cookies directly into the Playwright browser context, setting up `page.route()` mocks for all backend API calls, and navigating directly to `/applicants`.

---

## Already Fixed (commits on this branch)

```
fdf21bd  fix(ci): use localhost instead of 127.0.0.1 for AUTH0_BASE_URL in PR workflow
2d46eac  fix(tests): fix Auth0 domain regex and mock draft POST in CI
022832c  ci: deploy Allure reports to per-run folders and preserve history
```

The `AUTH0_BASE_URL` is now `http://localhost:3000` in `.github/workflows/pr.yml`. The `application-dev-tests.spec.ts` already mocks its own API routes (draft POST, OTP, verify-passcode, provision-account, applications POST) and works. **The E2E job still fails** because `login-dev-tests.spec.ts` and `applicants-dev-tests.spec.ts` call `loginToApplicantsPortal()` which still tries to reach Auth0.

---

## What Still Fails

**`login-dev-tests.spec.ts`** — 1 test:
- `[Applicants][DEV][E2E][Regression] Login and open contact information`
- Fails at: `getPage().waitForURL(/\/u\/login/, { timeout: 30000 })`

**`applicants-dev-tests.spec.ts`** — 2 tests:
- `[Applicants][DEV][E2E][Regression] Login`
- `[Applicants][DEV][E2E][Regression] Archive applicant`
- Both fail at the same `waitForURL` in `loginToApplicantsPortal()`

All 3 call `loginToApplicantsPortal()` from `login-page.ts`. The fix must go in that function.

---

## Relevant Files

### `frontend/eHousing_Web/tests/pages/applicants-pages/login-page.ts`
**THIS IS THE ONLY FILE THAT NEEDS EDITING.**

Key function to modify (lines 40–73):
```typescript
export async function loginToApplicantsPortal(email: string, password: string) {
  await getPage().waitForURL(/\/u\/login/, { timeout: 30000 })  // <-- FAILS IN CI
  // ... Auth0 form interaction ...
  await waitForPostLoginState()
}
```

The fix: add a CI branch at the top of `loginToApplicantsPortal()` that returns early after injecting session and navigating.

`waitForPostLoginState()` is already defined (lines 89–117) — it checks for `Applicants Overview` heading, `Ayaka Inoue` text, or `/applicants` in the URL. The CI bypass must satisfy this check.

### `frontend/eHousing_Web/tests/testcases/login-dev-tests.spec.ts`
```typescript
// line 11: calls loginToApplicantsPortal('sotheby@joinlita.com', 'Sotheby123?')
// line 14: navigates to dashboard?id=16 via navigateToApplicantsDashboardPage()
// line 15: verifyApplicantsDashboardPageURL()
// line 16: openContactInformationSection()
```
The dashboard navigation (line 14) does a direct `gotoURL('http://localhost:3000/dashboard?id=16')` — no additional mocking needed for that page (it may fail if it also fetches applicant data, but the test will proceed past the login step).

### `frontend/eHousing_Web/tests/testcases/applicants-dev-tests.spec.ts`
```typescript
// test 1 (line 41): login → openAyakaInoueApplicantFromAuth0Landing() → openApplicantsOverviewHeading()
// test 2 (line 53): login → openAnyApplicantProfile() → archiveApplicantFromProfileHeader()
```
The archive test navigates to a profile (clicks a row), then clicks "Archive Applicant". The archive action calls `POST /api/v1/applications/{id}/archive`. The profile navigation goes to `/dashboard?id={numericId}`.

### `frontend/app/applicants/page.tsx` (lines 713–780, 869–960)
Two API calls happen at load time:

1. **`GET /api/applications`** (line 737) — the primary applicant list.
   - Called inside `loadApplicants()` when `isReviewer && token` are truthy.
   - `isReviewer` = `isReviewerRole(user?.role)` — requires role `"admin"` or `"realtor"`.
   - The auth token is read from React state (`token`) which comes from `AuthProvider`.
   - The `AuthProvider` (`frontend/lib/auth.tsx`) reads `localStorage.accessToken` and `localStorage.authUser` on mount.
   - Response shape: `BackendApplication[]` — see sample data below.

2. **EventSource `${backendApiUrl}/api/v1/applications/stream`** (line 905) — SSE stream.
   - Only opened when `isReviewer && token` are truthy.
   - `backendApiUrl` = `NEXT_PUBLIC_BACKEND_API_URL` env var (set to real backend in CI).
   - This will fail to connect but errors are caught and it schedules reconnect every 5s.
   - Also a 30-second polling fallback runs `loadApplicants()` every 30s.
   - The SSE stream URL is a direct fetch to the backend, NOT through the Next.js proxy, so `page.route('**/api/v1/applications/stream', ...)` will NOT intercept it.
   - This is acceptable — the stream failing just means no realtime updates, the list is still loaded from `/api/applications`.

### `frontend/app/api/applications/route.ts` (GET handler, line 68–81)
```typescript
export async function GET(_request: NextRequest) {
  const headerList = new Headers(await nextHeaders())
  const applications = await fetchApplicationsFromBackend({
    headerList,
    authToken: extractAuthToken(headerList),
    allowAnonymous: true,  // <-- does NOT require auth token
  })
  return NextResponse.json(applications.filter(shouldIncludeApplication))
}
```
`allowAnonymous: true` means this endpoint does NOT reject a fake token — it tries to reach the backend. Since the backend will be unavailable (returns network error or 401 for `ci_test_token`), the route returns 502. **This must be mocked by `page.route('**/api/applications', ...)`.**

### `frontend/app/api/applications/common.ts` (extractAuthToken, line 344–372)
Reads the `auth` cookie from the `cookie` header, OR the `Authorization: Bearer` header. For server-side fetches, the cookie is forwarded automatically by Next.js.

### `frontend/lib/auth.tsx` (AuthProvider, lines 77–120)
```typescript
const storedToken = localStorage.getItem('accessToken')   // key: 'accessToken'
const storedUserRaw = localStorage.getItem('authUser')    // key: 'authUser'
```
If `storedToken` is set, it calls `persistSession(storedToken, storedUser)` which sets `isAuthenticated = true`, `token = storedToken`, `user = storedUser`. This is the client-side auth state.

The `auth` cookie is also set by `persistSession`:
```typescript
document.cookie = `${AUTH_COOKIE_NAME}=${accessToken}; path=/; max-age=3600;`
```

### `frontend/lib/auth-constants.ts`
```typescript
export const AUTH_COOKIE_NAME = "auth"
export const AUTH_TOKEN_TTL_SECONDS = 60 * 60
export const AUTH0_SESSION_COOKIE_NAME = "auth0_session"
export const AUTH0_STATE_COOKIE_NAME = "auth0_oauth_state"
```

### `frontend/lib/roles.ts`
```typescript
export function isReviewerRole(role?: string | null): boolean {
  const normalized = normalizeRole(role)
  return normalized === "admin" || normalized === "realtor"
}
```
The fake user MUST have `role: "admin"` or `role: "realtor"` for the applicants list to load.

### `frontend/middleware.ts`
Does NOT protect `/applicants`. Only redirects `/login` to Auth0. No server-side auth check on the applicants route.

### `.github/workflows/pr.yml` (e2e job, lines 117–160)
```yaml
env:
  NEXT_PUBLIC_BACKEND_API_URL: ${{ secrets.NEXT_PUBLIC_BACKEND_API_URL }}
  AUTH0_DOMAIN: ${{ secrets.AUTH0_DOMAIN }}
  AUTH0_CLIENT_ID: ${{ secrets.AUTH0_CLIENT_ID }}
  AUTH0_CLIENT_SECRET: ${{ secrets.AUTH0_CLIENT_SECRET }}
  AUTH0_SECRET: ${{ secrets.AUTH0_SECRET }}
  AUTH0_BASE_URL: "http://localhost:3000"
  AUTH0_ISSUER_BASE_URL: ${{ secrets.AUTH0_ISSUER_BASE_URL }}
  CF_CLIENT_ID: ${{ secrets.CF_CLIENT_ID }}
  CF_CLIENT_SECRET: ${{ secrets.CF_CLIENT_SECRET }}
  CI: "true"
```
`CI=true` is the flag to check. `process.env.CI` is available in Node.js/Playwright test runner.

### `frontend/playwright.config.ts` (lines 13–16, 38–40)
```typescript
const BASE_URL = process.env.URL || process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000'
const startLocalHost = BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1')
// ...
retries: process.env.CI ? 3 : 1,
workers: process.env.CI ? 1 : 5,
```
No `PLAYWRIGHT_BASE_URL` set in CI → base URL is `http://127.0.0.1:3000`. But `login-page.ts` hardcodes `http://localhost:3000/` in `applicantsAuth0LoginURL` and `fallbackToLocalDevLogin`. Both `localhost` and `127.0.0.1` resolve to the same server in CI.

---

## Session Cookie Format

### `auth` cookie
- Name: `auth`
- Value: raw token string, e.g. `ci_test_token`
- Domain: `localhost`
- Path: `/`

### `auth0_session` cookie
- Name: `auth0_session`
- Value: `Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')`
  where payload is:
  ```typescript
  {
    token: "ci_test_token",
    user: {
      id: 1,
      username: "sotheby",
      email: "sotheby@joinlita.com",
      role: "admin",           // MUST be "admin" or "realtor" for isReviewerRole() to return true
      applicationId: null
    }
  }
  ```
- Domain: `localhost`
- Path: `/`

The `handleMe` route (`GET /api/auth/auth0/me`) decodes this cookie and returns its contents. The `AuthProvider` does NOT call `/api/auth/auth0/me` — it reads from `localStorage` only.

---

## API Calls to Mock

### REQUIRED: `GET /api/applications`

Pattern: `**/api/applications`

This is the main applicant list. Returns `BackendApplication[]`. The page calls this at load when `isReviewer && token`.

**Expected response** (status 200, `application/json`):
```json
[
  {
    "id": 16,
    "identifier": "16",
    "email": "ayaka.inoue@example.com",
    "phone": "+81 90 1234 5678",
    "full_name": "Ayaka Inoue",
    "country": "Japan",
    "property_type": "Apartment",
    "budget_range": "500000-750000",
    "savings": "150000",
    "income": "85000",
    "income_currency": "USD",
    "employment_status": "employed",
    "purchase_intent": "primary_residence",
    "financing_consent": "yes",
    "agree_policy": true,
    "receive_updates": false,
    "created_at": "2026-04-15T10:30:00Z",
    "review_status": "in_review",
    "archived": false,
    "credit_score": 696,
    "connected_accounts": {
      "personal": [
        {
          "id": "acct_ayaka_001",
          "name": "Ayaka Personal Checking",
          "currentBalance": 45000
        }
      ],
      "business": [],
      "investments": []
    },
    "metadata": {
      "residence_permit_number": "JP-2024-0042"
    },
    "date_of_birth": "1990-03-15"
  }
]
```

The locator in `login-page.ts` line 28 is:
```typescript
const ayakaInoueApplicantButton = () =>
  getLocatorByRole('button', { name: 'Ayaka Inoue — 696 Pending Apr' })
```
This is a partial match. The applicant row has `role="button"` (TableRow). The text rendered will be `"Ayaka Inoue"` in the name cell, `"696"` credit score, and submitted date. The locator name pattern `'Ayaka Inoue — 696 Pending Apr'` suggests a button with combined text. The actual row renders separate cells, so Playwright's `getByRole('button', { name: ... })` uses accessible name combining all cell text. Ensure the mock data has `credit_score: 696` and `created_at` with `Apr` in the formatted date.

`formatSubmitted("2026-04-15T10:30:00Z")` produces `"Apr 15, 2026, 10:30 AM"` — the "Apr" prefix matches.

The `shouldIncludeApplication` filter (in route.ts) passes only entries with an `@` in email — the mock data satisfies this.

### REQUIRED: `GET **/api/applications` (also matches the Next.js route)

Note: The applicants page calls `/api/applications` (relative URL, resolved to `http://localhost:3000/api/applications`). The pattern `**/api/applications` will match this.

### OPTIONAL but recommended: `POST **/api/v1/applications/*/archive`

Pattern: `**/api/v1/applications/*/archive`

Called by `archiveApplicantFromProfileHeader()` in the archive test. The page calls `POST /api/v1/applications/{id}/archive`. This is NOT through the Next.js proxy — it IS through the Next.js proxy at `POST /api/v1/applications/{id}/archive`.

Wait — looking at `applicants/page.tsx` line 1238:
```typescript
const response = await fetch(
  `/api/v1/applications/${encodeURIComponent(archiveTargetId)}/archive`,
  { method: "POST", ... }
)
```
This is a relative URL → `http://localhost:3000/api/v1/applications/{id}/archive`. Check if there's a Next.js route handler for this. The glob shows `frontend/app/api/applications/[id]/archive/route.ts` exists. So this IS through Next.js, and the Next.js route proxies to the backend. Mock pattern: `**/api/v1/applications/*/archive` will match the backend proxy target OR use `http://localhost:3000/api/v1/applications/*/archive`.

Actually the fetch is to `/api/v1/applications/...` — check if this is a Next.js API route. Given the file structure `frontend/app/api/applications/[id]/archive/route.ts`, the Next.js path would be `/api/applications/{id}/archive` NOT `/api/v1/applications/{id}/archive`. The `v1` means this is the backend URL directly.

Re-reading the page code: the fetch is `fetch('/api/v1/applications/${id}/archive', ...)`. There is no `frontend/app/api/v1/` directory based on the glob. So this goes to the backend directly? No — Next.js would 404 on this path.

Check the Next.js route handlers: `frontend/app/api/applications/[id]/archive/route.ts` → Next.js path `/api/applications/{id}/archive`. But the page calls `/api/v1/applications/{id}/archive`. This is likely a mismatch OR there's a rewrite.

For the archive test in CI, the mock should intercept: `**/api/v1/applications/*/archive` — this will match regardless.

### OPTIONAL: `GET **/api/v1/applications/*` (individual applicant)

Called by `loadSingleApplicant()` when an SSE event arrives. Not critical for the basic login/overview tests.

---

## Application Flow API Calls (employment → connect-accounts)

The `application-dev-tests.spec.ts` already mocks all its own routes directly in the test body (lines 16–63):
- `**/api/applications/draft` (GET → 404, POST → 200)
- `**/api/v1/applications/otp` (→ 200 `{ status: 'sent' }`)
- `**/api/v1/applications/verify-passcode` (→ 200 `{ verified: true }`)
- `**/api/applications/provision-account` (→ 200 `{ success: true }`)
- `**/api/v1/applications` POST (→ 201 `{ id: 'app_123' }`)

No additional mocking is needed for this test. The `completeEmploymentStep()` does not make any API calls — it just fills out the country selector form and clicks Next. The transition to `connect-accounts` is client-side routing.

---

## CI Environment Variables

Set in `.github/workflows/pr.yml` e2e job:
```
CI=true
AUTH0_BASE_URL=http://localhost:3000
NEXT_PUBLIC_BACKEND_API_URL=<from secret>
AUTH0_DOMAIN=<from secret>
AUTH0_CLIENT_ID=<from secret>
AUTH0_CLIENT_SECRET=<from secret>
AUTH0_SECRET=<from secret>
AUTH0_ISSUER_BASE_URL=<from secret>
CF_CLIENT_ID=<from secret>
CF_CLIENT_SECRET=<from secret>
```

`process.env.CI === 'true'` (string `"true"`, not boolean) — check with `process.env.CI === 'true'` or `!!process.env.CI`.

---

## Implementation Approach

Edit only `frontend/eHousing_Web/tests/pages/applicants-pages/login-page.ts`.

Add a CI bypass block at the top of `loginToApplicantsPortal()`, before the existing `waitForURL` call:

```typescript
export async function loginToApplicantsPortal(email: string, password: string) {
  if (process.env.CI === 'true') {
    await ciBypassLogin()
    return
  }

  await getPage().waitForURL(/\/u\/login/, { timeout: 30000 })
  // ... rest of existing code unchanged ...
}

async function ciBypassLogin() {
  const token = 'ci_test_token'
  const user = {
    id: 1,
    username: 'sotheby',
    email: 'sotheby@joinlita.com',
    role: 'admin',
    applicationId: null,
  }

  const auth0SessionPayload = Buffer.from(
    JSON.stringify({ token, user }),
    'utf8'
  ).toString('base64url')

  // Step 1: inject cookies BEFORE navigation
  await getPage().context().addCookies([
    {
      name: 'auth',
      value: token,
      domain: 'localhost',
      path: '/',
    },
    {
      name: 'auth0_session',
      value: auth0SessionPayload,
      domain: 'localhost',
      path: '/',
    },
  ])

  // Step 2: set up route mocks BEFORE navigation
  await getPage().route('**/api/applications', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 16,
            identifier: '16',
            email: 'ayaka.inoue@example.com',
            phone: '+81 90 1234 5678',
            full_name: 'Ayaka Inoue',
            country: 'Japan',
            property_type: 'Apartment',
            budget_range: '500000-750000',
            savings: '150000',
            income: '85000',
            income_currency: 'USD',
            employment_status: 'employed',
            purchase_intent: 'primary_residence',
            financing_consent: 'yes',
            agree_policy: true,
            receive_updates: false,
            created_at: '2026-04-15T10:30:00Z',
            review_status: 'in_review',
            archived: false,
            credit_score: 696,
            connected_accounts: {
              personal: [{ id: 'acct_001', name: 'Ayaka Personal Checking', currentBalance: 45000 }],
              business: [],
              investments: [],
            },
            metadata: { residence_permit_number: 'JP-2024-0042' },
            date_of_birth: '1990-03-15',
          },
        ]),
      })
    } else {
      await route.fallback()
    }
  })

  await getPage().route('**/api/v1/applications/*/archive', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  })

  await getPage().route('**/api/v1/applications/*/status', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  })

  await getPage().route('**/api/v1/applications/*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 16,
          identifier: '16',
          email: 'ayaka.inoue@example.com',
          full_name: 'Ayaka Inoue',
          country: 'Japan',
          credit_score: 696,
          connected_accounts: {
            personal: [{ id: 'acct_001', name: 'Ayaka Personal Checking', currentBalance: 45000 }],
            business: [],
            investments: [],
          },
          created_at: '2026-04-15T10:30:00Z',
          review_status: 'in_review',
          archived: false,
          metadata: { residence_permit_number: 'JP-2024-0042' },
        }),
      })
    } else {
      await route.fallback()
    }
  })

  // Step 3: set localStorage so AuthProvider hydrates with correct user
  await getPage().goto('about:blank')
  await getPage().evaluate(({ t, u }) => {
    localStorage.setItem('accessToken', t)
    localStorage.setItem('authUser', JSON.stringify(u))
  }, { t: token, u: user })

  // Step 4: navigate directly to /applicants
  await getPage().goto('http://localhost:3000/applicants')

  // Step 5: wait for post-login state
  await waitForPostLoginState()
}
```

**Important ordering rules**:
- `addCookies` must be called before `goto` so cookies are present on the first request.
- `page.route()` mocks must be registered before `goto` so they intercept the page load fetch.
- `goto('about:blank')` is used to run `evaluate` before navigating to the real app (so localStorage is set on the right origin... actually `about:blank` has a different origin). Better approach: navigate to the app first (it will try to redirect to login), then set cookies+mocks. OR: set cookies first (no nav needed), then call goto.

**Revised ordering** (cookies are not origin-restricted for `addCookies`):
1. `addCookies` (domain: 'localhost')
2. `page.route()` mock registrations
3. Navigate to `http://localhost:3000/applicants` — the `AuthProvider` will try to read `localStorage` but it's empty, so it falls back to no token → redirects to `/login`. **Problem**: the middleware redirects `/login` to Auth0 login, which fails in CI.

**The real fix**: The `AuthProvider` reads from `localStorage`. If `localStorage.accessToken` is not set, it sets `isInitialized = true` with no token, and the `/applicants` page effect redirects to `/login`. The cookie alone is not enough — `localStorage` must also be populated.

To set `localStorage` before the app initializes, use `page.addInitScript()`:

```typescript
await getPage().addInitScript(({ t, u }: { t: string; u: object }) => {
  localStorage.setItem('accessToken', t)
  localStorage.setItem('authUser', JSON.stringify(u))
}, { t: token, u: user })
```

`addInitScript` runs before any page scripts execute, so the `AuthProvider` will find the token in `localStorage` on mount.

**Final ordering**:
1. `page.addInitScript()` — set localStorage before page scripts run
2. `page.context().addCookies()` — inject auth and auth0_session cookies
3. `page.route()` mocks for `/api/applications` (GET), `/api/v1/applications/*/archive`, `/api/v1/applications/*/status`, `/api/v1/applications/*` (GET)
4. `page.goto('http://localhost:3000/applicants')` — direct navigation
5. `waitForPostLoginState()` — confirm page loaded

---

## TypeScript Validation

From the `frontend` directory:
```bash
cd frontend && npx tsc --noEmit --project tsconfig.json
```

Or if the tsconfig doesn't cover test files directly:
```bash
cd frontend && npx tsc --noEmit --project eHousing_Web/tsconfig.json
```

Check `frontend/tsconfig.json` for the include paths. The test files use path aliases like `@/eHousing_Common/...` defined in `tsconfig.json`.

`Buffer` is available in the Node.js test environment (Playwright runs in Node). No import needed.

`getPage()` is imported from `@/eHousing_Common/src/ehousing-playwright/utils/page-utils`. Check that `page.addInitScript` is on the `Page` type — it is standard Playwright API.

---

## Server-Side Auth Checks

- `frontend/middleware.ts` — does NOT check auth on `/applicants`. Only redirects `/login`.
- `frontend/app/api/applications/route.ts` GET — `allowAnonymous: true`, no auth rejection. Will fail with network error to backend, returning 502. **Must be mocked**.
- `frontend/app/applicants/page.tsx` — checks `isReviewer` (client-side, from `useAuth()`) and `token !== null` before fetching. Both must be truthy for the list to load. The fake user with `role: "admin"` satisfies `isReviewer`.
- `frontend/app/applicants/page.tsx` line 845: `if (token === null) { router.push('/login'); return }` — if `AuthProvider` doesn't hydrate from localStorage, this fires. `addInitScript` prevents this.

---

## Quick Reference: Files and Line Numbers

| File | What's there |
|------|-------------|
| `frontend/eHousing_Web/tests/pages/applicants-pages/login-page.ts:40` | `loginToApplicantsPortal()` — add CI branch here |
| `frontend/eHousing_Web/tests/pages/applicants-pages/login-page.ts:89` | `waitForPostLoginState()` — already correct, reuse in bypass |
| `frontend/lib/auth-constants.ts:1–4` | Cookie name constants |
| `frontend/lib/auth.tsx:83` | `localStorage.getItem('accessToken')` |
| `frontend/lib/auth.tsx:84` | `localStorage.getItem('authUser')` |
| `frontend/lib/roles.ts:9` | `isReviewerRole()` — requires "admin" or "realtor" |
| `frontend/app/applicants/page.tsx:737` | `fetch('/api/applications', ...)` — must be mocked |
| `frontend/app/applicants/page.tsx:845` | `if (token === null) router.push('/login')` — blocked by localStorage init |
| `frontend/app/applicants/page.tsx:905` | `new EventSource(...)` — backend SSE, not mockable via page.route |
| `.github/workflows/pr.yml:153` | `CI: "true"` |
| `frontend/playwright.config.ts:14` | base URL = `http://127.0.0.1:3000` |
