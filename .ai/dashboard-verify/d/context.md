# Implementation Context: Fix v7Data Identity Fields (Bug 3b)

This document is self-contained. Read it top to bottom before writing a single
line of code.

---

## Repository

- **Root**: `/Users/chappy/Downloads/old/chappy2/coding/backup/dwilar/lita-ehousing/.claude/worktrees/epic-einstein-553ad4/`
- **Frontend**: `frontend/` — Next.js 14, TypeScript, npm
- **Working branch**: `claude/epic-einstein-553ad4`

---

## Task Description

The previous fix (task c) incorrectly updated the `v7Data` useMemo in
`frontend/app/dashboard/page.tsx` to read identity fields (`fullName`, `phone`,
`address`, `employer`) from SaltEdge/Plaid pipeline output keys on the `dash`
object. Those pipeline keys are only populated when a credit score has been
computed (requiring a completed bank link). The correct source for identity
fields is the `application` object, which is always available from
`GET /api/v1/applications/{id}`.

This fix updates four fields in the `v7Data` useMemo to read from `application`
directly (with pipeline enrichment as a secondary override), and adds
`application` as a memo dependency.

---

## The Bug in Context

### Current v7Data useMemo (lines 2433–2530, `frontend/app/dashboard/page.tsx`)

The memo currently opens with:

```ts
const v7Data = useMemo(() => {
  const dash = v7Dashboard
  const score = v7Scorecard

  const buildAddress = (prefix: "holder_info_address" | "identity"): string | null => {
    // ... reads dash.holder_info_address_street, dash.identity_street, etc.
  }

  return {
    // ← WRONG: these read pipeline keys that are null when apiScore is null
    fullName:
      typeof dash.holder_info_full_name === "string" ? dash.holder_info_full_name
      : typeof dash.identity_full_name === "string" ? dash.identity_full_name
      : null,
    phone:
      typeof dash.holder_info_phone === "string" ? dash.holder_info_phone
      : typeof dash.identity_primary_phone === "string" ? dash.identity_primary_phone
      : null,
    address:
      buildAddress("holder_info_address") ?? buildAddress("identity"),
    employer: null,
    // ... financial fields (correct after task c fix)
  }
}, [apiScore, v7Dashboard, v7Scorecard])
```

**Current line numbers for the four identity assignments:**

| Field | Lines |
|---|---|
| `fullName` | 2456–2459 |
| `phone` | 2460–2463 |
| `address` | 2464–2465 |
| `employer` | 2466 |
| memo dependency array | 2530 |

The `buildAddress` helper function spans lines 2437–2453. It can be removed
entirely or kept and called only after `application` fields are checked — see
the replacement code below.

---

## Correct Data Sources

### `application` state variable

- **Type**: `ApplicationDetail | null`
- **Declared at**: line 348 of `frontend/app/dashboard/page.tsx`
  ```ts
  const [application, setApplication] = useState<ApplicationDetail | null>(null)
  ```
- **Type definition**: `frontend/lib/financial-insights.ts` line 32
  ```ts
  export type ApplicationDetail = Omit<BackendApplication, "connected_accounts"> & {
    connected_accounts: Record<string, ConnectedAccount[]>
    income_history: IncomeHistoryProfile | null
  }
  ```
- **`BackendApplication` definition**: `frontend/lib/application-types.ts` lines 28–68

### Relevant fields on `BackendApplication` / `ApplicationDetail`

```ts
interface BackendApplication {
  full_name: string          // always present — use for fullName
  phone: string              // always present — use for phone
  current_employer?: string  // optional — use for employer (undefined → null)
  // No top-level address field — address comes from application.metadata
  metadata?: Record<string, unknown>  // may contain address keys
}
```

**There is no top-level `address` field on `BackendApplication`.** Address data
is stored in `application.metadata` under keys like `address_line1`, `street`,
`city`, `region`, `postal_code`, etc. The `customerInformationData` useMemo
(lines 3545–3559) already reads these keys correctly using `readMetadataString`.

