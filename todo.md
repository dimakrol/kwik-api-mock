# Kwik API Mock TODO

Goal: make `kwik-api-mock` complete enough to fully test the Jobix Kwik implementation end to end:

- `jb-application-be` Kwik node actions against `KWIK_API_BASE_URL=http://host.docker.internal:3099/1.0`
- `jb-inner-api` webhook receiver at `POST /webhook/kwik/:companyUuid`
- `jb-contacts-service` contact updates, `total_paid` increments, card/mandate/payment fields, and `CUSTOMER_UPDATE` side effects
- Flow-engine customer update consumption from Kafka

## 1. Keep Existing Core API Stable

Do not break the currently working endpoints:

- `GET /1.0/payment-methods`
- `GET /1.0/lookups/:type/:payment_methods_id`
- `GET /1.0/lookups/:type`
- `POST /1.0/cdv`
- `POST /1.0/avs-r`
- `GET /1.0/customers/list`
- `POST /1.0/customers/create`
- `GET /1.0/bank-accounts/list`
- `POST /1.0/bank-accounts/create`
- `POST /1.0/bank-accounts/update`
- `POST /1.0/checkout/page`
- `POST /1.0/payments/submit`
- `POST /1.0/payments/status/:paymentsId/:status`
- `POST /1.0/mandates/debicheck/update/cancel`
- `POST /admin/webhook/fire`
- `GET /admin/data`
- `DELETE /admin/reset`
- `POST /admin/seed`

Acceptance:

- Swagger still exposes all endpoints.
- Existing request/response shapes remain backward compatible.
- `jb-application-be` existing seven actions still pass:
  - `payment_methods_list`
  - `banks_list`
  - `card_details_verification`
  - `search_customer`
  - `create_customer`
  - `search_bank_account`
  - `create_bank_account`

## 2. Implement Real Checkout Page Behavior

Previous issue, now fixed in source: `POST /1.0/checkout/page` returned `page_url`, but public checkout UI routes still required Basic auth. Keep this behavior covered because the returned `page_url` must be openable by a browser without `Authorization`.

Implement:

- `GET /checkout/:checkoutId`
  - Returns a minimal HTML checkout page.
  - Shows checkout id, customer id, amount, mode, and status.
  - Provides simple test actions as HTML forms or buttons:
    - complete payment
    - fail payment
    - save card only
- `POST /checkout/:checkoutId/complete`
  - Marks session as `COMPLETED`.
  - Generates or accepts `card_id`.
  - Sends checkout completion webhook to `notify_url` if present.
- `POST /checkout/:checkoutId/fail`
  - Marks session as `FAILED`.
  - Sends failed checkout/payment webhook to `notify_url` if present.
- `POST /checkout/:checkoutId/save-card`
  - Marks session as `CARD_SAVED`.
  - Generates `card_id`.
  - Sends webhook with saved card data.

Checkout webhook payloads should include at minimum:

```json
{
  "event_type": "CHECKOUT_COMPLETED",
  "event_id": "evt_xxx",
  "checkout_id": "cho_xxx",
  "kwik_customer_id": "cus_xxx",
  "customers_id": "cus_xxx",
  "card_id": "card_xxx",
  "amount": "150.00",
  "payment_status": "PAID",
  "status": "PAID"
}
```

Acceptance:

- `page_url` returned by `POST /1.0/checkout/page` resolves with HTTP 200 without requiring `Authorization`.
- The checkout UI action endpoints below also work without `Authorization`, because browser buttons on the hosted checkout page do not send Kwik Basic auth:
  - `POST /checkout/:checkoutId/complete`
  - `POST /checkout/:checkoutId/fail`
  - `POST /checkout/:checkoutId/save-card`
- Keep `POST /1.0/checkout/page` protected by Kwik API auth.
- Completing checkout calls `notify_url`.
- `jb-inner-api` receives `CHECKOUT_COMPLETED` and updates:
  - `card_id`
  - `total_paid`
  - `kwik_customer_id`
  - `kwik_last_event_id`

