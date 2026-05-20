# Implementation Prompt: Basic Web Interface for Kwik API Mock

## Context

Repository: `/Users/d.krol/Projects/jobix/kwik-api-mock`

This project is a NestJS + SQLite mock server for Kwik payment API. It is used to test Jobix Kwik integration locally without relying on the real Kwik stage/production environment.

The mock already exposes API endpoints for:

- payment methods
- lookups/banks
- CDV / AVS-R
- customers
- bank accounts
- checkout pages
- payments
- mandates
- admin data dump
- webhook delivery/replay
- runtime scenario config

The goal is to add a simple visual interface, similar in spirit to the developer/admin parts of `https://app.kwik.co.za/`, but only with the minimal functionality needed for local Jobix testing.

No authentication is required for this interface.

## Goal

Build a basic browser UI served by the existing mock app that allows a developer to:

1. View mock data stored in SQLite.
2. Inspect incoming/outgoing webhook delivery attempts.
3. Configure the default webhook target URL and webhook auth mode.
4. Manually fire Kwik webhook events to Jobix `jb-inner-api`.
5. Replay previous webhook deliveries.
6. Reset/reseed mock data.
7. Quickly copy IDs and payloads needed for Jobix flow testing.

The interface should be practical, dense, and test-focused. It is not a marketing page.

## Preferred Implementation

Use the existing NestJS app. Keep the implementation small.

Recommended approach:

- Add static HTML/CSS/JS served by NestJS.
- No React/Vite unless it is already required for a clean implementation.
- Use plain TypeScript/JavaScript frontend code.
- Serve UI at:

```text
GET /
GET /interface
```

- Keep existing Swagger/docs behavior working.
- Use the existing admin APIs where possible:

```text
GET    /admin/data
GET    /admin/scenario
POST   /admin/scenario
POST   /admin/webhook/fire
POST   /admin/webhook/replay/:deliveryId
DELETE /admin/reset
POST   /admin/seed
```

If existing endpoints are insufficient, add small admin endpoints rather than duplicating business logic.

## Pages / Sections

Implement a single-page dashboard with sections/tabs:

1. Overview
2. Accounts / Records
3. Webhooks
4. Event Sender
5. Scenario Settings
6. Raw Data

### 1. Overview

Show compact counters:

- payment methods count
- customers count
- bank accounts count
- payments count
- mandates count
- checkout sessions count
- webhook deliveries count
- successful deliveries count
- failed deliveries count

Show current scenario:

- `authMode`
- `cdvFailUnknown`
- `avsFailUnknown`
- `defaultNotifyUrl`
- `webhookAuthMode`
- `webhookAccessKey`
- whether `webhookAccessSecret` is set
- whether `webhookHmacSecret` is set

Add buttons:

- Refresh
- Re-seed
- Reset transactional data
- Reset all and re-seed

### 2. Accounts / Records

This is a read-only data browser for mock records.

Add tables for:

- Payment Methods
- Lookups / Banks
- Customers
- Bank Accounts
- Payments
- Mandates
- Checkout Sessions

Requirements:

- Each table should support text search/filter on client side.
- Each table should show compact key columns first.
- Each row should have:
  - Copy ID button.
  - Expand/collapse JSON details.

Important fields to show:

Payment methods:

- `id`
- `name`
- `payment_method_type`
- `status`

Customers:

- `id`
- `reference`
- `person_name`
- `person_surname`
- `email`
- `contact_number`
- `customer_status`

Bank accounts:

- `id`
- `customers_id`
- `bank_account_number`
- `bank_account_type`
- `bank_name`
- `bank_branch_code`
- `status`

Payments:

- `id`
- `mandate_id`
- `customers_id`
- `bank_accounts_id`
- `payment_methods_id`
- `amount`
- `status`
- `notify_url`

Mandates:

- `id`
- `customers_id`
- `bank_accounts_id`
- `payment_methods_id`
- `amount`
- `status`

Checkout sessions:

- `id`
- `customers_id`
- `amount`
- `mode`
- `page_url`
- `status`
- `notify_url`

### 3. Webhooks

Show webhook delivery history from `webhook_deliveries`.

Columns:

- `created_at`
- `id`
- `event_id`
- `event_type`
- `target_url`
- `response_status`
- `success`
- `error`

