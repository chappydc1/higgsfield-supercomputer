# Application Form Frontend Context

## Routes

| File Path | URL Path | Purpose |
|-----------|----------|---------|
| `frontend/app/application/page.tsx` | `/application` | Gate page (choose sign-up vs login) |
| `frontend/app/application/signup/page.tsx` | `/application/signup` | Step 1 — Personal info (name, email, phone, DOB, country) |
| `frontend/app/application/passcode/page.tsx` | `/application/passcode` | OTP verification for signup |
| `frontend/app/application/login-verify/page.tsx` | `/application/login-verify` | Login + OTP verification for resume flow |
| `frontend/app/application/employment/page.tsx` | `/application/employment` | Step 2 — Employment & citizenship |
| `frontend/app/application/connect-accounts/page.tsx` | `/application/connect-accounts` | Step 3 — Bank account connection (Plaid/SaltEdge router) |
| `frontend/app/application/review/page.tsx` | `/application/review` | Step 4 — Review & submit |
| `frontend/app/application/confirm/page.tsx` | `/application/confirm` | Confirmation page (success state) |
| `frontend/app/application/connect-later/page.tsx` | `/application/connect-later` | Skip bank connection option |
| `frontend/app/application/credit-upload/page.tsx` | `/application/credit-upload` | Credit report upload (linked from external email) |

## Step Components

### Step 1: Signup (Personal Info)
- **File**: `frontend/app/application/signup/page.tsx`
- **Props**: Uses `ApplicationStepLayout` wrapper with current step = 1
- **Internal State**: 
  - `name`, `email`, `phone`, `dateOfBirth`, `selectedCountry`
  - `agreeTerms`, `agreeUserAgreement`, `emailExistsError`
- **Validation**: Email format, phone formatting, country selection (via `CountryCodeSelect`)
- **Storage**: Persists to localStorage (`userFormData` key); pre-fills from localStorage on resume
- **Transitions**: On submit, POST to `/api/v1/applications/otp` then navigate to `/application/passcode`
- **UI Components**: `ApplicationStepLayout`, `AgreementCheckbox`, `CountryCodeSelect`, styled inputs

### Step 2: Employment & Citizenship
- **File**: `frontend/app/application/employment/page.tsx`
- **Props**: Uses `ApplicationStepLayout` with current step = 2
- **Internal State**: 
  - `citizenship` (country code), `employment` (employee/self-employed/business-owner/retired/other)
  - `isCountryOpen`, `countrySearch`, `citizenshipOptions`
- **Validation**: Citizenship required; employment type required
- **Storage**: Reads from localStorage (`userFormData`); posts updated form data to `/api/v1/applications`
- **Transitions**: Navigates to `/application/connect-accounts?country=XX` on next
- **UI Components**: Custom country dropdown with flag icons, employment radio/dropdown

### Step 3: Account Connection (Plaid/SaltEdge)
- **File**: `frontend/app/application/connect-accounts/page.tsx` (router)
- **Variants**:
  - **Plaid** (`pagePlaid.tsx`): For US, CA; uses `react-plaid-link` component
  - **SaltEdge** (`pageSalt.tsx`): For other countries
- **Plaid Props** (from `PlaidLinkButton.tsx`):
  - `linkToken` fetched from backend
  - `onSuccess(publicToken, metadata)` — extracts institution + account details
  - `accountType` — "personal" | "business" | "investments"
  - `connectedAccounts` — summary of already-connected accounts per type
- **SaltEdge Flow**:
  - Embeds iframe or redirect to Salt Edge portal
  - Customer ID persisted in localStorage (`dw_application_saltedge_customer_id`)
  - Category overrides stored (`dw_application_saltedge_category_overrides`)
- **Storage Keys**:
  - `dw_application_connected_accounts` (v7 schema) — array of accounts per category
  - `dw_application_connected_accounts_version`
  - `plaid_oauth_link_token`, `plaid_oauth_account_type` (temporary, OAuth redirect)
- **Transitions**: On complete, navigate to `/application/review` or `/application/connect-later`

### Step 4: Review & Submit
- **File**: `frontend/app/application/review/page.tsx`
- **Props**: Reads localStorage for form data + connected accounts; computes display strings
- **Internal State**: 
  - `submitError`, `isSubmitting`
  - Derived from stored form data: name, email, phone, country, employment, accounts
- **Submission**:
  - POST to `/api/applications` (or `/api/v1/applications`) with full payload
  - Payload includes: personal details, employment, connected_accounts, metadata
  - On success: navigate to `/application/confirm?reference=AP_XXXXX`
- **Validation**: Requires ≥1 personal account connected
- **UI Components**: `ReviewFormContent`, `ReviewSection`, `ReviewField`, `ReviewCard`

### Confirmation Page
- **File**: `frontend/app/application/confirm/page.tsx`
- **State**: Generates or retrieves application reference; blocks back-navigation
- **UI**: Success state with reference number, submission date, next steps info

## State Management

**No Zustand or Context API.** State is managed locally per page via `useState`, with **localStorage as the single source of truth** for cross-page persistence.

