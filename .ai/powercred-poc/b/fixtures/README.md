# Fixtures

## sample-zairyu-card.png

Japanese Residence Card (在留カード, *Zairyū Kādo*) **specimen**. The card
itself carries the 「見本 SAMPLE」 watermark — it is not a real card and
contains no real PII. The depicted holder is "TURNER ELIZABETH"; the card
number "AB12345678CD" is a known test sequence used in the Japanese
Immigration Services Agency's public-facing materials.

**Source.** Provided by the user at the repository root as `image.png`,
copied here verbatim (md5 `2faf117f0baa5f140253c395a7ec8f45`) so the
fixture is self-contained inside `.ai/powercred-poc/b/`.

**Why this card is the right fixture for this PoC.** See
`b/about.md` §"Fixture" — short version: it's adversarial against
PowerCred's documented coverage (no Japanese document type in the 33-value
`document_type` enum) and tests the Bring-Your-Own-Schema escape hatch
along with the "any Latin-alphabet language" claim under mixed-script
input.

**Visible fields on the card** (transcribed by inspection, treat as
ground-truth candidate set):

| Field | Value visible on card |
| --- | --- |
| Card number | `AB12345678CD` |
| Surname | `TURNER` |
| Given name | `ELIZABETH` |
| Date of birth | `1985-12-31` (visible as `1985年12月31日`) |
| Status of residence | `留学` (Student) |
| Period of stay | (visible — to confirm via OCR) |
| Issue date | `2019-04-01` (visible as `2019年4月01日`) |
| Expiration date | `2023-07-01` (visible as `2023年07月01日`) |
| Sample marker | `見本 SAMPLE` (watermark over card) |
| Photograph | present (top-right) |

The exact ground truth (after OCR-by-human verification) belongs in
`ground-truth.json` once we author it during Phase 2 of the test plan.
