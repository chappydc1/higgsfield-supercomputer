# Playwright CI Fix — Implementation Plan

## Task
Fix Playwright E2E tests to pass in CI by adding Auth0 bypass in login-page.ts.

## Approach
When process.env.CI === 'true', call ciBypassLogin() instead of the Auth0 browser flow. ciBypassLogin() uses page.addInitScript() to set localStorage, injects session cookies, registers route mocks, then navigates directly to /applicants.

## Files to Modify
- `frontend/eHousing_Web/tests/pages/applicants-pages/login-page.ts`

## Files to Create
None.

## Implementation Steps

### Phase 1: CI bypass in login-page.ts

#### Step 1 — Add CI branch at the top of `loginToApplicantsPortal()` (line 41)

Insert immediately after line 40 (`export async function loginToApplicantsPortal(email: string, password: string) {`), before the existing `await getPage().waitForURL(...)`:

```typescript
  if (process.env.CI === 'true') {
    await ciBypassLogin()
    return
  }
```

The resulting function opening will be:
```typescript
export async function loginToApplicantsPortal(email: string, password: string) {
  if (process.env.CI === 'true') {
    await ciBypassLogin()
    return
  }
  await getPage().waitForURL(/\/u\/login/, { timeout: 30000 })
  // ... rest unchanged
```

#### Step 2 — Add `ciBypassLogin()` function

Insert the new function after line 73 (the closing `}` of `loginToApplicantsPortal`), before line 75 (`export async function openAyakaInoueApplicantFromAuth0Landing()`).

The surrounding context at insertion point:
```
73:  }           // ← closing brace of loginToApplicantsPortal
74:              // ← blank line
75: export async function openAyakaInoueApplicantFromAuth0Landing() {
```

Insert between lines 73 and 75:

```typescript
async function ciBypassLogin() {
  const token = 'ci_test_token'
  const user = {
    id: 1,
    username: 'sotheby',
    email: 'sotheby@joinlita.com',
    role: 'admin',
    applicationId: null,
  }

  // Step A: set localStorage BEFORE page scripts run so AuthProvider hydrates on mount
  await getPage().addInitScript(
    ({ t, u }: { t: string; u: object }) => {
      localStorage.setItem('accessToken', t)
      localStorage.setItem('authUser', JSON.stringify(u))
    },
    { t: token, u: user }
  )

  // Step B: inject auth cookies so Next.js API routes receive them
  const auth0SessionPayload = Buffer.from(
    JSON.stringify({ token, user }),
    'utf8'
  ).toString('base64url')

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

  // Step C: register route mocks BEFORE navigation
  // Most-specific patterns first so Playwright matches them before the broad wildcard.

  // Archive action: POST /api/v1/applications/{id}/archive
  await getPage().route('**/api/v1/applications/*/archive', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    })
  })

  // Status update: POST /api/v1/applications/{id}/status
  await getPage().route('**/api/v1/applications/*/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    })
  })

  // Individual applicant GET: /api/v1/applications/{id}
  await getPage().route('**/api/v1/applications/*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
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
            personal: [{ id: 'acct_ayaka_001', name: 'Ayaka Personal Checking', currentBalance: 45000 }],
            business: [],
            investments: [],
          },
          metadata: { residence_permit_number: 'JP-2024-0042' },
          date_of_birth: '1990-03-15',
        }),
      })
    } else {
      await route.fallback()
    }
  })

  // Applicant list: GET /api/applications (Next.js proxy route)
  // MUST be mocked — the backend returns 401/502 for ci_test_token.
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
              personal: [{ id: 'acct_ayaka_001', name: 'Ayaka Personal Checking', currentBalance: 45000 }],
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

  // Step D: navigate directly to /applicants — addInitScript fires before React mounts
  await getPage().goto('http://localhost:3000/applicants')

  // Step E: confirm post-login state
  await waitForPostLoginState()
}
```

#### Step 3 — No changes to `waitForPostLoginState()`

`waitForPostLoginState()` (lines 89–117) already accepts the CI scenario:
- checks `hasApplicantsOverview` (`/Applicants Overview/i`)
- checks `hasAyakaApplicantRow` (`/Ayaka Inoue/i`)
- checks `isApplicantsRoute` (`/\/applicants/i.test(pathname)`)

The mock data + navigation to `/applicants` will satisfy at least the third condition immediately, and both the first and second once the page renders.

#### Step 4 — dashboard-page.ts: no changes needed

`dashboard-page.ts` line 15: `const applicantsDashboardURL = 'http://localhost:3000/dashboard?id=16'`

`navigateToApplicantsDashboardPage()` does a direct `gotoURL` after login is already complete. The dashboard page may make its own API fetch for id=16, but:
- The `**/api/v1/applications/*` mock registered in `ciBypassLogin()` remains active for the page lifetime (Playwright route mocks persist until `page.unroute()` or page close).
- `verifyApplicantsDashboardPageURL()` only checks the URL pattern.
- `openContactInformationSection()` checks for a DOM element; if the dashboard page renders with the mocked data, this will be present.

No additional mocking is required in `login-page.ts` for the dashboard flow.

### Critical ordering rationale

| Order | Call | Why |
|-------|------|-----|
| 1 | `page.addInitScript()` | Runs before React/AuthProvider mounts; sets `localStorage.accessToken` + `localStorage.authUser` so `AuthProvider` hydrates with `isAuthenticated=true`, `token='ci_test_token'`, `user={role:'admin'}`. Without this, the app sees no token on mount and immediately `router.push('/login')`. |
| 2 | `page.context().addCookies()` | Cookies are sent with the first navigation request; the Next.js `GET /api/applications` handler reads the `auth` cookie via `extractAuthToken`. Must be set before `goto`. |
| 3 | `page.route()` mocks | Intercept fetch calls the page makes during load. Must be registered before `goto`. |
| 4 | `page.goto('http://localhost:3000/applicants')` | Direct navigation; no Auth0 redirect occurs because `middleware.ts` does not protect `/applicants`. |
| 5 | `waitForPostLoginState()` | Confirms the page rendered correctly with applicant data visible. |

### Route mock patterns and return shapes

| Pattern | Method | Status | Body |
|---------|--------|--------|------|
| `**/api/v1/applications/*/archive` | POST | 200 | `{ success: true }` |
| `**/api/v1/applications/*/status` | POST | 200 | `{ success: true }` |
| `**/api/v1/applications/*` | GET | 200 | Full Ayaka Inoue `BackendApplication` object |
| `**/api/applications` | GET | 200 | Array of one Ayaka Inoue `BackendApplication` |

The `**/api/v1/applications/*` wildcard is registered AFTER the more-specific `/archive` and `/status` patterns so Playwright evaluates specifics first (FIFO route matching).

## Build Verification
```bash
cd frontend && npx tsc --noEmit
```
Expected: no TypeScript errors.

Key type-safety notes:
- `Buffer` is a Node.js global — no import needed.
- `page.addInitScript(fn, arg)` is typed as `addInitScript(script: Function | { path?: string; content?: string }, arg?: Serializable)` — the inline function + object arg form is valid Playwright API.
- The `{ t, u }: { t: string; u: object }` destructure in the init script is evaluated inside the browser context (not type-checked by tsc), but the outer call is typed correctly.
- `page.context().addCookies([...])` accepts `Cookie[]` with `name`, `value`, `domain`, `path` — all provided.

## Status
Phases: 1
- [x] Phase 1: CI bypass implementation
- [x] Build verification
- [x] Code review

Assessed: yes