Implementation note:

- Do not put `@UseGuards(BasicAuthGuard)` on the entire checkout controller if the same controller serves both `/1.0/checkout/page` and `/checkout/:id` UI routes.
- Apply `BasicAuthGuard` only to `POST /1.0/checkout/page`, or split authenticated API routes and public checkout UI routes into separate controllers.

## 3. Implement Automatic Webhooks for Payment Lifecycle

Current issue: webhooks can only be sent manually via `/admin/webhook/fire`.

Implement optional automatic webhook delivery for:

- `POST /1.0/payments/submit`
  - Create payment.
  - Create mandate.
  - Optionally send `MANDATE_UPDATED` with `PENDING` or `ACCEPTED`.
  - Optionally send initial `PAYMENT_STATUS` with `RUNNING`.
- `POST /1.0/payments/status/:paymentsId/:status`
  - Update payment status.
  - Send `PAYMENT_STATUS` webhook when payment has a `notify_url` or when global mock webhook config is present.
- `POST /1.0/mandates/debicheck/update/cancel`
  - Update mandate status to `CANCELLED`.
  - Update related payment to `STOPPED`.
  - Send `MANDATE_UPDATED` webhook.

Add payment/mandate request support for callback configuration:

- `notify_url`
- `webhook_url`
- `callback_url`

Persist callback URL on payment and/or mandate entities.

Payment webhook payloads should include:

```json
{
  "event_type": "PAYMENT_STATUS",
  "event_id": "evt_xxx",
  "kwik_payment_id": "pay_xxx",
  "payments_id": "pay_xxx",
  "kwik_mandate_id": "man_xxx",
  "mandate_id": "man_xxx",
  "kwik_customer_id": "cus_xxx",
  "customers_id": "cus_xxx",
  "transaction_id": "txn_xxx",
  "amount": "125.50",
  "payment_status": "PAID",
  "status": "PAID"
}
```

Mandate webhook payloads should include:

```json
{
  "event_type": "MANDATE_UPDATED",
  "event_id": "evt_xxx",
  "kwik_mandate_id": "man_xxx",
  "mandate_id": "man_xxx",
  "kwik_payment_id": "pay_xxx",
  "payments_id": "pay_xxx",
  "kwik_customer_id": "cus_xxx",
  "customers_id": "cus_xxx",
  "mandate_status": "ACCEPTED",
  "status": "ACCEPTED"
}
```

Acceptance:

- A full account payment flow can be tested without manually crafting webhook payloads:
  - create customer
  - create bank account
  - submit payment
  - mark payment `PAID`
  - stop payment
  - cancel mandate
- `jb-inner-api` receives webhooks and `jb-contacts-service` updates contact fields.
- Duplicate webhook delivery can be simulated with the same `event_id`.

## 4. Add Webhook Delivery Service

Centralize webhook sending instead of duplicating `axios.post` logic in admin/service code.

Implement a service such as `WebhookDeliveryService`:

- Builds auth headers.
- Supports Basic auth:
  - configured default `MOCK_WEBHOOK_ACCESS_KEY`
  - configured default `MOCK_WEBHOOK_ACCESS_SECRET`
  - per-request override
- Supports API key header:
  - `x-kwik-api-key`
- Optional HMAC mode for future compatibility:
  - header `x-kwik-signature`
  - HMAC SHA256 over raw JSON body
  - secret from `MOCK_WEBHOOK_HMAC_SECRET`
- Stores delivery attempts in a new entity/table:
  - id
  - event_id
  - event_type
  - target_url
  - request_body
  - request_headers
  - response_status
  - response_body
  - success
  - error
  - created_at

Acceptance:

- `/admin/data` includes webhook delivery history.
- Failed webhook deliveries are visible.
- Tests can assert the mock attempted delivery even if target service returned non-2xx.

