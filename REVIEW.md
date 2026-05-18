# Code Review Style Guide (dw-platform)

This file defines **mechanical review rules** for this repository. The review/fix phases should always check and correct these issues when touched code can be safely updated.

Scope:
- Primary languages: **TypeScript/JavaScript**, **Go**, **Python**, **Shell**, and **SQL/Prisma migration files**.
- Apply rules to files touched in the current task. Avoid broad reformat-only rewrites outside task scope.

---

## 1) Multiline expressions: put operators at line start

When an expression spans multiple lines, continuation lines must start with the operator (`&&`, `||`, `+`, etc.) so continuation is obvious.

```ts
// BAD
if (isEligible(user) &&
    hasConsent(user) &&
    hasActiveSession(user)) {

// GOOD
if (isEligible(user)
    && hasConsent(user)
    && hasActiveSession(user)) {
```

---

## 2) Multiline function calls: one argument per line

If a call does not fit on one line, place each argument on its own line.

```ts
// BAD
trackEvent('consent_submitted', userId, appId,
  requestId, metadata)

// GOOD
trackEvent(
  'consent_submitted',
  userId,
  appId,
  requestId,
  metadata,
)
```

---

## 3) Do not use non-null assertion (`!`) in TypeScript

Prefer explicit guards over `value!`.

```ts
// BAD
saveToken(token!.id)

// GOOD
if (!token) return
saveToken(token.id)
```

---

## 4) Prefer direct narrowing over redundant check + cast

Avoid checking and then force-casting when safe narrowing can do it directly.

```ts
// BAD
if (payload && (payload as ConsentPayload).customerId) {
  const p = payload as ConsentPayload
  useCustomer(p.customerId)
}

// GOOD
if (!payload || typeof payload !== 'object') return
if (!('customerId' in payload)) return
useCustomer(payload.customerId)
```

---

## 5) Initialize basic fields explicitly

Always initialize booleans, counters, and nullable references explicitly.

```ts
// BAD
let retryCount: number
let connected: boolean

// GOOD
let retryCount = 0
let connected = false
```

```go
// BAD
var attempts int

// GOOD
attempts := 0
```

---

## 6) Keep error handling immediate in Go

Handle `err` right after the call that returns it.

```go
// BAD
res, err := repo.Load(id)
log.Debug("loaded")
if err != nil { return err }

// GOOD
res, err := repo.Load(id)
if err != nil {
	return err
}
log.Debug("loaded")
```

---

## 7) No ignored promises in TS/JS

Await promises or intentionally mark fire-and-forget with `void` + comment.

```ts
// BAD
refreshConsentMetrics()

// GOOD
await refreshConsentMetrics()

// GOOD (intentional fire-and-forget)
void refreshConsentMetrics() // background refresh intentionally not awaited
```

---

## 8) Prefer early returns to nested condition pyramids

Flatten control flow when behavior is equivalent.

```ts
// BAD
if (consent) {
  if (consent.active) {
    return issueReceipt(consent)
  }
}
return null

// GOOD
if (!consent || !consent.active) return null
return issueReceipt(consent)
```

---

## 9) Keep imports ordered and grouped consistently

- Sort imports alphabetically within each group.
- Group order: external packages, internal aliases/absolute imports, relative imports.
- Remove unused imports.

---

## 10) No wildcard imports in Python

Use explicit imports only.

```py
# BAD
from utils import *

# GOOD
from utils import normalize_id, parse_timestamp
```

---

## 11) Prefer parameterized DB queries only

Never compose SQL with string interpolation/concatenation when parameters are supported.

```py
# BAD
sql = f"SELECT * FROM applicants WHERE id = '{applicant_id}'"

# GOOD
sql = "SELECT * FROM applicants WHERE id = %s"
cur.execute(sql, (applicant_id,))
```

---

## 12) Shell scripts must be safe by default

For Bash scripts, include strict mode unless there is a documented reason not to.

```bash
set -euo pipefail
```

Quote variable expansions unless intentional word-splitting is required.

---

## 13) Keep logs structured and actionable

- Include request/trace IDs when available.
- Do not log secrets/tokens/PII.
- Use stable event names for analytics-style logs.

---

## 14) Review output contract for task-think review phase

When producing review findings:
- list concrete file paths
- classify issue type (correctness, safety, style, duplication, structure)
- provide exact requested fix
- avoid vague suggestions

If a rule conflicts with existing enforced tooling in a touched subproject, follow that subproject's formatter/linter and note the conflict in review output.
