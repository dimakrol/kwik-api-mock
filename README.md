# kwik-api-mock

Local mock of the [Kwik](https://kwik.co.za) payment API for Jobix integration testing. Use it instead of Kwik staging when developing **jb-application-be**, **jb-flow-engine**, and **jb-inner-api**.

## Quick start

```bash
pnpm install
cp .env.example .env   # optional — edit MOCK_DEFAULT_COMPANY_UUID
pnpm start:dev
```

| URL | Purpose |
|-----|---------|
| http://localhost:3099/docs | Swagger (Kwik `/1.0/*` routes) |
| http://localhost:3099/interface | Dev dashboard (data, webhooks, scenario) |
| http://localhost:3099/1.0 | Kwik API base (Basic auth) |

Point consumers at the mock:

```bash
KWIK_API_BASE_URL=http://localhost:3099/1.0
```

Default API credentials (loose mode): any `key:secret` in Basic auth, or set strict mode — see [Environment variables](#environment-variables).

## Web dashboard

Open **http://localhost:3099/interface** (redirects to `/interface/overview`). Routes use the browser history API:

| Path | Screen |
|------|--------|
| `/interface/overview` | Counters and reset actions |
| `/interface/records/:type` | Browse DB tables (`payments`, `customers`, …) |
| `/interface/webhooks` | Delivery log |
| `/interface/sender` | Manual webhook fire |
| `/interface/scenario` | Runtime flags |
| `/interface/raw` | Full JSON dump |

Features:

- Browse and **delete** individual rows (button per record; calls `DELETE /admin/records/:resource/:id`)
- Inspect **webhook delivery** history (success and failures)
- Fire or replay webhooks manually
- Tune **scenario** flags (auth, CDV, default company UUID, webhook URL template)

## Payment webhooks (important)

Payment-related webhooks (`MANDATE_UPDATED`, `PAYMENT_STATUS`) are sent when the mock can resolve a **target URL**:

1. **`payment.notify_url`** on submit (or `webhook_url` / `callback_url` aliases), or  
2. **Default template** — `http://localhost:3005/v1/webhook/kwik/{companyUuid}` — with `{companyUuid}` filled from:
   - `payment.company_uuid` (submit body field `company_uuid`), or  
   - **`MOCK_DEFAULT_COMPANY_UUID`** / dashboard **defaultCompanyUuid**

If both `notify_url` and company UUID are missing, **no webhook is sent** (you will not see rows under Webhook deliveries).

### Finish a payment and receive a webhook

```bash
# 1) Set your Jobix company UUID (from Postgres `companies.uuid` or jb-inner-api config)
export MOCK_DEFAULT_COMPANY_UUID="<your-company-uuid>"

# 2) Submit a payment (Basic auth)
curl -u test_key:test_secret -X POST http://localhost:3099/1.0/payments/submit \
  -H "Content-Type: application/json" \
  -d '{
    "customers_id": "cus_test_001",
    "bank_accounts_id": "<bac_id from dashboard>",
    "payment_methods_id": "pam_debicheck_absa",
    "amount": "500.00"
  }'

# 3) Complete it → PAYMENT_STATUS (PAID) webhook to jb-inner-api
curl -u test_key:test_secret -X POST http://localhost:3099/1.0/payments/<pay_id>/complete
```

Or use the **Complete** button on RUNNING payments in the dashboard (after saving **defaultCompanyUuid** in Settings).

Ensure **jb-inner-api** listens on port **3005** with route `POST /v1/webhook/kwik/:companyUuid` if you want a green delivery; failed HTTP attempts are still stored in the mock DB.

Admin alternative (no Basic auth):

```bash
curl -X POST http://localhost:3099/admin/payments/<pay_id>/complete \
  -H "Content-Type: application/json" \
  -d '{"company_uuid":"<your-company-uuid>"}'
```

Response includes `webhook_delivered` and `webhook_target_url`.

## API overview

### Kwik API — `/1.0/*` (authenticated)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/payment-methods` | Seeded payment methods |
| GET | `/lookups/:type[/:payment_methods_id]` | Bank lookups |
| POST | `/cdv` | Account validation |
| POST | `/avs-r` | AVS verification |
| GET/POST | `/customers/list`, `/customers/create` | Customers |
| GET/POST | `/bank-accounts/list`, `create`, `update` | Bank accounts |
| POST | `/checkout/page` | Create checkout session |
| POST | `/payments/submit` | Create payment + mandate |
| POST | `/payments/:id/complete` | Mark PAID + webhook |
| POST | `/payments/status/:id/:status` | Update status + webhook |
| POST | `/mandates/debicheck/update/cancel` | Cancel mandate |

### Checkout UI — no prefix, no auth

| Method | Path |
|--------|------|
| GET | `/checkout/:id` |
| POST | `/checkout/:id/complete`, `/fail`, `/save-card` |

### Admin — `/admin/*`, no auth

Data dump, reset, seed, scenario flags, manual webhook fire/replay, payment complete, **per-record delete**. See Swagger or `CLAUDE.md` for the full list.

```bash
# Delete one payment (cascades linked mandate)
curl -X DELETE http://localhost:3099/admin/records/payments/pay_xxx
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3099` | HTTP port |
| `LOG_LEVEL` | `info` | Pino log level (`debug` in dev) |
| `MOCK_BASE_URL` | `http://localhost:3099` | Base URL for checkout `page_url` |
| `MOCK_AUTH_MODE` | `loose` | `loose` or `strict` |
| `MOCK_ACCESS_KEY` / `MOCK_ACCESS_SECRET` | — | Required in strict mode |
| `MOCK_DEFAULT_COMPANY_UUID` | — | Fallback `{companyUuid}` for payment webhooks |
| `MOCK_DEFAULT_NOTIFY_URL` | built-in template | Override webhook URL template |
| `MOCK_WEBHOOK_AUTH_MODE` | `basic` | Outbound webhook auth: `basic`, `api-key`, `hmac`, `none` |
| `MOCK_WEBHOOK_ACCESS_KEY` | `test_key` | Webhook auth key |
| `MOCK_WEBHOOK_ACCESS_SECRET` | `test_secret` | Webhook auth secret |
| `CDV_FAIL_UNKNOWN` | `false` | Restrict CDV to known test accounts |
| `AVS_FAIL_UNKNOWN` | `false` | Restrict AVS to known test accounts |

Built-in notify URL template (when env unset):

`http://localhost:3005/v1/webhook/kwik/{companyUuid}`

## Scripts

```bash
pnpm test              # unit tests
pnpm test:cov          # coverage
pnpm build             # production build

# E2E against mock only
MOCK_ONLY=true ./scripts/test-jobix-kwik-e2e.sh

# Full stack (needs BFF token + customer + company UUID)
JOBIX_AUTH_TOKEN=... JOBIX_CUSTOMER_UUID=... JOBIX_COMPANY_UUID=... \
  ./scripts/test-jobix-kwik-e2e.sh
```

## Data & persistence

- SQLite file: `kwik-mock.sqlite` (git-ignored, created on first run)
- Seed data: 2 payment methods, bank lookups, test customer `cus_test_001`
- Reset transactional data: `DELETE http://localhost:3099/admin/reset` (`?all=true` wipes everything and re-seeds)

## Development

See **[CLAUDE.md](./CLAUDE.md)** for architecture, conventions, test layout, and agent-oriented reference.

```bash
pnpm start:dev    # watch mode
pnpm lint         # ESLint
```

## Related services

| Service | Role |
|---------|------|
| `jb-application-be` | BFF; `KWIK_API_BASE_URL` → mock |
| `jb-inner-api` | Receives webhooks at `/v1/webhook/kwik/:companyUuid` |
| `jb-flow-engine` | Kwik flow nodes call mock via BFF/inner routing |
