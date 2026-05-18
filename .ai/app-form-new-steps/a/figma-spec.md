# Figma Spec — "Form New Steps_Account Connection"

Source: https://www.figma.com/design/wIXHvWAsKOtEEkg33UvQie/Projects?node-id=1734-2510
Designer: Krystyna (For review (2026) page)
Inspected: 2026-05-12, via MCP-controlled Chrome

## Top-level wizard (all 4 outer steps)

A persistent header strip appears on every step page:

- Left: **Lita** wordmark logo (image L + "ita" text)
- Center: 4-step horizontal indicator
  - Each step has a circular badge with the step number (or a ✓ when completed)
  - Active step: solid purple ring + purple text label, badge inside is purple-outlined circle with the number in purple
  - Completed step: solid filled purple circle with white ✓ + purple text label
  - Upcoming step: gray-outlined circle with gray digit + gray text label
  - Connectors between badges:
    - Between current and previous (completed): solid purple line
    - Between current and next (upcoming): light gray dotted/dashed line
- Labels: `Personal Info`, `Employment`, `Account Connections`, `Review & Submit`
- The outer indicator only renders 4 steps — there is NO sub-step indicator at the outer level. Sub-step state (Main / Business / Investment) is shown INSIDE Step 3 only.

## Step 1 — Personal Info

URL: `/application/signup`

- Title: **Let's begin your e-housing application form** (very large, charcoal #333)
- Subtitle: "Enter your details below."
- Fields stacked vertically:
  1. **Full legal name** (single text input, placeholder "Enter your name")
  2. Row of 2 columns:
     - **Email** (placeholder "Enter your email address")
     - **Phone number** (country code dropdown with flag, e.g. 🇨🇦+1, then number)
- Two checkbox rows:
  - "I agree to [Terms](#) and [Privacy Policy](#)"
  - "I agree to the [User Agreement](#)"