### Key Storage Keys
| Key | Purpose | Cleared On |
|-----|---------|------------|
| `userFormData` | Full personal info (name, email, phone, DOB, country, employment, etc.) | `exitApplicationSession()` |
| `dw_application_connected_accounts` | Array of connected accounts (personal/business/investments) | Manual clear or `exitApplicationSession()` |
| `dw_application_reference` | Application submission reference ID (AP_XXXXX) | Manual clear |
| `dw_application_otp_verified` | Session flag: OTP verified for signup | Manual clear on exit |
| `dw_application_saltedge_customer_id` | SaltEdge customer ID (if using SaltEdge) | Manual clear |
| `dw_application_saltedge_category_overrides` | Account category overrides from SaltEdge | Manual clear |
| `dw_login_otp_sent`, `dw_login_otp_sending` | Session flags for login OTP flow | Manual clear |

**Exit Flow**: `exitApplicationSession()` in `frontend/lib/application-session.ts` clears all keys and redirects to `/application`.

## Account Connection Logic

### Plaid (US, CA)
- **File**: `frontend/app/application/connect-accounts/pagePlaid.tsx`
- **Flow**:
  1. Request link token from backend (`POST /api/v1/payments/plaid/token` or similar)
  2. Render `PlaidLinkButton` component with `react-plaid-link` hook
  3. User authorizes via Plaid UI
  4. On success: `onSuccess(publicToken, { institution, accounts })`
  5. POST public token to backend exchange endpoint
  6. Store connected account details in localStorage under `dw_application_connected_accounts`
- **Account Categories**: Personal, Business, Investments
- **OAuth Redirect**: Stores link token + account type in localStorage before redirect; resumes on return

### SaltEdge (Non-US/CA)
- **File**: `frontend/app/application/connect-accounts/pageSalt.tsx`
- **Flow**:
  1. Fetch customer ID from backend (create if needed)
  2. Embed SaltEdge connect iframe or redirect
  3. User authorizes bank connection
  4. Webhook or polling retrieves accounts from SaltEdge
  5. Store customer ID + account list in localStorage
- **Account Categorization**: Normalized via `normalizeAccountCategory()` from account nature/type
- **Provider Resolution**: `getDefaultOpenBankingProviderForCountry()` selects provider per country

### Credit Upload
- **File**: `frontend/app/application/credit-upload/page.tsx`
- **Trigger**: Email link with JWT token (standalone route, not part of main form)
- **Validation**: Supports PDF, JPEG, PNG up to 25 MB
- **Submission**: Uploads to `/api/v1/applications/[id]/credit-score` endpoint

## Design Tokens

### Tailwind Config
- **File**: `frontend/tailwind.config.js`
- **Extend Colors**: Uses CSS variables (HSL format) for theming
  - `primary`, `secondary`, `destructive`, `accent`, `muted`, `foreground`, `background`
  - Configured in global CSS (not shown; likely in app/globals.css)
- **Border Radius**: `lg` (var(--radius)), `md` (calc(--radius - 2px)), `sm` (calc(--radius - 4px))
- **Animations**: `accordion-down/up`, `corner-glow`, `border-beam`, `shine-pulse`
- **Plugin**: `tailwindcss-animate`

### Custom Colors (Inline, Not Theme)
- **Primary Gradient**: `linear-gradient(85.91deg, #6B27D9 0%, #B176F8 100.49%)`
- **Text Primary**: `#333333`
- **Text Muted**: `#333333` @ 70%, 60%, 50% opacity
- **Border**: `#D6D6D6`
- **Accent (Purple)**: `#9F62F0`
- **Gray**: `#EBEBEB`, `#858585`
- **White**: `#FFFFFF`

### Fonts
- **Headers**: `SF Pro Display`, `-apple-system`, `BlinkMacSystemFont`, sans-serif
- **Custom Fonts**: Aeonik Pro (400, 500, 900), Inter (400, 500, 600) loaded in globals.css
- **Font Files**: `/public/fonts/` directory (woff2 + TTF)

### Spacing
- Tailwind defaults; no custom spacing scale visible in config

## UI Primitives

### Shadcn/UI Components
- **Location**: `frontend/components/ui/`
- **Button**: `frontend/components/ui/button.tsx` — CVA-based, variants: default, primary, destructive, outline, secondary, ghost, link; sizes: default, sm, lg, icon
- **Input**: `frontend/components/ui/input.tsx` — Radix-based, styled inputs
- **Select**: `frontend/components/ui/select.tsx` — Radix Select component
- **Form**: `frontend/components/ui/form.tsx` — React Hook Form integration
- **Other**: Alert Dialog, Tabs, Card, Progress, Popover, Sheet, ScrollArea, InputOTP, Hover Card, Slider, Resizable