## 5. Make Auth Realistic but Configurable

Current issue: `BasicAuthGuard` accepts any decoded `key:secret`.

Implement:

- Default loose mode for local convenience:
  - `MOCK_AUTH_MODE=loose`
  - current behavior allowed
- Strict mode:
  - `MOCK_AUTH_MODE=strict`
  - require credentials to match:
    - `MOCK_ACCESS_KEY`
    - `MOCK_ACCESS_SECRET`
- API key mode:
  - accept `x-kwik-api-key: MOCK_ACCESS_KEY`
- Keep Swagger Basic auth.

Return the existing Kwik-like error body on unauthorized:

```json
{
  "status": false,
  "error_code": "001",
  "error_message": "Invalid API key provided."
}
```

Acceptance:

- In strict mode, `bad:bad` returns 401.
- In strict mode, `test_key:test_secret` succeeds.
- In loose mode, existing tests remain easy to run.

## 6. Add Filtering to List Endpoints

Current issue: docs require duplicate checks, but mock list endpoints return all rows.

Implement query filters for `GET /1.0/customers/list`:

- `id`
- `reference`
- `email`
- `customer_email`
- `id_number`
- `customer_id_number`
- `contact_number`
- `customer_status`

Implement query filters for `GET /1.0/bank-accounts/list`:

- `id`
- `customers_id`
- `bank_account_number`
- `bank_name`
- `bank_branch_code`
- `reference`
- `status`

Filtering should be exact-match by default. Optional partial matching may be added with `q`, but exact filters are required.

Acceptance:

- `GET /1.0/customers/list?email=...` returns only matching customer.
- `GET /1.0/bank-accounts/list?customers_id=...&bank_account_number=...` returns only matching bank account.
- Unfiltered calls remain backward compatible.

## 7. Tighten Validation and Error Responses

Add validation for required payloads while preserving Kwik-like response shapes.

Implement validation for:

- `POST /1.0/customers/create`
  - `records` must be non-empty array.
  - required fields:
    - `reference`
    - `person_name`
    - `person_surname`
    - `client_type`
    - `id_type`
    - `id_number`
    - `email`
    - `contact_number`
- `POST /1.0/bank-accounts/create`
  - `records` must be non-empty array.
  - required fields:
    - `customers_id`
    - `bank_account_holder_name`
    - `bank_account_number`
    - `bank_account_type`
    - `bank_name`
    - `bank_branch_code`
    - `reference`
- `POST /1.0/bank-accounts/update`
  - each record must include `id`.
  - unknown ids should either return an error or an item-level failure, not silently disappear.
- `POST /1.0/cdv`
  - `records` must be non-empty array.
  - `bank_branch_code` should accept both string and number.
  - internally normalize to string for responses.
  - preserve leading zeros when the input is a string, for example `"051001"` must remain `"051001"` in the response and in known-account matching.
- `POST /1.0/avs-r`
  - accept realistic AVS payload fields.
  - optionally fail when `AVS_FAIL_UNKNOWN=true`.
- `POST /1.0/payments/submit`
  - required:
    - `customers_id`
    - `bank_accounts_id`
    - `payment_methods_id`
    - `amount`
  - amount must be positive decimal string.
- `POST /1.0/payments/status/:paymentsId/:status`
  - status must be one of:
    - `RUNNING`
    - `STOPPED`
    - `PAUSED`
    - `CANCELLED`
    - `PAID`
    - `FAILED`
    - `REVERSED`
- `POST /1.0/mandates/debicheck/update/cancel`
  - required:
    - `mandate_id`
    - `cancel_reason`

Acceptance:

- Invalid requests return 400 with Kwik-like body:

```json
{
  "status": false,
  "error_code": "002",
  "error_message": "Readable validation message"
}
```

## 8. Add Scenario Controls for Testing

