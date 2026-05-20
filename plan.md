# Plan: Kwik API Mock Server

## Context

The project has a Kwik payment integration implemented across three services:
- `jb-application-be` — calls Kwik API for 7 actions (payment methods, banks, CDV, customers, bank accounts)
- `jb-flow-engine` — same calls via Kwik payment node
- `jb-inner-api` — receives Kwik webhooks at `POST /webhook/kwik/:companyUuid`

We need a NestJS + SQLite mock server in `/Users/d.krol/Projects/jobix/kwik-api-mock` to test the full integration without hitting the real Kwik API.

---

## Tech Stack
- **NestJS 10** with `@nestjs/platform-express`
- **TypeORM** + **better-sqlite3** for persistence (`synchronize: true`)
- **@nestjs/swagger** for API docs at `/docs`
- Port: **3099** (configurable via `PORT` env)
- All Kwik endpoints served under `/1.0/` path prefix

## Auth
- `BasicAuthGuard` on all `/1.0/*` routes
- Accepts any non-empty valid Basic Auth header (trusts any key:secret pair)
- Returns `{ status: false, error_code: "001" }` with HTTP 401 if missing/malformed

---

## Endpoints

### Kwik API (`/1.0/*`, Basic Auth required)

| Method | Path | Description |
|---|---|---|
| GET | `/1.0/payment-methods` | List all payment methods |
| GET | `/1.0/lookups/:type/:payment_methods_id?` | Lookup banks / account types / etc. |
| POST | `/1.0/cdv` | Validate bank account (CDV) |
| POST | `/1.0/avs-r` | Account owner verification (always passes) |
| GET | `/1.0/customers/list` | List all customers |
| POST | `/1.0/customers/create` | Create customer |
| GET | `/1.0/bank-accounts/list` | List all bank accounts |
| POST | `/1.0/bank-accounts/create` | Create bank account |
| POST | `/1.0/bank-accounts/update` | Update bank account |
| POST | `/1.0/checkout/page` | Create checkout page session |
| POST | `/1.0/payments/submit` | Submit payment (creates mandate + payment) |
| POST | `/1.0/payments/status/:paymentsId/:status` | Update payment status |
| POST | `/1.0/mandates/debicheck/update/cancel` | Cancel a mandate |

### Admin API (`/admin/*`, no auth)

| Method | Path | Description |
|---|---|---|
| POST | `/admin/webhook/fire` | Fire a webhook to a target URL |
| GET | `/admin/data` | Dump all DB state |
| DELETE | `/admin/reset` | Wipe customers, bank accounts, payments, mandates |

---

## Seed Data (auto on startup, idempotent)

- 2 payment methods: DebiCheck/ABSA and EFT/ABSA
- Banks as lookups: ABSA (632005), Standard Bank (051001), FNB (250655), Nedbank (198765)
- 1 test customer: MRS YANDI DEED, ID 8411180614084

## CDV Behaviour
- Known test ABSA account `10004291601` branch `632005` → `passed: true`
- All other accounts → `passed: true` by default; set `CDV_FAIL_UNKNOWN=true` to fail unknown

---

## Webhook Fire Body

```json
{
  "target_url": "http://localhost:3001/webhook/kwik/company-uuid",
  "event_type": "MANDATE_UPDATED",
  "payload": { "kwik_mandate_id": "man_xxx", "status": "ACCEPTED", "amount": "500.00" },
  "auth": { "access_key": "test_key", "access_secret": "test_secret" }
}
```

---

## Verification

1. `pnpm install && pnpm start:dev` → server on port 3099
2. `curl -H "Authorization: Basic dGVzdDp0ZXN0" http://localhost:3099/1.0/payment-methods` → 200
3. Set `KWIK_API_BASE_URL=http://localhost:3099/1.0` in jb-application-be / jb-flow-engine env
4. Swagger at `http://localhost:3099/docs`