### Pipeline keys (secondary enrichment — only available when apiScore != null)

| v7Data field | SaltEdge pipeline key | Plaid pipeline key |
|---|---|---|
| `fullName` | `dash.holder_info_full_name` | `dash.identity_full_name` |
| `phone` | `dash.holder_info_phone` | `dash.identity_primary_phone` |
| `address` | `dash.holder_info_address_street` + `_city` + `_region` + `_postal_code` | `dash.identity_street` + `_city` + `_region` |
| `employer` | not emitted | not emitted |

---

## How v7Data Identity Fields Are Consumed Downstream

All four fields flow into the `customerInformationData` useMemo (lines 3500–3640)
which already has a fallback chain:

```ts
// line 3503–3507: fullName
const displayFullName =
  (v7Data.fullName || null) ??
  readMetadataString(["full_name", "fullName", ...]) ??
  application?.full_name?.trim() ??
  translate("Not provided", "未登録")

// line 3560–3561: address
const addressLabel = v7Data.address
  ?? (addressParts.length ? addressParts.join(", ") : translate("Not on file", "記録なし"))

// line 3573–3576: phone
const phone =
  v7Data.phone ??
  readMetadataString(["phone", "mobile_phone", ...]) ??
  application?.phone ?? fallbackLabel

// line 3583–3591: employer
const employer =
  v7Data.employer ??
  readMetadataString(["current_employer", "currentEmployer", "employer", ...]) ??
  application?.current_employer?.trim() ?? fallbackLabel
```

Also: `v7Data.employer` is used at line 5434 in the `employmentSubtitleLabel`
useMemo, and `v7Data.phone` / `v7Data.fullName` flow through `customerInformationData`
into the `CustomerInformationCard` component (imported at line 91).

**Key implication**: When `v7Data.fullName` is `null` (because `apiScore` is null),
the `customerInformationData` memo correctly falls back to `application?.full_name`.
So the bug is a missed-enrichment problem for identity (the pipeline enrichment reads
wrong keys), not a silent failure. However, moving identity to `application` as the
primary source is more correct because:
1. `application` is always loaded (even before a credit score exists).
2. For `phone`, `fullName`, and `employer`, the application form data is the
   authoritative source — the pipeline should confirm, not replace it.
3. The `customerInformationData` fallback chain treats `v7Data.*` as higher
   priority than `application.*`, so if `v7Data` fields are `null`, `application`
   values are used anyway. Making `v7Data` read from `application` first is cleaner.

---

## Exact Edit Required

### File: `frontend/app/dashboard/page.tsx`

**Replace lines 2437–2466 and line 2530.**

#### Old code (lines 2437–2466):

```ts
    const buildAddress = (prefix: "holder_info_address" | "identity"): string | null => {
      if (prefix === "holder_info_address") {
        const parts = [
          dash.holder_info_address_street,
          dash.holder_info_address_city,
          dash.holder_info_address_region,
          dash.holder_info_address_postal_code,
        ].filter((p): p is string => typeof p === "string" && p.length > 0)
        return parts.length > 0 ? parts.join(", ") : null
      }
      const parts = [
        dash.identity_street,
        dash.identity_city,
        dash.identity_region,
      ].filter((p): p is string => typeof p === "string" && p.length > 0)
      return parts.length > 0 ? parts.join(", ") : null
    }

    return {
      // Identity — SaltEdge uses holder_info_* prefix; Plaid uses identity_* prefix
      fullName:
        typeof dash.holder_info_full_name === "string" ? dash.holder_info_full_name
        : typeof dash.identity_full_name === "string" ? dash.identity_full_name
        : null,
      phone:
        typeof dash.holder_info_phone === "string" ? dash.holder_info_phone
        : typeof dash.identity_primary_phone === "string" ? dash.identity_primary_phone
        : null,
      address:
        buildAddress("holder_info_address") ?? buildAddress("identity"),
      employer: null,
```

#### New code (replacement for lines 2437–2466):