Add explicit test controls so downstream services can cover failure branches.

Environment variables:

- `CDV_FAIL_UNKNOWN=true`
- `AVS_FAIL_UNKNOWN=true`
- `MOCK_AUTH_MODE=loose|strict`
- `MOCK_ACCESS_KEY=test_key`
- `MOCK_ACCESS_SECRET=test_secret`
- `MOCK_BASE_URL=http://localhost:3099`
- `MOCK_DEFAULT_NOTIFY_URL=`
- `MOCK_WEBHOOK_AUTH_MODE=basic|api-key|hmac|none`
- `MOCK_WEBHOOK_ACCESS_KEY=test_key`
- `MOCK_WEBHOOK_ACCESS_SECRET=test_secret`
- `MOCK_WEBHOOK_HMAC_SECRET=`

Admin endpoints:

- `POST /admin/scenario`
  - set runtime flags without restart:
    - auth mode
    - CDV failure mode
    - AVS failure mode
    - default notify URL
    - default webhook auth
- `GET /admin/scenario`
  - inspect current flags.
- `POST /admin/webhook/replay/:deliveryId`
  - replay a previously stored webhook delivery.
- `POST /admin/webhook/fire`
  - keep existing manual fire endpoint.
  - add examples for `MANDATE_UPDATED`, `PAYMENT_STATUS`, `CHECKOUT_COMPLETED`.

Acceptance:

- Tests can switch from happy path to failure path without editing source.
- Manual webhook fire remains simple for developer testing.

## 9. Improve Admin Data and Reset

Extend `/admin/data` to include:

- payment methods
- lookups
- customers
- bank accounts
- payments
- mandates
- checkout sessions
- webhook deliveries
- scenario config

Improve `/admin/reset`:

- Keep seed data by default.
- Clear:
  - customers except seed customer
  - bank accounts
  - payments
  - mandates
  - checkout sessions
  - webhook deliveries
- Add optional query:
  - `?all=true` clears everything and reruns seed.

Acceptance:

- After reset, tests start from a predictable state.
- Seed data always includes:
  - `pam_debicheck_absa`
  - `pam_eft_absa`
  - banks for both payment methods
  - `cus_test_001`

## 10. Add Missing Test Coverage in kwik-api-mock

Add automated tests for the mock itself.

Recommended test groups:

- Auth
  - loose mode accepts any Basic header with `:`
  - strict mode rejects bad credentials
  - strict mode accepts configured credentials
  - API key header works if enabled
- Lookups/payment methods
  - payment methods list shape
  - banks by payment method
- CDV/AVS
  - happy path
  - failure mode
  - branch code string and number inputs
- Customers
  - create
  - required validation
  - filtered search by email/id/reference
- Bank accounts
  - create
  - update
  - filtered search by customer/account
  - unknown update id behavior
- Checkout
  - create page
  - page URL returns 200
  - page URL returns 200 without `Authorization`
  - unauthenticated checkout UI buttons can call complete/fail/save-card successfully
  - complete sends webhook
  - failed checkout sends webhook
  - saved card sends webhook
- Payments
  - submit creates payment and mandate
  - status update sends webhook
  - stop flow updates status
- Mandates
  - cancel updates mandate and related payment
  - cancel sends webhook
- Admin
  - reset
  - seed
  - data
  - webhook fire
  - webhook replay

Acceptance:

- `pnpm test` passes.
- At least one integration-style test verifies:
  - create checkout -> complete checkout -> webhook delivery stored
  - submit payment -> mark paid -> cancel mandate -> webhook deliveries stored
- Add controller/e2e-style tests for auth boundaries:
  - `POST /1.0/checkout/page` requires Basic auth.
  - `GET /checkout/:id` does not require Basic auth.
  - `POST /checkout/:id/complete` does not require Basic auth.
  - `POST /checkout/:id/fail` does not require Basic auth.
  - `POST /checkout/:id/save-card` does not require Basic auth.
