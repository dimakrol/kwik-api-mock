# CLAUDE.md — kwik-api-mock

NestJS + SQLite mock server for the [Kwik](https://kwik.co.za) payment API. Intended for local integration testing of `jb-application-be`, `jb-flow-engine`, and `jb-inner-api` without hitting the real Kwik staging environment.

## Commands

```bash
pnpm install
pnpm start:dev       # watch mode, port 3099
pnpm build           # compiles to dist/ via tsconfig.build.json
pnpm test            # Jest unit tests (143 tests across 12 spec files)
pnpm test:cov        # test + coverage report
```

Point consuming services at the mock:
```
KWIK_API_BASE_URL=http://localhost:3099/1.0
```

Swagger UI: `http://localhost:3099/docs`

## Architecture

Single NestJS app. No Kafka, no Redis. SQLite database (`kwik-mock.sqlite`, git-ignored) created automatically on first run via TypeORM `synchronize: true`.

```
src/
  main.ts                      # bootstrap — global prefix /1.0, excludes /checkout/* and /admin/*
  app.module.ts                # root module, TypeORM config (better-sqlite3)
  common/
    basic-auth.guard.ts        # validates Basic/api-key auth; reads mockConfig for mode
    gen-id.util.ts             # genId('cus') → "cus_<16 hex chars>"
    mock-config.ts             # runtime-mutable singleton for scenario flags (env var fallback)
  database/entities/           # 8 TypeORM entities (see Data Model below)
  seed/seed.service.ts         # runs onModuleInit, idempotent; exposes seed() for admin re-seed
  webhook-delivery/            # WebhookDeliveryService — centralised outbound webhook logic
  payment-methods/             # GET /1.0/payment-methods
  lookups/                     # GET /1.0/lookups/:type[/:payment_methods_id]
  cdv/                         # POST /1.0/cdv
  avs/                         # POST /1.0/avs-r
  customers/                   # GET /1.0/customers/list  POST /1.0/customers/create
  bank-accounts/               # GET/POST /1.0/bank-accounts/list|create|update
  payments/                    # POST /1.0/payments/submit|status/:id/:status
  checkout/                    # POST /1.0/checkout/page  GET/POST /checkout/:id/*
  mandates/                    # POST /1.0/mandates/debicheck/update/cancel
  admin/                       # /admin/* — no auth, webhook firing + DB inspection + scenario
test/                          # Jest unit tests, one spec per service
scripts/
  test-jobix-kwik-e2e.sh       # E2E test script exercising mock + Jobix services
```

Each feature directory follows the pattern: `*.module.ts` / `*.controller.ts` / `*.service.ts`.

## API Layers

### Kwik API (`/1.0/*`)
All routes require `Authorization: Basic <base64(key:secret)>` or `x-kwik-api-key: <key>` (configurable via `MOCK_AUTH_MODE`).

| Method | Path | Description |
|---|---|---|
| GET | `/1.0/payment-methods` | Returns 2 seeded methods |
| GET | `/1.0/lookups/:type[/:pam_id]` | Bank names per payment method |
| POST | `/1.0/cdv` | CDV bank account validation |
| POST | `/1.0/avs-r` | AVS owner verification |
| GET | `/1.0/customers/list` | List customers (filterable — see Filtering) |
| POST | `/1.0/customers/create` | `{ records: [...] }` |
| GET | `/1.0/bank-accounts/list` | List bank accounts (filterable — see Filtering) |
| POST | `/1.0/bank-accounts/create` | `{ records: [...] }` |
| POST | `/1.0/bank-accounts/update` | `{ records: [{ id, ...fields }] }` |
| POST | `/1.0/checkout/page` | Creates checkout session, returns `page_url` |
| POST | `/1.0/payments/submit` | Creates payment + mandate; fires webhooks |
| POST | `/1.0/payments/status/:id/:status` | Updates payment status; fires webhook |
| POST | `/1.0/mandates/debicheck/update/cancel` | Cancels mandate + stops linked payment; fires webhook |

### Checkout UI (no `/1.0/` prefix, no auth)

| Method | Path | Description |
|---|---|---|
| GET | `/checkout/:id` | HTML page with complete/fail/save-card buttons |
| POST | `/checkout/:id/complete` | Marks COMPLETED, generates card_id, fires CHECKOUT_COMPLETED |
| POST | `/checkout/:id/fail` | Marks FAILED, fires CHECKOUT_COMPLETED with FAILED status |
| POST | `/checkout/:id/save-card` | Marks CARD_SAVED, generates card_id, fires CHECKOUT_COMPLETED |

### Admin API (`/admin/*`, no auth)

| Method | Path | Purpose |
|---|---|---|
| POST | `/admin/webhook/fire` | Fire a webhook to any target URL |
| POST | `/admin/webhook/replay/:deliveryId` | Replay a stored webhook delivery |
| GET | `/admin/data` | Dump all DB tables + webhook history + scenario config |
| DELETE | `/admin/reset` | Clear transactional data; preserves seed. `?all=true` clears everything + re-seeds |
| POST | `/admin/seed` | Re-run seed (safe to call repeatedly) |
| GET | `/admin/scenario` | Read current runtime scenario flags |
| POST | `/admin/scenario` | Update scenario flags at runtime without restart |

## Data Model

| Entity | Table | ID prefix | Notes |
|---|---|---|---|
| `PaymentMethodEntity` | `payment_methods` | `pam_` | Seeded |
| `LookupEntity` | `lookups` | `loo_` | Seeded |
| `CustomerEntity` | `customers` | `cus_` | Created via API |
| `BankAccountEntity` | `bank_accounts` | `bac_` | Created via API |
| `PaymentEntity` | `payments` | `pay_` | Has `notify_url` column for webhook routing |
| `MandateEntity` | `mandates` | `man_` | Created alongside payment |
| `CheckoutSessionEntity` | `checkout_sessions` | `cho_` | Has `card_id` column set on complete/save-card |
| `WebhookDeliveryEntity` | `webhook_deliveries` | `wdl_` | Stores every outbound webhook attempt |

## Seed Data

Applied automatically on startup and on `POST /admin/seed`. Idempotent.

**Payment methods:** `pam_debicheck_absa` (DEBICHECK), `pam_eft_absa` (DEBIT_ORDER)

**Lookups (banks):** ABSA_BANK_LIMITED (632005), STANDARD_BANK (051001), FNB (250655), NEDBANK (198765) — linked to both payment methods.

**Test customer:** `cus_test_001` — MRS YANDI DEED, ID `8411180614084`

## Filtering

### `GET /1.0/customers/list`
Query params (exact-match): `id`, `reference`, `email`, `customer_email`, `id_number`, `customer_id_number`, `contact_number`, `customer_status`

### `GET /1.0/bank-accounts/list`
Query params (exact-match): `id`, `customers_id`, `bank_account_number`, `bank_name`, `bank_branch_code`, `reference`, `status`

## CDV Behaviour

By default all accounts pass (`passed: true`). `bank_branch_code` accepts both `string` and `number` input; always returned as `string`.

Set `CDV_FAIL_UNKNOWN=true` (or `POST /admin/scenario { "cdvFailUnknown": true }`) to only pass known test accounts:

| Bank | Branch | Account | Result |
|---|---|---|---|
| ABSA | 632005 | any | pass |
| Standard Bank | 051001 | 10004301100 | pass |
| FNB | 250655 | 62001872440 | pass |
| anything else | — | — | fail |

## Webhook Delivery

`WebhookDeliveryService` (`src/webhook-delivery/`) centralises all outbound webhook logic:
- Builds auth headers (Basic, api-key, hmac) from `mockConfig` or per-call `auth_override`
- Stores every attempt in `webhook_deliveries` table (success and failures)
- Exposed via `/admin/data` under `webhook_deliveries` key
- Replay any past delivery: `POST /admin/webhook/replay/:deliveryId`

Automatic webhook delivery fires when a `notify_url` is present on the entity, or when `mockConfig.defaultNotifyUrl` is set via scenario:

| Action | Event type |
|---|---|
| `payments/submit` | `MANDATE_UPDATED` (PENDING) + `PAYMENT_STATUS` (RUNNING) |
| `payments/status/:id/:status` | `PAYMENT_STATUS` |
| `mandates/debicheck/update/cancel` | `MANDATE_UPDATED` (CANCELLED) |
| `checkout/:id/complete` | `CHECKOUT_COMPLETED` |
| `checkout/:id/fail` | `CHECKOUT_COMPLETED` (FAILED) |
| `checkout/:id/save-card` | `CHECKOUT_COMPLETED` (CARD_SAVED) |

## Runtime Scenario Controls

`POST /admin/scenario` updates flags without restart. `GET /admin/scenario` reads current state.

```json
{
  "authMode": "loose",
  "cdvFailUnknown": false,
  "avsFailUnknown": false,
  "defaultNotifyUrl": "http://localhost:3006/webhook/kwik/<company-uuid>",
  "webhookAuthMode": "basic",
  "webhookAccessKey": "test_key",
  "webhookAccessSecret": "test_secret"
}
```

`mockConfig` singleton (`src/common/mock-config.ts`) holds these overrides; falls back to env vars when not overridden at runtime.

## Auth Modes

Controlled by `MOCK_AUTH_MODE` env var or `mockConfig.authMode`:
- **`loose`** (default) — any valid `key:secret` Basic header or `x-kwik-api-key` header accepted
- **`strict`** — credentials must match `MOCK_ACCESS_KEY` / `MOCK_ACCESS_SECRET`

Returns Kwik-like 401 on failure: `{ status: false, error_code: "001", error_message: "Invalid API key provided." }`

## E2E Test Script

Two modes:

```bash
# Mock-only — no Jobix services required
MOCK_ONLY=true ./scripts/test-jobix-kwik-e2e.sh

# Full Jobix e2e — requires running jb-application-be, jb-inner-api, and a valid JWT
JOBIX_AUTH_TOKEN=<bearer_token> \
JOBIX_CUSTOMER_UUID=<contact_uuid> \
JOBIX_COMPANY_UUID=<company_uuid> \
./scripts/test-jobix-kwik-e2e.sh
```

**Required env vars for full e2e** (script exits immediately if missing unless `MOCK_ONLY=true`):
- `JOBIX_AUTH_TOKEN` — Bearer token for `jb-application-be`
- `JOBIX_CUSTOMER_UUID` — UUID of an existing contact/customer in jb-contacts-service
- `JOBIX_COMPANY_UUID` — UUID of the company for inner-api webhook targeting

**Optional env vars**: `JOBIX_BFF_URL` (default `http://localhost:3000`), `JOBIX_INNER_API_URL` (default `http://localhost:3006`), `KWIK_MOCK_URL` (default `http://localhost:3099`), `KWIK_ACCESS_KEY`, `KWIK_ACCESS_SECRET`.

**Full e2e flow**: reset → verify mock → verify BFF `/profile` → all 7 BFF Kwik actions via `POST /kwik/test-action` → checkout page → complete checkout (unauthenticated) → submit payment → mark PAID → cancel mandate → replay webhook → scenario controls → admin reset.

**Mock-only flow**: same as above but calls mock endpoints directly; BFF actions are skipped. Does not print "ALL PASSED" — prints "MOCK CHECKS PASSED" instead.

## Manual Webhook Fire

```bash
curl -X POST http://localhost:3099/admin/webhook/fire \
  -H "Content-Type: application/json" \
  -d '{
    "target_url": "http://localhost:3006/webhook/kwik/<companyUuid>",
    "event_type": "MANDATE_UPDATED",
    "payload": {
      "kwik_mandate_id": "man_abc123",
      "kwik_customer_id": "cus_test_001",
      "mandate_status": "ACCEPTED",
      "status": "ACCEPTED",
      "amount": "500.00"
    },
    "auth": { "access_key": "test_key", "access_secret": "test_secret" }
  }'
```

## Tests

```bash
pnpm test          # 143 tests across 12 spec files
pnpm test:cov      # with coverage
```

Key test files:
- `test/webhook-delivery.service.spec.ts` — deliver/replay/auth modes/event_id generation
- `test/payments.service.spec.ts` — validation + webhook delivery on submit/status change
- `test/checkout.service.spec.ts` — complete/fail/save-card + webhook delivery
- `test/mandates.service.spec.ts` — cancel cascade + webhook delivery
- `test/admin.service.spec.ts` — fireWebhook/replayWebhook/getAllData/resetData/scenario
- `test/cdv.service.spec.ts` — CDV_FAIL_UNKNOWN via env and mockConfig; string/number branch code
- `test/bank-accounts.service.spec.ts` — create/update logic, NotFoundException on unknown ID

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3099` | HTTP port |
| `MOCK_BASE_URL` | `http://localhost:3099` | Used to build `page_url` in checkout sessions |
| `MOCK_AUTH_MODE` | `loose` | `loose` or `strict` |
| `MOCK_ACCESS_KEY` | — | Required credential in strict mode |
| `MOCK_ACCESS_SECRET` | — | Required credential in strict mode |
| `CDV_FAIL_UNKNOWN` | `false` | If `true`, only known test accounts pass CDV |
| `AVS_FAIL_UNKNOWN` | `false` | If `true`, only known accounts pass AVS |
| `MOCK_DEFAULT_NOTIFY_URL` | — | Default webhook target for all payment events |
| `MOCK_WEBHOOK_AUTH_MODE` | `basic` | `basic`, `api-key`, `hmac`, or `none` |
| `MOCK_WEBHOOK_ACCESS_KEY` | `test_key` | Webhook outbound auth key |
| `MOCK_WEBHOOK_ACCESS_SECRET` | `test_secret` | Webhook outbound auth secret |
| `MOCK_WEBHOOK_HMAC_SECRET` | — | HMAC signing secret (when mode=hmac) |

## Key Conventions

- **Error format** matches real Kwik API: `{ status: false, error_code: "001"|"002"|"007", error_message: "..." }`
- **Success format**: `{ status: true, <resource>: [...] }` for lists, `{ status: true, <resource>: {...} }` for singles
- **IDs**: `{prefix}_{16 hex chars}` via `genId()` in `src/common/gen-id.util.ts`
- **Checkout UI routes** are excluded from the `/1.0/` global prefix via `setGlobalPrefix` exclude rules in `main.ts`
- **mockConfig** (`src/common/mock-config.ts`) is a module-level singleton — not a NestJS injectable. Guards and services read it directly without DI wiring.
- **WebhookDeliveryModule** is non-global; explicitly imported by checkout, payments, mandates, and admin modules
- **bank_branch_code** normalisation: accepts `string | number` input, always stored and returned as `string`
- **Admin reset**: default preserves `cus_test_001` via `customerRepo.delete({ id: Not('cus_test_001') })`; `?all=true` wipes everything and re-seeds
