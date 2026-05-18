# Live PowerCred API — investigation results

**Status**: credentials issued by PowerCred (visible in `app.powercred.io`
dashboard) **do not yet grant external API access**. Mapper + adapter
are aligned to the real KTP-v3 response shape so the live client will
work the moment valid credentials are provisioned.

## What was confirmed

- The live API host is **`https://mock.powercred.io`**. (Yes, "mock"
  appears in the hostname even for production traffic — confirmed by
  Apigee error responses with PowerCred-specific `errorcode` values.)
- Auth query parameter is **`apikey`**, NOT `secret` as documented.
  The public docs at `apidocs.powercred.io/reference/post_auth-token`
  drift from the gateway's actual contract.
- The KTP-v3 endpoint is what PowerCred's dashboard uses for
  Japanese residence cards (per the response screenshot the user
  shared on 2026-05-09): top-level envelope `{"ktp": {"ktp": [{...}],
  "image_quality": {...}}}`.

## What's blocked

```
POST https://mock.powercred.io/auth/token?apikey={dashboard_api_key}
  body: {"user_id": "app-test-0001"}
→ 401 {"fault": {"faultstring": "Invalid ApiKey",
                 "detail": {"errorcode": "oauth.v2.InvalidApiKey"}}}
```

Tried with all three credential values from the dashboard (App ID,
API Key, Secret Key) and several paired combinations
(`apikey + secret`, `client_id + client_secret`, etc.).
Every attempt returned `401 Invalid ApiKey` from the Apigee gateway.

## Best explanation

The credentials in `app.powercred.io` activate the **dashboard's**
internal upload flow (which goes via GCS — visible in the response's
`excel_url: "gs://..."` field shown in the user's screenshot). That
internal pipeline is reached by an authenticated dashboard session
cookie, not by these `apikey` values directly.

External API credentials issued for our own backend integration are a
**separate provisioning step** by PowerCred — consistent with the
original Slack update *"contract tomorrow, API access the day after
tomorrow"*. The dashboard credentials gave us:

  * confirmation of the real response shape (used to fix the mapper),
  * confirmation of the auth query-param name,
  * confirmation of the live host.

But the actual `apikey` for external HTTP traffic from our backend
isn't this set.

## What's ready when API access arrives

- `backend/src/infra/powercred/client.py` — real client implementing
  the two-step flow (`/auth/token` → `/identity/get/ocr/ktp/v3`),
  retries, error handling. Tested end-to-end via the mock; needs
  only a valid `apikey` + base URL to switch on.
- `factory.py` flips between mock and live based on whether
  `POWERCRED_BASE_URL` and `POWERCRED_SECRET` env vars are set.
- Mapper + persistence already handle the real KTP-v3 envelope —
  27/27 backend tests pass with the new shape, including
  - DD-MM-YYYY → ISO date normalisation
  - State+city prefix stripping from the single `address` field
  - JP country derivation from Japanese prefecture suffix kanji
  - SHA-256 hashing of DOB and (when present) NIK before persist.

## Recommended next steps for the meeting

1. Ask PowerCred for a production `apikey` provisioned for direct API
   access from our backend (separate from the dashboard credentials).
2. Confirm the **base URL** for our environment — they may issue a
   tenant-specific subdomain or stick with `mock.powercred.io`.
3. Confirm the **endpoint** PowerCred wants us to call. Their
   dashboard chose KTP-v3 for the Japanese residence card; for
   production we should ask whether they want us hitting KTP-v3
   directly or going through `/idp/read` with a custom schema (the
   IDP path advertises Bring-Your-Own-Schema).
4. Confirm which of `secret` vs `apikey` is the canonical query-param
   name going forward. Update the public docs accordingly.

## Credentials location (updated 2026-05-09)

Credentials live in **`backend/.env`** at the repo root, gitignored via
the existing `*.env*` pattern in `.gitignore`. The backend loads them
automatically through `python-dotenv` in `backend/src/__init__.py`,
which picks up `backend/.env` and `backend/src/.env`.

Required keys when external API access is provisioned:
```
POWERCRED_BASE_URL=https://mock.powercred.io
POWERCRED_SECRET=<external-API apikey from PowerCred>
```

Plus the dashboard credentials (kept for reference / future signed
requests if PowerCred adds HMAC):
```
POWERCRED_APP_ID=…
POWERCRED_API_KEY=…
```

The factory at `backend/src/infra/powercred/factory.py` checks for
both `POWERCRED_BASE_URL` and `POWERCRED_SECRET` — when both are set,
the live client runs; otherwise the mock fallback runs.