- Add CDV regression tests:
  - string branch code `"051001"` stays `"051001"` in the response.
  - string branch code `"051001"` matches the Standard Bank known passing account when `CDV_FAIL_UNKNOWN=true`.

## 11. Add End-to-End Test Script for Jobix Services

Add a script in `kwik-api-mock/scripts/` that exercises Jobix services against the mock.

Suggested script:

- `scripts/test-jobix-kwik-e2e.sh`

Current implementation status:

- The script exists and is executable.
- It has explicit full e2e mode and `MOCK_ONLY=true` mode.
- Full e2e mode now fails immediately when required Jobix env vars are missing.
- Full e2e mode now calls `jb-application-be` `/kwik/test-action` for implemented BFF action slugs.
- Payment submit id parsing was corrected to read `.payments.id` and `.payments.mandate_id`.
- `MOCK_ONLY=true` completes successfully when no webhook deliveries exist.
- Full e2e mode sends custom mock Kwik credentials to BFF `/kwik/test-action`.
- Full e2e mode now parses `/admin/data` webhook deliveries by event type and related id.
- Full e2e mode now fails when an expected webhook delivery has a non-2xx response status.
- Full e2e mode now verifies downstream `jb-contacts-service` field updates via the contacts database.
- Full e2e mode now verifies duplicate webhook deduplication does not double-count `total_paid`.
- Full e2e mode now verifies `jb-flow-engine` dispatcher log consumption for the produced `CUSTOMER_UPDATE`.
- Full e2e mode was verified locally on 2026-05-19 against running Jobix services:
  - `jb-application-be`
  - `jb-inner-api`
  - `jb-contacts-service`
  - `jb-flow-engine`

Inputs:

- `JOBIX_BFF_URL=http://localhost:3000`
- `JOBIX_INNER_API_URL=http://localhost:3006`
- `JOBIX_AUTH_TOKEN=...`
- `JOBIX_CUSTOMER_UUID=...`
- `JOBIX_COMPANY_UUID=...`
- `KWIK_MOCK_URL=http://localhost:3099`
- `KWIK_ACCESS_KEY=test_key`
- `KWIK_ACCESS_SECRET=test_secret`

The script should:

1. Verify mock `/docs-json`.
2. Verify BFF `/profile`.
3. Run all implemented BFF Kwik actions through `jb-application-be`, not by calling the mock directly.
4. Create a checkout page.
5. Complete checkout and send webhook to inner API.
6. Submit payment.
7. Mark payment paid.
8. Cancel mandate.
9. Fire duplicate webhook with same `event_id`.
10. Print clear pass/fail report.

Acceptance:

- Script exits non-zero on failed step.
- Script is committed at `scripts/test-jobix-kwik-e2e.sh`.
- Script has executable permissions.
- Script works from the `kwik-api-mock` project root without requiring manual edits.
- Script treats these env vars as required for full e2e mode and exits non-zero if they are missing:
  - `JOBIX_AUTH_TOKEN`
  - `JOBIX_CUSTOMER_UUID`
  - `JOBIX_COMPANY_UUID`
- Script may support an explicit mock-only mode, but that mode must be named clearly, for example `MOCK_ONLY=true`, and must not print "ALL PASSED" for full Jobix e2e acceptance.
- `MOCK_ONLY=true` mode must complete successfully when no webhook notify URL is configured and no webhook deliveries exist.
- Script calls `jb-application-be` for BFF Kwik actions, using the existing BFF endpoint and action slugs:
  - `POST /kwik/test-action`
  - `payment_methods_list`
  - `banks_list`
  - `card_details_verification`
  - `search_customer`
  - `create_customer`
  - `search_bank_account`
  - `create_bank_account`