Row actions:

- Replay delivery.
- Copy request body.
- Copy request headers.
- Copy response body.
- Expand/collapse full request/response JSON.

Filters:

- event type
- success/failure/all
- target URL search
- event ID search

Add a visual status badge:

- success: green
- failed: red
- pending/unknown status 0: gray/yellow

### 4. Event Sender

This is the most important section.

Add a form that sends webhooks using:

```text
POST /admin/webhook/fire
```

Form fields:

- Target URL
- Event type
- Auth mode
- Access key
- Access secret
- HMAC secret if supported by backend scenario
- Payload editor

Target URL helpers:

- Input field for Jobix company UUID.
- One-click build target URL:

```text
http://localhost:3005/v1/webhook/kwik/{companyUuid}
```

- One-click stage URL template:

```text
https://inner-api-stage.jobix.ai/v1/webhook/kwik/{companyUuid}
```

Event type options:

- `MANDATE_UPDATED`
- `CHECKOUT_COMPLETED`
- `PAYMENT_STATUS`
- `bank_account.created`
- `checkout.completed`
- `checkout.expired`
- `checkout.failed`
- `customer.created`
- `customer.updated`
- `mandate.created`
- `mandate.updated`
- `payment.created`
- `payment.updated`
- `transaction.created`
- `transaction.updated`

Payload templates:

#### MANDATE_UPDATED

```json
{
  "kwik_mandate_id": "man_xxx",
  "mandate_id": "man_xxx",
  "kwik_payment_id": "pay_xxx",
  "payments_id": "pay_xxx",
  "kwik_customer_id": "cus_xxx",
  "customers_id": "cus_xxx",
  "mandate_status": "ACTIVE",
  "status": "ACTIVE"
}
```

#### CHECKOUT_COMPLETED

```json
{
  "checkout_id": "cho_xxx",
  "kwik_customer_id": "cus_xxx",
  "customers_id": "cus_xxx",
  "kwik_payment_id": "pay_xxx",
  "payments_id": "pay_xxx",
  "card_id": "card_xxx",
  "amount": "100.00",
  "payment_status": "PAID",
  "status": "PAID"
}
```

#### PAYMENT_STATUS

```json
{
  "kwik_payment_id": "pay_xxx",
  "payments_id": "pay_xxx",
  "kwik_mandate_id": "man_xxx",
  "mandate_id": "man_xxx",
  "kwik_customer_id": "cus_xxx",
  "customers_id": "cus_xxx",
  "transaction_id": "txn_xxx",
  "amount": "100.00",
  "payment_status": "PAID",
  "status": "PAID"
}
```

#### checkout.failed

```json
{
  "checkout_id": "cho_xxx",
  "kwik_customer_id": "cus_xxx",
  "customers_id": "cus_xxx",
  "kwik_payment_id": "pay_xxx",
  "payments_id": "pay_xxx",
  "amount": "100.00",
  "payment_status": "FAILED",
  "status": "FAILED",
  "failure_reason": "Mock checkout failure"
}
```

#### transaction.updated

```json
{
  "transaction_id": "txn_xxx",
  "kwik_payment_id": "pay_xxx",
  "payments_id": "pay_xxx",
  "kwik_customer_id": "cus_xxx",
  "customers_id": "cus_xxx",
  "amount": "100.00",
  "payment_status": "PAID",
  "status": "PAID"
}
```

Payload editor requirements:

- Use a textarea with JSON validation.
- Show validation error before sending.
- Pretty-format JSON button.
- Copy payload button.
- Load template button when event type changes.

Send result:

- Show delivery ID.
- Show HTTP status from target.
- Show target response body.
- Show error if failed.
- Provide Replay button for the created delivery.

### 5. Scenario Settings

Build a form around:

```text
GET /admin/scenario
POST /admin/scenario
```

Fields:

- `authMode`: `loose` / `strict`
- `cdvFailUnknown`: boolean
- `avsFailUnknown`: boolean
- `defaultNotifyUrl`: string or empty
- `webhookAuthMode`: `basic` / `api-key` / `hmac` / `none`
- `webhookAccessKey`: string
- `webhookAccessSecret`: string
- `webhookHmacSecret`: string

Requirements:

- Save settings button.
- Reset local form button.
- Explain only with short inline labels/tooltips, not long documentation.
- Do not hide secrets; this is a local testing tool with no auth.