- Footer (NOT sticky, sits at end of content):
  - `← Back` text link on left
  - **Next** wide purple-gradient button on right (linear-gradient #6B27D9 → #B176F8)

## Step 1.5 — Verify your email

URL: `/application/passcode`

- Title: **Verify your email**
- Subtitle: "We've sent a verification code to your email: `<email>`"
- Label: "Enter The Code"
- 6 separate boxed inputs, single-digit each, with strong border + rounded corners
- Below: "Didn't receive it? Resend or update your email" (small text, "Resend" + "update your email" are purple links)
- **No "Verify" button** — auto-advance on 6th digit entry (per comment #87)
- Footer: `← Back` + a `Next` button — visible but auto-press happens on completion

## Step 2 — Employment

URL: `/application/employment`

- Title: **Employment**
- Subtitle: "Select your current employment type and country of citizenship"
- Field: **What is your country of citizenship?** — searchable dropdown (full width)
- Field: **Current employment** — horizontal chip selector, 5 options:
  - `Full-time` `Self - employed` `Business owner` `Retired` `Other`
  - Active chip: light-purple bg, purple text, purple border, rounded
  - Inactive: white bg, charcoal text, light gray border
- Footer (NOT sticky): `← Back` + **Next** purple-gradient button

## Step 3 — Account Connections (split into 3 sub-steps)

URL: `/application/connect-accounts`

The page now has TWO layers of progress:
- **Outer wizard** (top, unchanged from other steps) — step 3 active
- **Inner mini wizard** appearing inside the page body — 3 dots/pill labels:
  1. **Main bank account** (1/3) — required (need at least one personal account at end of flow)
  2. **Business account** (2/3) — required IF employment = "Business owner", else optional
  3. **Investment account** (3/3) — always optional

### Sub-step 3.1 — Main bank account

- Section heading: **Main bank account** + sub-label "(1/3)" plus a small badge ("Required" purple chip)
- Body text: explanation of why we ask
- Card with `+ Connect main bank account` button (purple gradient)
- Once an account is connected, the connected account appears as a row with bank logo + masked number + status; the button label changes to **Connect more**
- Below the widget: **`Skip step`** ghost link (visible — main bank is optional per design comments though strongly recommended)
- Helpful banner under widget: "More accounts = stronger application" (light purple background, info icon)
- Footer: `← Back` + **Next** (Next disabled until at least one account on the *current* sub-step is connected OR user clicks Skip)

### Sub-step 3.2 — Business account

Two variants:

**Variant A — Business owner (required)** (per comment #103):
- Heading: **Business account** + badge "(2/3)" + red/purple **Required** chip
- A purple tip banner at top: "You selected *Business owner* on the previous step, so connecting a business account is required to continue."
- The `Skip step` link is **hidden**
- Otherwise identical layout to 3.1

**Variant B — Other employment (optional)** (per comment #103):
- Heading: **Business account** + badge "(2/3)" + gray **Optional** chip
- No tip banner
- `Skip step` link visible

### Sub-step 3.3 — Investment account

- Heading: **Investment account** + badge "(3/3)" + gray **Optional** chip
- `Skip step` always visible
- Same connect-widget pattern

### Connect more / banner / popups (per comments #88–#92)

- After ≥1 account connected on a sub-step, button copy: "+ Connect more"
- If at the end of sub-step 3.3 the user has connected only 1 total account across all sub-steps, **on Submit** show a modal:
  - Title: "Add more accounts?"
  - Body: "We recommend connecting additional accounts to strengthen your application. You can skip this and submit anyway."
  - Two buttons: **Add more accounts** (primary purple), `Submit anyway` (ghost outline)

### Popups

There are 4 pop-up variants in Figma — the Submit confirmation modal, the add-country dialog, the skip-confirmation dialog ("Are you sure you want to skip?"), and a connect-error retry.

## Step 4 — Review & Submit

URL: `/application/review`

- Title: **Review & Submit**
- Subtitle: "Please review your information below before submitting."
- Sections (read-only with edit links):
  - **Personal Info** — name, email, phone, DOB → Edit link
  - **Employment** — citizenship, employment type → Edit link
  - **Connected accounts**:
    - "Main bank account: <bank list or 'Skipped'>"
    - "Business account: <bank list or 'Skipped'>"
    - "Investment account: <bank list or 'Skipped'>"
- Agreement reminder line
- Footer: `← Back` + **Submit** (purple gradient, wider per comment #102 — at least 200px wide)
- Required message below Submit if there's a validation issue

## Visual tokens

- Primary gradient: `linear-gradient(85.91deg, #6B27D9 0%, #B176F8 100.49%)`
- Primary purple solid: `#9F62F0`
- Active chip bg: `#F4ECFF` (soft purple), text `#7B33E3`
- Text primary: `#333333`
- Border default: `#D6D6D6`
- Banner success/info bg: `#F4ECFF` w/ left border purple
- Required chip: red-ish `#FF6B6B` bg with white text, or alt purple chip
- Optional chip: light gray `#EBEBEB` bg with `#666` text
- Border-radius: 12px on cards/buttons, 8px on chips, 16px on the OTP/digit boxes
- Font: SF Pro Display headings; Aeonik or Inter for body

## Layout

- Max content width: 640px centered (existing pattern)
- Page padding: 24px horizontal mobile, 32px desktop
- Buttons sit at end of scrollable content — NOT sticky bottom (per comment #86)

## Behavior summary

1. Auto-advance OTP — submit on 6th digit (#87)
2. Conditional required: Business sub-step is required when employment === "Business owner" (#103)
3. Skip button removed for required Business sub-step
4. "Connect more" relabel after first account
5. Submit confirmation popup if only 1 account connected total
6. Optional banner suggesting more accounts after 1 connected
7. Sub-step navigation via inner mini wizard + outer Next/Back

## Open questions (deferred to v1.1 — not blocking)

- Whether bank statements upload belongs in Personal Accounts widget (#93)
- FAQ/chat support block (#96) — implement as a static FAQ accordion if time permits; otherwise defer
- Alternate icon variants (#95)
- Tooltip variant for required message (#94)

## Verbatim designer comments

All 18 comments are captured in this section's preamble and the `Designer comments` section near top of this file. They drive all behavior decisions above.