- Script uses `JOBIX_CUSTOMER_UUID` where BFF actions require a customer context.
- Script calls mock endpoints directly only for mock-owned operations that are not exposed through BFF or for admin verification.
- Script parses the payment submit response correctly:
  - current mock response shape is `{ "status": true, "payments": { "id": "pay_xxx", "mandate_id": "man_xxx", ... } }`
  - do not parse `payments_id` from the top-level payment submit response unless the API response is changed to include it.
- Script verifies webhook deliveries in `/admin/data` by matching event type and related ids, not just the first `event_id` in the response.
- Script verifies downstream effects when full Jobix env vars are present:
  - `jb-inner-api` accepts the webhook calls.
  - `jb-contacts-service` updates customer/contact fields.
  - duplicate event replay does not double-count `total_paid`.
- Script fails full e2e mode if any expected webhook delivery has a non-2xx response status.
- Script prints created ids:
  - `customers_id`
  - `bank_accounts_id`
  - `checkout_id`
  - `payments_id`
  - `mandate_id`
  - webhook `event_id`s

## 12. Keep Swagger Useful

For every endpoint:

- Add realistic request examples.
- Add realistic success examples.
- Add 400 examples.
- Add 401 examples where auth applies.
- Include event payload examples for all webhook-producing actions.

Acceptance:

- `http://localhost:3099/docs` is enough for a developer to manually run the full Kwik flow.
- `docs-json` includes all new endpoints and schemas.

## 13. Current Review Status

These were observed in the implementation review on 2026-05-19 and have been completed in the current implementation.

### 13.1 Completed in Source

The following previously open items are now implemented in source:

- Public checkout UI routes no longer have controller-level `BasicAuthGuard`.
- `POST /1.0/checkout/page` still has `BasicAuthGuard`.
- Public checkout routes are covered by route-level tests:
  - `GET /checkout/:id`
  - `POST /checkout/:id/complete`
  - `POST /checkout/:id/fail`
  - `POST /checkout/:id/save-card`
- CDV preserves string branch codes with leading zeros, including `"051001"`.
- CDV known-account matching accepts `"051001"` for Standard Bank when `CDV_FAIL_UNKNOWN=true`.
- `scripts/test-jobix-kwik-e2e.sh` exists and has executable permissions.
- `pnpm build` passes.
- `pnpm test` passes when tests are allowed to bind a local ephemeral HTTP server.

Verification note:

- `pnpm test` fails inside the restricted sandbox because `supertest` attempts to bind `0.0.0.0` and receives `listen EPERM`.
- The same `pnpm test` command passes outside the sandbox:
  - 12 test suites passed.
  - 143 tests passed.

### 13.2 Completed: Finalize Jobix End-to-End Script

The current `scripts/test-jobix-kwik-e2e.sh` covers full Jobix e2e acceptance for the local dev stack.

Completed in the script:

- Full mode validates required env vars:
  - `JOBIX_AUTH_TOKEN`
  - `JOBIX_CUSTOMER_UUID`
  - `JOBIX_COMPANY_UUID`
- `MOCK_ONLY=true` is explicit and does not claim full e2e success.
- `MOCK_ONLY=true` does not fail duplicate replay when no deliveries exist.
- BFF action checks call `jb-application-be` `/kwik/test-action`.
- BFF action checks pass custom mock Kwik credentials.
- Payment submit parsing reads:
  - `.payments.id`
  - `.payments.mandate_id`
- `/admin/data` delivery checks match by event type plus related checkout/payment/mandate id.
- Full mode fails expected webhook deliveries with non-2xx response status.
- Full mode verifies `jb-contacts-service` field updates:
  - `kwik_customer_id`
  - `kwik_mandate_id`
  - `kwik_payment_id`
  - `kwik_last_event_id`
  - `mandate_status`
  - `payment_status`
  - `card_id`
  - `total_paid`