### 6. Raw Data

Show the full response from:

```text
GET /admin/data
```

Requirements:

- Pretty JSON viewer.
- Copy all JSON button.
- Refresh button.

## User Experience Requirements

- The first screen must be the working dashboard, not a landing page.
- No authentication.
- No external network dependency for UI assets.
- Works at desktop width first; mobile can be simple but must not be broken.
- UI should be dense and operational:
  - tables
  - filters
  - buttons
  - compact cards
  - JSON detail panels
- Keep styling simple:
  - neutral background
  - readable tables
  - compact spacing
  - status badges
  - 8px or smaller border radius
- Do not add decorative hero sections, marketing content, or large illustrations.

## Backend Requirements

Use existing admin endpoints when possible.

If needed, add these endpoints:

```text
GET /admin/interface-data
```

Optional aggregate endpoint that returns:

```json
{
  "data": {
    "payment_methods": [],
    "lookups": [],
    "customers": [],
    "bank_accounts": [],
    "payments": [],
    "mandates": [],
    "checkout_sessions": [],
    "webhook_deliveries": [],
    "scenario": {}
  },
  "summary": {
    "payment_methods": 0,
    "customers": 0,
    "bank_accounts": 0,
    "payments": 0,
    "mandates": 0,
    "checkout_sessions": 0,
    "webhook_deliveries": 0,
    "webhook_success": 0,
    "webhook_failed": 0
  }
}
```

Add static serving from NestJS. Suggested structure:

```text
src/interface/
  interface.controller.ts
  interface.module.ts
  static/
    index.html
    app.js
    styles.css
```

Or use:

```text
public/
  index.html
  app.js
  styles.css
```

The exact folder structure can follow existing NestJS patterns in this repo.

## Integration With Existing Mock Behavior

The interface must not change the existing Kwik API routes or their behavior.

Existing endpoints must remain compatible with Jobix:

- `GET /payment-methods`
- `GET /lookups/bank_name/:paymentMethodId`
- `POST /cdv`
- `POST /avs-r`
- `GET /customers/list`
- `POST /customers/create`
- `GET /bank-accounts/list`
- `POST /bank-accounts/create`
- `POST /bank-accounts/update`
- `POST /checkout/page`
- `POST /payments/submit`
- `POST /payments/status/:paymentsId/:status`
- `POST /mandates/debicheck/update/cancel`
- admin endpoints

## Testing Requirements

Add or update tests for:

1. Interface route returns HTML.
2. Static JS/CSS assets are served.
3. `GET /admin/data` still returns all required collections.
4. `POST /admin/webhook/fire` works from interface-compatible payload.
5. `POST /admin/scenario` updates webhook settings used by webhook delivery.

Run:

```bash
pnpm test
pnpm build
```

## Acceptance Criteria

Implementation is complete when:

- Opening `http://localhost:3099/interface` shows the dashboard.
- Opening `http://localhost:3099/` redirects to or renders the same dashboard.
- Developer can view all mock records.
- Developer can view webhook delivery history.
- Developer can manually send `PAYMENT_STATUS`, `MANDATE_UPDATED`, and `CHECKOUT_COMPLETED` webhooks to `jb-inner-api`.
- Developer can replay a webhook delivery.
- Developer can update target webhook auth settings from the UI.
- Developer can reset and reseed mock data from the UI.
- No auth is required.
- Existing Swagger/docs and Kwik mock API routes still work.

## Notes for Jobix Local Testing

Common local target URL:

```text
http://localhost:3005/v1/webhook/kwik/{companyUuid}
```

Common stage target URL:

```text
https://inner-api-stage.jobix.ai/v1/webhook/kwik/{companyUuid}
```

For Jobix contact matching, payload must include at least one ID already stored on the customer:

- `kwik_mandate_id` / `mandate_id` / `mandates_id`
- `kwik_customer_id` / `customers_id` / `customer_id`
- `kwik_payment_id` / `payments_id` / `payment_id`

Paid statuses that should increment `total_paid` in Jobix:

- `PAID`
- `SUCCESS`
- `SUCCEEDED`
- `COMPLETED`

Use `event_id` uniqueness to avoid Jobix idempotency treating repeated tests as duplicates.
