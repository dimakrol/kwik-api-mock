# CLAUDE.md — kwik-api-mock

NestJS + SQLite mock server for the [Kwik](https://kwik.co.za) payment API. Used for local integration testing of `jb-application-be`, `jb-flow-engine`, and `jb-inner-api` without hitting real Kwik staging.

## Commands

```bash
pnpm install
pnpm start:dev       # watch mode, port 3099
pnpm build           # compiles to dist/ via tsconfig.build.json
pnpm test            # Jest unit tests (~164 tests, 15 spec files)
pnpm test:cov        # test + coverage report
pnpm lint            # ESLint
```

Point consuming services at the mock:

```
KWIK_API_BASE_URL=http://localhost:3099/1.0
```

| URL | Purpose |
|-----|---------|
| `http://localhost:3099/docs` | Swagger UI |
| `http://localhost:3099/interface` | Dev dashboard (records, webhooks, scenario) |

Human-oriented setup: see **[README.md](./README.md)**.

## Architecture

Single NestJS app. No Kafka, no Redis. SQLite (`kwik-mock.sqlite`, git-ignored) via TypeORM `synchronize: true`.

```
src/
  main.ts                      # bootstrap — global prefix /1.0; excludes /admin/*, /checkout/*, /interface/*
  app.module.ts                # root module, TypeORM (better-sqlite3)
  common/
    basic-auth.guard.ts        # Basic / x-kwik-api-key; reads mockConfig.authMode
    gen-id.util.ts             # genId('cus') → "cus_<16 hex>"
    mock-config.ts             # runtime-mutable scenario flags (env fallback)
    resolve-payment-notify-url.util.ts  # payment notify_url + {companyUuid} template
    logging/                   # Pino HTTP interceptor, outbound webhook logging
  database/entities/           # 8 TypeORM entities
  seed/seed.service.ts         # onModuleInit + POST /admin/seed
  webhook-delivery/            # WebhookDeliveryService — all outbound webhooks
  payment-methods/ lookups/ cdv/ avs/ customers/ bank-accounts/
  payments/                    # submit, status, complete
  checkout/                    # page + HTML UI routes
  mandates/                    # debicheck cancel
  admin/                       # /admin/* — no auth
  interface/                   # static dashboard at / and /interface
test/                          # Jest specs per service/util
scripts/test-jobix-kwik-e2e.sh # mock-only or full Jobix e2e
```

Feature modules: `*.module.ts` / `*.controller.ts` / `*.service.ts`.

**Global prefix:** `/1.0` for Kwik routes. Excluded: `/admin/*`, `/checkout/*`, `/`, `/interface`, `/docs`.

## API Layers

### Kwik API (`/1.0/*`)

Requires `Authorization: Basic <base64(key:secret)>` or `x-kwik-api-key` (`MOCK_AUTH_MODE`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/1.0/payment-methods` | 2 seeded methods |
| GET | `/1.0/lookups/:type[/:pam_id]` | Bank names per payment method |
| POST | `/1.0/cdv` | CDV validation |
| POST | `/1.0/avs-r` | AVS verification |
| GET | `/1.0/customers/list` | List (exact-match query filters) |
| POST | `/1.0/customers/create` | `{ records: [...] }` |
| GET/POST | `/1.0/bank-accounts/list`, `create`, `update` | Bank accounts |
| POST | `/1.0/checkout/page` | Checkout session + `page_url` |
| POST | `/1.0/payments/submit` | Payment + mandate; optional webhooks |
| POST | `/1.0/payments/:paymentsId/complete` | PAID + mandate ACTIVE + `PAYMENT_STATUS` webhook |
| POST | `/1.0/payments/status/:id/:status` | Status update + webhook |
| POST | `/1.0/mandates/debicheck/update/cancel` | Cancel mandate; stop payment; webhook |

**`payments/submit` body aliases:** `notify_url`, `webhook_url`, `callback_url`; **`company_uuid`** stored on payment for webhook URL resolution.

**`payments/complete` body (optional):** `{ "company_uuid": "..." }` — persisted on payment if missing, then webhook fired.

### Checkout UI (no `/1.0/`, no auth)

| Method | Path |
|--------|------|
| GET | `/checkout/:id` |
| POST | `/checkout/:id/complete`, `/fail`, `/save-card` |

Uses `session.notify_url` or `mockConfig.defaultNotifyUrl` (not payment `resolvePaymentNotifyUrl`).

### Admin API (`/admin/*`, no auth)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/admin/webhook/fire` | Fire webhook to arbitrary URL |
| POST | `/admin/webhook/replay/:deliveryId` | Replay stored delivery |
| POST | `/admin/payments/:paymentsId/complete` | Same as Kwik complete; optional `company_uuid` body |
| DELETE | `/admin/records/:resource/:id` | Delete one row (see Web interface) |
| GET | `/admin/data` | Full DB dump + `webhook_deliveries` + scenario |
| GET | `/admin/interface-data` | Dashboard aggregate `{ data, summary }` |
| DELETE | `/admin/reset` | Clear transactional data; `?all=true` re-seeds |
| POST | `/admin/seed` | Re-run seed |
| GET/POST | `/admin/scenario` | Read/update runtime flags |

### Web interface

Static assets: `src/interface/static/` — served at `/` and `/interface/*` (excluded from `/1.0` prefix).

**Client-side routes** (History API): `/interface/overview`, `/interface/records/:recordType`, `/interface/webhooks`, `/interface/sender`, `/interface/scenario`, `/interface/raw`. Deep links return `index.html` from explicit Nest routes in `InterfaceController`.

**Delete records:** `DELETE /admin/records/:resource/:id` — resources: `payment_methods`, `lookups`, `customers`, `bank_accounts`, `payments`, `mandates`, `checkout_sessions`, `webhook_deliveries`. Cascades: payment → mandates; customer → bank accounts, payments, mandates, checkouts; payment_method → lookups.

## Data Model

| Entity | Table | ID prefix | Notes |
|--------|-------|-----------|-------|
| `PaymentMethodEntity` | `payment_methods` | `pam_` | Seeded |
| `LookupEntity` | `lookups` | `loo_` | Seeded |
| `CustomerEntity` | `customers` | `cus_` | API-created |
| `BankAccountEntity` | `bank_accounts` | `bac_` | API-created |
| `PaymentEntity` | `payments` | `pay_` | `notify_url`, **`company_uuid`**, `status` |
| `MandateEntity` | `mandates` | `man_` | Linked to payment |
| `CheckoutSessionEntity` | `checkout_sessions` | `cho_` | `notify_url`, `card_id` |
| `WebhookDeliveryEntity` | `webhook_deliveries` | `wdl_` | Every outbound attempt |

## Payment webhook URL resolution

`resolvePaymentNotifyUrl()` in `src/common/resolve-payment-notify-url.util.ts`:

1. `payment.notify_url` if set  
2. Else template: `mockConfig.defaultNotifyUrl` ?? env `MOCK_DEFAULT_NOTIFY_URL` ??  
   `http://localhost:3005/v1/webhook/kwik/{companyUuid}`  
3. Substitute `{companyUuid}` from `payment.company_uuid` ?? `mockConfig.defaultCompanyUuid` ?? env `MOCK_DEFAULT_COMPANY_UUID`  
4. If placeholder remains unresolved → **null** → webhook skipped (warn logged in `PaymentsService`)

Used by: `payments/submit`, `payments/status`, `payments/complete`.

**Complete response fields:** `webhook_delivered`, `webhook_target_url`, `company_uuid`.

## Webhook Delivery

`WebhookDeliveryService` (`src/webhook-delivery/`):

- Auth headers from `mockConfig` or `auth_override` (Basic, api-key, hmac)
- Pino logging via `OutboundLogService` for outbound POSTs
- HTTP interceptor logs inbound requests
- All attempts stored in `webhook_deliveries` (success and failure)

| Action | Event type |
|--------|------------|
| `payments/submit` | `MANDATE_UPDATED` (PENDING) + `PAYMENT_STATUS` (RUNNING) |
| `payments/status/:id/:status` | `PAYMENT_STATUS` |
| `payments/:id/complete` | `PAYMENT_STATUS` (PAID) |
| `mandates/debicheck/update/cancel` | `MANDATE_UPDATED` (CANCELLED) |
| `checkout/:id/complete` | `CHECKOUT_COMPLETED` |
| `checkout/:id/fail` | `CHECKOUT_COMPLETED` (FAILED) |
| `checkout/:id/save-card` | `CHECKOUT_COMPLETED` (CARD_SAVED) |

Payload includes `event_type` and `event_id` in the JSON body sent to the target.

**jb-inner-api target (typical):** `POST http://localhost:3005/v1/webhook/kwik/<companyUuid>`

## Runtime Scenario Controls

`POST /admin/scenario` — no restart required.

```json
{
  "authMode": "loose",
  "cdvFailUnknown": false,
  "avsFailUnknown": false,
  "defaultCompanyUuid": "<company-uuid>",
  "defaultNotifyUrl": "http://localhost:3005/v1/webhook/kwik/{companyUuid}",
  "webhookAuthMode": "basic",
  "webhookAccessKey": "test_key",
  "webhookAccessSecret": "test_secret",
  "webhookHmacSecret": ""
}
```

`mockConfig` (`src/common/mock-config.ts`) is a module singleton (not Nest injectable).

## Auth Modes

`MOCK_AUTH_MODE` / `mockConfig.authMode`:

- **`loose`** (default) — any valid Basic or `x-kwik-api-key`
- **`strict`** — must match `MOCK_ACCESS_KEY` / `MOCK_ACCESS_SECRET`

401: `{ status: false, error_code: "001", error_message: "Invalid API key provided." }`

## CDV / AVS

**CDV:** `CDV_FAIL_UNKNOWN=true` or scenario `cdvFailUnknown` — only known test accounts pass (see README / prior docs for branch codes).

**AVS:** `AVS_FAIL_UNKNOWN` / `avsFailUnknown` — same pattern.

## Seed Data

On startup + `POST /admin/seed` (idempotent):

- Methods: `pam_debicheck_absa`, `pam_eft_absa`
- Banks: ABSA, Standard, FNB, Nedbank
- Customer: `cus_test_001`

## Filtering

**`GET /1.0/customers/list`:** `id`, `reference`, `email`, `customer_email`, `id_number`, `customer_id_number`, `contact_number`, `customer_status`

**`GET /1.0/bank-accounts/list`:** `id`, `customers_id`, `bank_account_number`, `bank_name`, `bank_branch_code`, `reference`, `status`

## E2E Test Script

```bash
MOCK_ONLY=true ./scripts/test-jobix-kwik-e2e.sh

JOBIX_AUTH_TOKEN=<bearer> \
JOBIX_CUSTOMER_UUID=<contact_uuid> \
JOBIX_COMPANY_UUID=<company_uuid> \
./scripts/test-jobix-kwik-e2e.sh
```

**Full e2e requires:** `JOBIX_AUTH_TOKEN`, `JOBIX_CUSTOMER_UUID`, `JOBIX_COMPANY_UUID` (unless `MOCK_ONLY=true`).

**Optional:** `JOBIX_BFF_URL`, `JOBIX_INNER_API_URL`, `KWIK_MOCK_URL`, `KWIK_ACCESS_KEY`, `KWIK_ACCESS_SECRET`.

## Tests

```bash
pnpm test
```

Notable specs:

- `test/resolve-payment-notify-url.util.spec.ts` — URL template + company UUID fallback
- `test/payments.service.spec.ts` — submit, status, complete, webhooks
- `test/webhook-delivery.service.spec.ts` — deliver, replay, auth modes
- `test/checkout.service.spec.ts`, `test/mandates.service.spec.ts`
- `test/admin.service.spec.ts` — admin + scenario (mock `PaymentsService`)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3099` | HTTP port |
| `LOG_LEVEL` | `info` | Pino level |
| `MOCK_BASE_URL` | `http://localhost:3099` | Checkout `page_url` base |
| `MOCK_AUTH_MODE` | `loose` | `loose` or `strict` |
| `MOCK_ACCESS_KEY` / `MOCK_ACCESS_SECRET` | — | Strict mode credentials |
| `CDV_FAIL_UNKNOWN` | `false` | Restrict CDV passes |
| `AVS_FAIL_UNKNOWN` | `false` | Restrict AVS passes |
| `MOCK_DEFAULT_COMPANY_UUID` | — | Fallback for `{companyUuid}` on payments |
| `MOCK_DEFAULT_NOTIFY_URL` | built-in template | Override notify URL template |
| `MOCK_WEBHOOK_AUTH_MODE` | `basic` | `basic`, `api-key`, `hmac`, `none` |
| `MOCK_WEBHOOK_ACCESS_KEY` | `test_key` | Outbound webhook key |
| `MOCK_WEBHOOK_ACCESS_SECRET` | `test_secret` | Outbound webhook secret |
| `MOCK_WEBHOOK_HMAC_SECRET` | — | HMAC secret when mode=hmac |

Built-in template when `MOCK_DEFAULT_NOTIFY_URL` unset:

`http://localhost:3005/v1/webhook/kwik/{companyUuid}`

## Key Conventions

- **Errors:** `{ status: false, error_code: "001"|"002"|"007", error_message: "..." }`
- **Success:** `{ status: true, <resource>: ... }`
- **IDs:** `{prefix}_{16 hex}` via `genId()`
- **Checkout routes** excluded from `/1.0` in `main.ts`
- **mockConfig** — module singleton; guards/services import directly
- **WebhookDeliveryModule** — imported by checkout, payments, mandates, admin
- **bank_branch_code** — accepts string or number; stored/returned as string
- **Admin reset** — preserves `cus_test_001` unless `?all=true`
- **PaymentsModule** exports `PaymentsService` for `AdminModule`