- Full mode verifies duplicate payment webhook replay does not double-count `total_paid`.
- Full mode verifies `jb-flow-engine` consumed the produced `CUSTOMER_UPDATE` by checking dispatcher logs for the Jobix contact id.
- Full mode exercises the mock against running Jobix services:
  - `jb-application-be`
  - `jb-inner-api`
  - `jb-contacts-service`
  - `jb-flow-engine`

Required behavior:

- Read configuration from env vars listed in section 11.
- Print each step with pass/fail status.
- Exit non-zero on the first failed required step.
- Print all created Kwik ids and webhook event ids.
- Verify at least:
  - mock `/docs-json`
  - BFF `/profile`
  - BFF `payment_methods_list`
  - BFF `banks_list`
  - BFF `card_details_verification`
  - BFF `search_customer`
  - BFF `create_customer`
  - BFF `search_bank_account`
  - BFF `create_bank_account`
  - checkout page creation
  - unauthenticated checkout page open
  - checkout completion webhook
  - payment submit
  - payment status update webhook
  - mandate cancel webhook
  - duplicate webhook event id handling

Specific script corrections:

- No open script corrections remain from this section.

### 13.3 Completed: Live Jobix Service Verification

Live verification was completed locally on 2026-05-19 against the running services:

1. Confirm `KWIK_API_BASE_URL` in `jb-application-be` points to the mock:
   - from host: `http://localhost:3099/1.0`
   - from Docker: `http://host.docker.internal:3099/1.0`
2. Restart any service that needs env reload.
3. Commands run:
   - `pnpm test`
   - `pnpm build`
   - `MOCK_ONLY=true scripts/test-jobix-kwik-e2e.sh`
   - `scripts/test-jobix-kwik-e2e.sh`
4. Confirmed full webhook chain:
   - mock sends webhook
   - `jb-inner-api` accepts webhook
   - `jb-contacts-service` updates contact/customer fields
   - duplicate payment webhook does not double-count `total_paid`
   - `CUSTOMER_UPDATE` side effects are produced
   - `jb-flow-engine` consumes the customer update event

### 13.4 Live Mock Smoke Acceptance

Manually verify against a running mock on `http://localhost:3099`:

1. `DELETE /admin/reset`
2. `POST /1.0/checkout/page` with Basic auth.
3. Open returned `page_url` without auth and confirm HTTP `200`.
4. `POST /checkout/:checkoutId/complete` without auth and confirm HTTP `200`.
5. Confirm `/admin/data` contains:
   - updated checkout session
   - webhook delivery if a notify URL/default notify URL was configured.
6. Run `pnpm test`.
7. Run `pnpm build`.

## 14. Final Acceptance Criteria

The mock is considered complete when this full flow can be tested without hand-editing payloads:

1. Reset and seed mock.
2. `jb-application-be` calls:
   - payment methods
   - bank lookup
   - CDV
   - AVS
   - customer search/create
   - bank-account search/create/update
   - checkout page
   - submit payment
   - stop payment
   - cancel mandate
3. Checkout page URL opens with HTTP 200.
4. Checkout page URL and checkout UI action endpoints work without `Authorization`.
5. Completing checkout sends `CHECKOUT_COMPLETED` to `jb-inner-api`.
6. Marking payment paid sends `PAYMENT_STATUS` to `jb-inner-api`.
7. Cancelling mandate sends `MANDATE_UPDATED` to `jb-inner-api`.
8. `jb-contacts-service` fields update:
   - `kwik_customer_id`
   - `kwik_mandate_id`
   - `kwik_payment_id`
   - `kwik_last_event_id`
   - `mandate_status`
   - `payment_status`
   - `card_id`
   - `total_paid`
9. Duplicate webhook with same `event_id` does not double-count `total_paid`.
10. `CUSTOMER_UPDATE` Kafka messages are produced and consumed by flow-engine.
11. `scripts/test-jobix-kwik-e2e.sh` passes against running local Jobix services.
12. All mock tests pass.
13. `pnpm build` passes.