### Custom Application Components
- **ApplicationStepLayout**: `frontend/components/application/application-step-layout.tsx` — wrapper with header, progress bar, content area, footer with Next/Back buttons
- **StepProgress**: `frontend/components/application/step-progress.tsx` — 4-step progress indicator (Personal Info → Employment → Account Connection → Review & Submit)
- **ReviewCard/ReviewSection/ReviewField**: `frontend/components/application/review/review-layout.tsx` — review step layouts
- **CountryCodeSelect**: `frontend/components/application/country-code-select.tsx` — country picker with dial codes
- **AgreementCheckbox**: `frontend/components/application/agreement-checkbox.tsx` — policy consent
- **PlaidLinkButton**: `frontend/app/application/PlaidLinkButton.tsx` — Plaid integration; import: `react-plaid-link`
- **CreditUploadForm**: `frontend/components/application/credit-upload-form.tsx` — file upload with validation

## API Contract

### Main Application Submission
- **Endpoint**: `POST /api/v1/applications`
- **Request Payload** (TypeScript interface `ApplicationPayload`):
  ```
  {
    email: string (required)
    phone: string
    country: string
    property_type: string
    purchase_intent: string
    budget_range: string
    savings: string
    income: string
    income_currency: string
    employment_status: string
    financing_consent: string
    full_name: string (required)
    date_of_birth?: string (ISO YYYY-MM-DD)
    profession?: string
    current_employer?: string
    job_title?: string
    industry?: string
    website?: string
    linkedin?: string
    agree_policy: boolean (required)
    receive_updates: boolean
    skipped_connect_accounts?: boolean
    connected_accounts?: Record<string, unknown[]> (account arrays per category)
    metadata?: Record<string, unknown>
    created_at?: string
  }
  ```
- **Response**: 201 Created or 400 Bad Request (with validation error)
- **Validation**: Server validates email, full_name, agree_policy in `frontend/app/api/applications/route.ts`

### OTP Endpoints
- **POST /api/v1/applications/otp**: Send OTP code (email + fullName + code in body)
- **POST /api/v1/applications/verify-passcode**: Verify OTP code (email + code in body)

### Plaid Link Token
- **POST /api/[backend-determined]**: Request Plaid link token (likely backend-specific path)
- **Response**: `{ linkToken: string }`

### SaltEdge
- **POST /api/saltedge/..**: Create customer or fetch connection details (backend-specific)

### Credit Upload
- **POST /api/v1/applications/[id]/credit-score**: Upload credit report (multipart form-data with file)

## Tests

### Existing Test Files
- `frontend/app/application/review/__tests__/payload.test.ts` — Tests application payload generation
- `frontend/app/application/credit-upload/__tests__/page.test.tsx` — Tests credit upload validation
- `frontend/app/api/applications/[id]/__tests__/route.test.ts` — Tests API route logic

### E2E/Integration Tests
- `frontend/eHousing_Web/tests/testcases/`:
  - `application-signup-dev-tests.spec.ts` — Signup flow
  - `application-passcode-dev-tests.spec.ts` — OTP verification
  - `application-employment-extra-dev-tests.spec.ts` — Employment step
  - `application-connect-accounts-dev-tests.spec.ts` — Account connection
  - `application-confirm-dev-tests.spec.ts` — Confirmation
  - `application-review-dev-tests.spec.ts` — Review & submit
  - Plus prod and signup variants

### Page Object Models (Playwright)
- `frontend/eHousing_Web/tests/pages/application-pages/`:
  - `signup-page.ts`, `passcode-page.ts`, `employment-page.ts`, `connect-accounts-page.ts`, etc.

## Feature Flags

| Flag | Purpose | Usage |
|------|---------|-------|
| `NEXT_PUBLIC_ENABLE_CREDIT_FALLBACK` | Enable dummy data fallback in non-prod | Checked in API routes for fallback responses |
| `NEXT_PUBLIC_BACKEND_API_URL` or `BACKEND_API_URL` | Backend API base URL | Resolved in `frontend/lib/utils.ts` for API calls |
| `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_*` | Sentry error reporting config | Loaded in `frontend/instrumentation-client.ts` |
| `NEXT_PUBLIC_AUTH0_ORGANIZATION_ID`, `NEXT_PUBLIC_AUTH0_ORGANIZATION` | Auth0 org config (for dashboard, not form) | Middleware, not used in application form |

**Note**: No feature flags directly gate the application form itself; all steps are always active.

---

## Key Implementation Notes

1. **No Global State Management**: Each page manages its own state; localStorage is the de facto sync mechanism.
2. **Responsive Design**: Uses Tailwind; form width capped at 640px (main content), header/footer at full width.
3. **Dynamic Import for Plaid/SaltEdge**: Conditionally loaded in Step 3 based on country (Plaid for US/CA, SaltEdge otherwise).
4. **Browser Back Prevention**: Confirm page uses history.pushState to prevent accidental re-submission.
5. **OTP Deduplication**: Both signup and login flows track OTP session state in sessionStorage to prevent duplicate sends.
6. **Currency Resolution**: Country-to-currency mapping in review page; defaults to USD.
7. **Demo Account Filtering**: Account names matching keywords like "demo", "test", "sample" are flagged for UX warnings.