```ts
    // Identity — primary source is the application object (always available);
    // pipeline keys are used as enrichment when a credit score has been computed.
    const pipelineFullName =
      typeof dash.holder_info_full_name === "string" ? dash.holder_info_full_name
      : typeof dash.identity_full_name === "string" ? dash.identity_full_name
      : null
    const pipelinePhone =
      typeof dash.holder_info_phone === "string" ? dash.holder_info_phone
      : typeof dash.identity_primary_phone === "string" ? dash.identity_primary_phone
      : null
    const pipelineAddress = (() => {
      const saltedgeParts = [
        dash.holder_info_address_street,
        dash.holder_info_address_city,
        dash.holder_info_address_region,
        dash.holder_info_address_postal_code,
      ].filter((p): p is string => typeof p === "string" && p.length > 0)
      if (saltedgeParts.length > 0) return saltedgeParts.join(", ")
      const plaidParts = [
        dash.identity_street,
        dash.identity_city,
        dash.identity_region,
      ].filter((p): p is string => typeof p === "string" && p.length > 0)
      return plaidParts.length > 0 ? plaidParts.join(", ") : null
    })()

    return {
      // Identity: read from application object first; pipeline enriches when available
      fullName: pipelineFullName ?? application?.full_name?.trim() ?? null,
      phone: pipelinePhone ?? application?.phone?.trim() ?? null,
      address: pipelineAddress,
      employer: application?.current_employer?.trim() ?? null,
```

#### Old dependency array (line 2530):

```ts
  }, [apiScore, v7Dashboard, v7Scorecard])
```

#### New dependency array:

```ts
  }, [apiScore, application, v7Dashboard, v7Scorecard])
```

---

## Why `address` Is Still Pipeline-Only

`BackendApplication` does not have a top-level `address` field. Address data lives
in `application.metadata` under various keys (`address_line1`, `street`, `city`,
etc.). Reading those in the `v7Data` memo would require duplicating the
`readMetadataString` logic that already exists in `customerInformationData`.

Instead, keep `v7Data.address` as pipeline-only (returning `null` when no pipeline
score is available). The `customerInformationData` memo at line 3560 already handles
this gracefully: `const addressLabel = v7Data.address ?? (addressParts from metadata)`.
When `v7Data.address` is `null`, the metadata-derived address is used.

If the team later wants address in `v7Data` from `application.metadata`, that is a
separate enhancement (not part of this fix).

---

## Summary of Changes

| Field | Before (task c) | After (task d) |
|---|---|---|
| `fullName` | `dash.holder_info_full_name ?? dash.identity_full_name` | `pipelineFullName ?? application?.full_name` |
| `phone` | `dash.holder_info_phone ?? dash.identity_primary_phone` | `pipelinePhone ?? application?.phone` |
| `address` | pipeline-constructed string | pipeline-constructed string (unchanged) |
| `employer` | `null` | `application?.current_employer?.trim() ?? null` |
| memo deps | `[apiScore, v7Dashboard, v7Scorecard]` | `[apiScore, application, v7Dashboard, v7Scorecard]` |

---

## Files to Modify

| File | Change |
|---|---|
| `frontend/app/dashboard/page.tsx` | Replace identity field block in v7Data useMemo (~lines 2437–2466); update dependency array (line 2530) |

No backend changes. No new proxy routes. No new files.

---

## Validation

```bash
# TypeScript check (targeted — only dashboard/page.tsx errors)
cd /Users/chappy/Downloads/old/chappy2/coding/backup/dwilar/lita-ehousing/.claude/worktrees/epic-einstein-553ad4/frontend
npx tsc --noEmit 2>&1 | grep "dashboard/page.tsx"

# Broader frontend type check
npx tsc --noEmit 2>&1 | tail -20
```

If TypeScript complains about `application` not being in scope inside the memo
callback, verify that `application` is declared at component scope (line 348) and
that the dependency array includes it. The variable is available in the closure
because the memo is defined inside the component function.

Expected result: zero new errors in `dashboard/page.tsx` after the edit.
