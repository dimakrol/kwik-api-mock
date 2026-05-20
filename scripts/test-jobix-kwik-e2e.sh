#!/usr/bin/env bash
# E2E test script for Kwik mock + Jobix services integration.
#
# Tests the full Kwik payment flow through:
#   kwik-api-mock  → jb-application-be BFF  → jb-inner-api  → jb-contacts-service
#
# Usage:
#   MOCK_ONLY=true ./scripts/test-jobix-kwik-e2e.sh      # mock verification only
#   ./scripts/test-jobix-kwik-e2e.sh                      # full Jobix e2e (requires env vars below)
#
# Required env vars for full e2e mode (fail immediately if missing):
#   JOBIX_AUTH_TOKEN      — Bearer token for jb-application-be
#   JOBIX_CUSTOMER_UUID   — UUID of an existing contact/customer in jb-contacts-service
#   JOBIX_COMPANY_UUID    — UUID of the company whose inner-api webhook endpoint to hit
#
# Optional env vars:
#   JOBIX_BFF_URL         — BFF base URL        (default: http://localhost:3000)
#   JOBIX_INNER_API_URL   — inner-api base URL   (default: http://localhost:3006)
#   KWIK_MOCK_URL         — mock server base URL (default: http://localhost:3099)
#   KWIK_ACCESS_KEY       — Kwik API key         (default: test_key)
#   KWIK_ACCESS_SECRET    — Kwik API secret      (default: test_secret)
#   CONTACTS_DB_CONTAINER — Postgres container   (default: jobix-postgres)
#   CONTACTS_DB_USER      — Postgres user        (default: ej_postgres_user)
#   CONTACTS_DB_NAME      — contacts DB name     (default: contacts)
#   FLOW_ENGINE_LOG_CONTAINER — dispatcher logs  (default: jb-flow-engine-dispatcher-1)
#   MOCK_ONLY             — set to "true" for mock-only mode (no BFF/Jobix service checks)

set -euo pipefail

# ── Defaults ─────────────────────────────────────────────────────────────────
JOBIX_BFF_URL="${JOBIX_BFF_URL:-http://localhost:3000}"
JOBIX_INNER_API_URL="${JOBIX_INNER_API_URL:-http://localhost:3006}"
KWIK_MOCK_URL="${KWIK_MOCK_URL:-http://localhost:3099}"
KWIK_ACCESS_KEY="${KWIK_ACCESS_KEY:-test_key}"
KWIK_ACCESS_SECRET="${KWIK_ACCESS_SECRET:-test_secret}"
JOBIX_AUTH_TOKEN="${JOBIX_AUTH_TOKEN:-}"
JOBIX_CUSTOMER_UUID="${JOBIX_CUSTOMER_UUID:-}"
JOBIX_COMPANY_UUID="${JOBIX_COMPANY_UUID:-}"
MOCK_ONLY="${MOCK_ONLY:-false}"
CONTACTS_DB_CONTAINER="${CONTACTS_DB_CONTAINER:-jobix-postgres}"
CONTACTS_DB_USER="${CONTACTS_DB_USER:-ej_postgres_user}"
CONTACTS_DB_NAME="${CONTACTS_DB_NAME:-contacts}"
FLOW_ENGINE_LOG_CONTAINER="${FLOW_ENGINE_LOG_CONTAINER:-jb-flow-engine-dispatcher-1}"

KWIK_AUTH_HEADER="Authorization: Basic $(printf '%s:%s' "$KWIK_ACCESS_KEY" "$KWIK_ACCESS_SECRET" | base64)"

# ── Required env var check ────────────────────────────────────────────────────
if [[ "$MOCK_ONLY" != "true" ]]; then
  MISSING=()
  [[ -z "$JOBIX_AUTH_TOKEN" ]] && MISSING+=("JOBIX_AUTH_TOKEN")
  [[ -z "$JOBIX_CUSTOMER_UUID" ]] && MISSING+=("JOBIX_CUSTOMER_UUID")
  [[ -z "$JOBIX_COMPANY_UUID" ]] && MISSING+=("JOBIX_COMPANY_UUID")
  if [[ ${#MISSING[@]} -gt 0 ]]; then
    echo ""
    echo "ERROR: Full e2e mode requires the following env vars:"
    for v in "${MISSING[@]}"; do echo "  $v"; done
    echo ""
    echo "Set MOCK_ONLY=true to run mock-only verification without Jobix services."
    exit 1
  fi
fi

# ── State ─────────────────────────────────────────────────────────────────────
PASS=0
FAIL=0
CUSTOMERS_ID=""
BANK_ACCOUNTS_ID=""
CHECKOUT_ID=""
PAYMENTS_ID=""
MANDATE_ID=""
CHECKOUT_EVENT_ID=""
PAYMENT_EVENT_ID=""
MANDATE_EVENT_ID=""
DOWNSTREAM_CHECKOUT_EVENT_ID=""
DOWNSTREAM_PAYMENT_EVENT_ID=""
DOWNSTREAM_MANDATE_EVENT_ID=""
DOWNSTREAM_PAYMENT_ID=""
DOWNSTREAM_CARD_ID=""
DOWNSTREAM_CONTACT_ID=""
DOWNSTREAM_TOTAL_BEFORE=""
DOWNSTREAM_TOTAL_AFTER=""
LAST_INNER_RESPONSE=""

# ── Helpers ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass()    { echo -e "  ${GREEN}✓${NC} $1"; PASS=$((PASS+1)); }
fail()    { echo -e "  ${RED}✗${NC} $1"; FAIL=$((FAIL+1)); }
warn()    { echo -e "  ${YELLOW}⚠${NC}  $1"; }
section() { echo -e "\n${YELLOW}── $1 ──${NC}"; }

assert_status() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    pass "$label (HTTP $actual)"
  else
    fail "$label — expected HTTP $expected, got $actual"
  fi
}

assert_field() {
  local label="$1" value="$2"
  if [[ -n "$value" && "$value" != "null" ]]; then
    pass "$label = $value"
  else
    fail "$label is empty or null"
  fi
}

# Call BFF POST /kwik/test-action with given action slug and JSON params object.
# Returns raw BFF JSON response.
bff_action() {
  local action="$1"
  local params_json="${2:-}"
  if [[ -z "$params_json" ]]; then
    params_json='{}'
  fi
  local payload
  payload=$(printf '{"customer_uuid":"%s","kwik_params":{"action":"%s","use_custom_connection":true,"credentials":{"access_key":"%s","access_secret":"%s"},"action_params":%s}}' \
    "$JOBIX_CUSTOMER_UUID" \
    "$action" \
    "$KWIK_ACCESS_KEY" \
    "$KWIK_ACCESS_SECRET" \
    "$params_json")
  curl -s -X POST \
    -H "Authorization: Bearer $JOBIX_AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    "$JOBIX_BFF_URL/kwik/test-action"
}

# Returns non-empty string if BFF response contains "ok":true at the outer data level.
bff_ok() { echo "$1" | grep -o '"ok":true' | head -1; }

# Return a field from the most recent admin/data delivery matching event_type
# and a related id in its request body.
webhook_delivery_field() {
  local deliveries_json="$1"
  local event_type="$2"
  local related_id="$3"
  local field="$4"
  node -e '
const fs = require("fs");
const [eventType, relatedId, field] = process.argv.slice(1);
const data = JSON.parse(fs.readFileSync(0, "utf8"));
const deliveries = Array.isArray(data.webhook_deliveries) ? data.webhook_deliveries : [];
const bodyText = (delivery) => {
  const body = delivery.request_body;
  if (typeof body === "string") return body;
  return JSON.stringify(body ?? {});
};
const found = [...deliveries]
  .reverse()
  .find((delivery) => delivery.event_type === eventType && bodyText(delivery).includes(relatedId));
const value = found ? found[field] : "";
if (value !== undefined && value !== null) process.stdout.write(String(value));
' "$event_type" "$related_id" "$field" <<< "$deliveries_json"
}

check_webhook_delivery() {
  local deliveries_json="$1"
  local event_type="$2"
  local related_id="$3"
  webhook_delivery_field "$deliveries_json" "$event_type" "$related_id" "id"
}

extract_delivery_event_id() {
  local deliveries_json="$1"
  local event_type="$2"
  local related_id="$3"
  webhook_delivery_field "$deliveries_json" "$event_type" "$related_id" "event_id"
}

assert_delivery_2xx() {
  local deliveries_json="$1"
  local event_type="$2"
  local related_id="$3"
  local status
  status=$(webhook_delivery_field "$deliveries_json" "$event_type" "$related_id" "response_status")
  if [[ -n "$status" && "$status" -ge 200 && "$status" -lt 300 ]]; then
    pass "inner-api accepted $event_type webhook for $related_id (HTTP $status)"
  elif [[ "$MOCK_ONLY" == "true" || -z "$INNER_WEBHOOK_URL" ]]; then
    warn "$event_type webhook delivery status: ${status:-unknown}"
  else
    fail "$event_type webhook delivery for $related_id returned ${status:-unknown}"
  fi
}

first_webhook_delivery_id() {
  local deliveries_json="$1"
  node -e '
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(0, "utf8"));
const deliveries = Array.isArray(data.webhook_deliveries) ? data.webhook_deliveries : [];
if (deliveries[0]?.id) process.stdout.write(String(deliveries[0].id));
' <<< "$deliveries_json"
}

psql_contacts() {
  docker exec "$CONTACTS_DB_CONTAINER" psql -U "$CONTACTS_DB_USER" -d "$CONTACTS_DB_NAME" -t -A -F $'\t' -c "$1"
}

contact_id_by_uuid() {
  psql_contacts "select id from company_customers where uuid = '$JOBIX_CUSTOMER_UUID'::uuid and deleted_at is null limit 1;"
}

contact_field_value() {
  local slug="$1"
  local value_table="$2"
  psql_contacts "select v.value from $value_table v join fields f on f.id = v.field_id join company_customers c on c.id = v.relation_id where v.relation_name = 'company_customers' and c.uuid = '$JOBIX_CUSTOMER_UUID'::uuid and f.slug = '$slug' limit 1;"
}

contact_string_value() {
  contact_field_value "$1" "value_strings"
}

contact_float_value() {
  contact_field_value "$1" "value_floats"
}

amount_sum() {
  node -e 'const values = process.argv.slice(1).map((value) => Number(value || 0)); const sum = values.reduce((a, b) => a + b, 0); process.stdout.write(sum.toFixed(2));' "$@"
}

amount_eq() {
  local left="$1"
  local right="$2"
  node -e 'const [a, b] = process.argv.slice(1).map((value) => Number(value || 0)); process.exit(Math.abs(a - b) < 0.005 ? 0 : 1);' "$left" "$right"
}

assert_contact_string() {
  local slug="$1"
  local expected="$2"
  local actual
  actual=$(contact_string_value "$slug")
  if [[ "$actual" == "$expected" ]]; then
    pass "Contact $slug = $actual"
  else
    fail "Contact $slug expected $expected, got ${actual:-<empty>}"
  fi
}

assert_contact_total_paid() {
  local expected="$1"
  local actual
  actual=$(contact_float_value "total_paid")
  if amount_eq "$actual" "$expected"; then
    pass "Contact total_paid = $(amount_sum "$actual")"
  else
    fail "Contact total_paid expected $expected, got ${actual:-<empty>}"
  fi
}

post_inner_webhook() {
  local payload="$1"
  curl -s -X POST \
    -H "$KWIK_AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    "$INNER_WEBHOOK_URL"
}

inner_webhook_ok() {
  local label="$1"
  local payload="$2"
  local response
  response=$(post_inner_webhook "$payload")
  LAST_INNER_RESPONSE="$response"
  if echo "$response" | grep -q '"ok":true' && echo "$response" | grep -q '"customer_found":true'; then
    pass "$label accepted and matched Jobix contact"
  else
    fail "$label did not match Jobix contact — response: $(echo "$response" | head -c 300)"
  fi
}

assert_flow_engine_consumed() {
  local contact_id="$1"
  local logs
  sleep 2
  logs=$(docker logs --since 3m "$FLOW_ENGINE_LOG_CONTAINER" 2>&1 || true)
  if echo "$logs" | grep -q "Processing message: type=WEBHOOK_CALLBACK" && echo "$logs" | grep -q "customerId=$contact_id"; then
    pass "flow-engine consumed CUSTOMER_UPDATE for customerId=$contact_id"
  else
    fail "flow-engine consumption signal missing for customerId=$contact_id"
  fi
}

# ── Mode banner ───────────────────────────────────────────────────────────────
echo ""
if [[ "$MOCK_ONLY" == "true" ]]; then
  echo -e "${YELLOW}┌──────────────────────────────────────────────────────────┐${NC}"
  echo -e "${YELLOW}│  MOCK_ONLY=true — verifying kwik-api-mock directly       │${NC}"
  echo -e "${YELLOW}│  This is NOT a full Jobix end-to-end run.                │${NC}"
  echo -e "${YELLOW}└──────────────────────────────────────────────────────────┘${NC}"
else
  echo -e "${GREEN}Full Jobix e2e mode — BFF: $JOBIX_BFF_URL${NC}"
fi

INNER_WEBHOOK_URL=""
if [[ -n "$JOBIX_COMPANY_UUID" ]]; then
  INNER_WEBHOOK_URL="$JOBIX_INNER_API_URL/webhook/kwik/$JOBIX_COMPANY_UUID"
fi

# ── Step 0: Reset mock state ──────────────────────────────────────────────────
section "0. Reset mock state"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$KWIK_MOCK_URL/admin/reset")
assert_status "DELETE /admin/reset" "200" "$STATUS"

# ── Step 1: Verify mock server ────────────────────────────────────────────────
section "1. Verify mock server"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$KWIK_MOCK_URL/docs-json")
assert_status "GET /docs-json" "200" "$STATUS"

PAMS=$(curl -s -H "$KWIK_AUTH_HEADER" "$KWIK_MOCK_URL/1.0/payment-methods")
PAM_COUNT=$(echo "$PAMS" | grep -o '"pam_' | wc -l | tr -d ' ')
if [[ "$PAM_COUNT" -ge "2" ]]; then
  pass "Payment methods seeded ($PAM_COUNT found)"
else
  fail "Payment methods missing (found $PAM_COUNT)"
fi

# ── Step 2: Verify BFF /profile ───────────────────────────────────────────────
section "2. Verify BFF /profile"
if [[ "$MOCK_ONLY" == "true" ]]; then
  warn "Skipping BFF check (MOCK_ONLY mode)"
else
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $JOBIX_AUTH_TOKEN" \
    "$JOBIX_BFF_URL/profile")
  assert_status "GET /profile" "200" "$STATUS"
fi

# ── Step 3: Kwik actions ──────────────────────────────────────────────────────
section "3. Kwik actions"

if [[ "$MOCK_ONLY" == "true" ]]; then
  # ── Mock-direct checks (no BFF) ─────────────────────────────────────────────

  echo "  3a. payment_methods_list"
  RESP=$(curl -s -H "$KWIK_AUTH_HEADER" "$KWIK_MOCK_URL/1.0/payment-methods")
  if echo "$RESP" | grep -q '"status":true'; then pass "payment_methods_list → status: true"; else fail "payment_methods_list"; fi

  echo "  3b. banks_list"
  RESP=$(curl -s -H "$KWIK_AUTH_HEADER" "$KWIK_MOCK_URL/1.0/lookups/bank_name/pam_debicheck_absa")
  if echo "$RESP" | grep -q '"status":true'; then pass "banks_list → status: true"; else fail "banks_list"; fi

  echo "  3c. card_details_verification"
  RESP=$(curl -s -X POST -H "$KWIK_AUTH_HEADER" -H "Content-Type: application/json" \
    -d '{"records":[{"bank_branch_code":632005,"bank_account_number":"any-account","bank_account_type":"CHEQUE"}]}' \
    "$KWIK_MOCK_URL/1.0/cdv")
  if echo "$RESP" | grep -q '"passed":true'; then pass "CDV passed: true"; else fail "CDV passed field missing"; fi
  if echo "$RESP" | grep -q '"bank_branch_code":"632005"'; then pass "CDV bank_branch_code returned as string"; else fail "CDV bank_branch_code not string '632005'"; fi

  echo "  3d. avs-r"
  RESP=$(curl -s -X POST -H "$KWIK_AUTH_HEADER" -H "Content-Type: application/json" \
    -d '{"records":[{"bank_branch_code":"632005","bank_account_number":"12345678","bank_account_type":"CHEQUE","id_number":"8001015009087","initials":"JD","surname":"Doe"}]}' \
    "$KWIK_MOCK_URL/1.0/avs-r")
  if echo "$RESP" | grep -q '"status":true'; then pass "avs-r → status: true"; else fail "avs-r"; fi

  echo "  3e. search_customer"
  RESP=$(curl -s -H "$KWIK_AUTH_HEADER" "$KWIK_MOCK_URL/1.0/customers/list")
  if echo "$RESP" | grep -q '"status":true'; then pass "customers/list → status: true"; else fail "customers/list"; fi
  if echo "$RESP" | grep -q '"id":"cus_test_001"'; then pass "Seed customer cus_test_001 present"; else fail "Seed customer cus_test_001 missing"; fi

  echo "  3f. create_customer"
  RESP=$(curl -s -X POST -H "$KWIK_AUTH_HEADER" -H "Content-Type: application/json" \
    -d '{"records":[{"reference":"E2E-TEST-001","person_name":"E2E","person_surname":"Tester","client_type":"RESIDENT_INDIVIDUAL","id_type":"SOUTH_AFRICAN_ID","id_number":"9001015009087","email":"e2e@test.com","contact_number":"+27820000001"}]}' \
    "$KWIK_MOCK_URL/1.0/customers/create")
  if echo "$RESP" | grep -q '"status":true'; then pass "customers/create → status: true"; else fail "customers/create"; fi
  CUSTOMERS_ID=$(echo "$RESP" | grep -o '"id":"cus_[^"]*"' | head -1 | sed 's/"id":"//;s/"//')
  assert_field "Created customers_id" "$CUSTOMERS_ID"

  echo "  3g. search_customer by email filter"
  RESP=$(curl -s -H "$KWIK_AUTH_HEADER" "$KWIK_MOCK_URL/1.0/customers/list?email=e2e%40test.com")
  if echo "$RESP" | grep -q "\"id\":\"$CUSTOMERS_ID\""; then pass "Customer found by email filter"; else fail "Customer not found by email filter"; fi

  echo "  3h. create_bank_account"
  RESP=$(curl -s -X POST -H "$KWIK_AUTH_HEADER" -H "Content-Type: application/json" \
    -d "{\"records\":[{\"customers_id\":\"$CUSTOMERS_ID\",\"bank_account_holder_name\":\"E2E Tester\",\"bank_account_number\":\"62001872440\",\"bank_account_type\":\"CHEQUE\",\"bank_name\":\"FNB\",\"bank_branch_code\":\"250655\",\"reference\":\"E2E-BA-001\"}]}" \
    "$KWIK_MOCK_URL/1.0/bank-accounts/create")
  if echo "$RESP" | grep -q '"status":true'; then pass "bank-accounts/create → status: true"; else fail "bank-accounts/create"; fi
  BANK_ACCOUNTS_ID=$(echo "$RESP" | grep -o '"id":"bac_[^"]*"' | head -1 | sed 's/"id":"//;s/"//')
  assert_field "Created bank_accounts_id" "$BANK_ACCOUNTS_ID"

  echo "  3i. search_bank_account by customers_id filter"
  RESP=$(curl -s -H "$KWIK_AUTH_HEADER" "$KWIK_MOCK_URL/1.0/bank-accounts/list?customers_id=$CUSTOMERS_ID")
  if echo "$RESP" | grep -q "\"id\":\"$BANK_ACCOUNTS_ID\""; then pass "Bank account found by customers_id filter"; else fail "Bank account not found by customers_id filter"; fi

else
  # ── Full e2e mode — BFF calls via jb-application-be ──────────────────────────

  echo "  3a. payment_methods_list (BFF)"
  RESP=$(bff_action "payment_methods_list" "{}")
  if [[ -n "$(bff_ok "$RESP")" ]]; then
    pass "BFF payment_methods_list → ok: true"
  else
    fail "BFF payment_methods_list failed — response: $(echo "$RESP" | head -c 200)"
  fi

  echo "  3b. banks_list (BFF)"
  RESP=$(bff_action "banks_list" '{"payment_methods_id":"pam_debicheck_absa"}')
  if [[ -n "$(bff_ok "$RESP")" ]]; then
    pass "BFF banks_list → ok: true"
  else
    fail "BFF banks_list failed — response: $(echo "$RESP" | head -c 200)"
  fi

  echo "  3c. card_details_verification (BFF)"
  RESP=$(bff_action "card_details_verification" '{"bank_branch_code":"632005","bank_account_number":"any-account","bank_account_type":"CHEQUE_OR_CURRENT"}')
  if [[ -n "$(bff_ok "$RESP")" ]]; then
    pass "BFF card_details_verification → ok: true"
  else
    fail "BFF card_details_verification failed — response: $(echo "$RESP" | head -c 200)"
  fi
  if echo "$RESP" | grep -q '"passed":true'; then pass "BFF CDV passed: true"; else fail "BFF CDV passed field missing in response"; fi

  echo "  3d. avs-r (mock direct — not exposed via BFF test-action)"
  RESP=$(curl -s -X POST -H "$KWIK_AUTH_HEADER" -H "Content-Type: application/json" \
    -d '{"records":[{"bank_branch_code":"632005","bank_account_number":"12345678","bank_account_type":"CHEQUE","id_number":"8001015009087","initials":"JD","surname":"Doe"}]}' \
    "$KWIK_MOCK_URL/1.0/avs-r")
  if echo "$RESP" | grep -q '"status":true'; then pass "avs-r → status: true"; else fail "avs-r"; fi

  echo "  3e. search_customer (BFF)"
  RESP=$(bff_action "search_customer" "{}")
  if [[ -n "$(bff_ok "$RESP")" ]]; then
    pass "BFF search_customer → ok: true"
  else
    fail "BFF search_customer failed — response: $(echo "$RESP" | head -c 200)"
  fi

  echo "  3f. create_customer (BFF)"
  RESP=$(bff_action "create_customer" '{"reference":"E2E-TEST-BFF-001","person_name":"E2E","person_surname":"Tester","client_type":"RESIDENT_INDIVIDUAL","id_type":"SOUTH_AFRICAN_ID","id_number":"9001015009087","email":"e2e-bff@test.com","contact_number":"+27820000001","customer_status":"ACTIVE"}')
  if [[ -n "$(bff_ok "$RESP")" ]]; then
    pass "BFF create_customer → ok: true"
  else
    fail "BFF create_customer failed — response: $(echo "$RESP" | head -c 400)"
  fi
  CUSTOMERS_ID=$(echo "$RESP" | grep -o '"id":"cus_[^"]*"' | head -1 | sed 's/"id":"//;s/"//')
  assert_field "Created customers_id (via BFF)" "$CUSTOMERS_ID"

  echo "  3g. search_customer by email filter (mock direct — admin verification)"
  RESP=$(curl -s -H "$KWIK_AUTH_HEADER" "$KWIK_MOCK_URL/1.0/customers/list?email=e2e-bff%40test.com")
  if echo "$RESP" | grep -q "\"id\":\"$CUSTOMERS_ID\""; then
    pass "Customer created via BFF found by email filter"
  else
    fail "Customer created via BFF not found by email filter"
  fi

  echo "  3h. create_bank_account (BFF)"
  RESP=$(bff_action "create_bank_account" "{\"customers_id\":\"$CUSTOMERS_ID\",\"bank_account_holder_name\":\"E2E Tester\",\"bank_account_number\":\"62001872440\",\"bank_account_type\":\"CHEQUE_OR_CURRENT\",\"bank_name\":\"FNB\",\"bank_branch_code\":\"250655\",\"reference\":\"E2E-BA-BFF-001\"}")
  if [[ -n "$(bff_ok "$RESP")" ]]; then
    pass "BFF create_bank_account → ok: true"
  else
    fail "BFF create_bank_account failed — response: $(echo "$RESP" | head -c 400)"
  fi
  BANK_ACCOUNTS_ID=$(echo "$RESP" | grep -o '"id":"bac_[^"]*"' | head -1 | sed 's/"id":"//;s/"//')
  assert_field "Created bank_accounts_id (via BFF)" "$BANK_ACCOUNTS_ID"

  echo "  3i. search_bank_account (BFF)"
  RESP=$(bff_action "search_bank_account" "{}")
  if [[ -n "$(bff_ok "$RESP")" ]]; then
    pass "BFF search_bank_account → ok: true"
  else
    fail "BFF search_bank_account failed — response: $(echo "$RESP" | head -c 200)"
  fi
  if echo "$RESP" | grep -q "\"id\":\"$BANK_ACCOUNTS_ID\""; then
    pass "Created bank account found in BFF search_bank_account response"
  else
    fail "Created bank account not found in BFF search_bank_account response"
  fi
fi

# ── Step 4: Create checkout page ──────────────────────────────────────────────
section "4. Create checkout page"
RESP=$(curl -s -X POST \
  -H "$KWIK_AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "{
    \"customers_id\": \"$CUSTOMERS_ID\",
    \"bank_accounts_id\": \"$BANK_ACCOUNTS_ID\",
    \"payment_methods_id\": \"pam_debicheck_absa\",
    \"amount\": \"150.00\",
    \"mode\": \"PAYMENT\",
    \"notify_url\": \"$INNER_WEBHOOK_URL\"
  }" \
  "$KWIK_MOCK_URL/1.0/checkout/page")
if echo "$RESP" | grep -q '"status":true'; then pass "checkout/page → status: true"; else fail "checkout/page"; fi

PAGE_URL=$(echo "$RESP" | grep -o '"page_url":"[^"]*"' | sed 's/"page_url":"//;s/"//')
CHECKOUT_ID=$(echo "$RESP" | grep -o '"id":"cho_[^"]*"' | head -1 | sed 's/"id":"//;s/"//')
assert_field "Created checkout_id" "$CHECKOUT_ID"
assert_field "page_url" "$PAGE_URL"

# ── Step 5: Checkout page URL returns HTTP 200 (no auth) ──────────────────────
section "5. Checkout page URL returns HTTP 200 (no auth)"
if [[ -n "$PAGE_URL" ]]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PAGE_URL")
  assert_status "GET $PAGE_URL (no Authorization header)" "200" "$STATUS"
else
  fail "page_url is empty — cannot verify"
fi

# ── Step 6: Complete checkout (unauthenticated, sends CHECKOUT_COMPLETED) ─────
section "6. Complete checkout (no auth required)"
RESP=$(curl -s -X POST "$KWIK_MOCK_URL/checkout/$CHECKOUT_ID/complete")
STATUS_FIELD=$(echo "$RESP" | grep -o '"status":"COMPLETED"' | head -1)
CARD_ID=$(echo "$RESP" | grep -o '"card_id":"[^"]*"' | sed 's/"card_id":"//;s/"//')

if [[ -n "$STATUS_FIELD" ]]; then pass "Checkout status = COMPLETED"; else fail "Checkout complete — missing status:COMPLETED in response"; fi
assert_field "card_id generated" "$CARD_ID"

DELIVERIES=$(curl -s "$KWIK_MOCK_URL/admin/data")
CHECKOUT_DELIVERY=$(check_webhook_delivery "$DELIVERIES" "CHECKOUT_COMPLETED" "$CHECKOUT_ID")
if [[ -n "$CHECKOUT_DELIVERY" ]]; then
  pass "CHECKOUT_COMPLETED webhook delivery recorded for $CHECKOUT_ID"
  CHECKOUT_EVENT_ID=$(extract_delivery_event_id "$DELIVERIES" "CHECKOUT_COMPLETED" "$CHECKOUT_ID")
  # Verify delivery was accepted by inner-api when webhook URL was configured
  if [[ -n "$INNER_WEBHOOK_URL" ]]; then
    assert_delivery_2xx "$DELIVERIES" "CHECKOUT_COMPLETED" "$CHECKOUT_ID"
  fi
elif [[ -n "$INNER_WEBHOOK_URL" ]]; then
  fail "CHECKOUT_COMPLETED webhook delivery not recorded for $CHECKOUT_ID"
else
  warn "CHECKOUT_COMPLETED webhook skipped (no JOBIX_COMPANY_UUID — notify_url was empty)"
  PASS=$((PASS+1))
fi

# ── Step 7: Submit payment ────────────────────────────────────────────────────
section "7. Submit payment"
RESP=$(curl -s -X POST \
  -H "$KWIK_AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "{
    \"customers_id\": \"$CUSTOMERS_ID\",
    \"bank_accounts_id\": \"$BANK_ACCOUNTS_ID\",
    \"payment_methods_id\": \"pam_debicheck_absa\",
    \"amount\": \"500.00\",
    \"process_day\": 1,
    \"payment_interval\": \"MONTHLY\",
    \"notify_url\": \"$INNER_WEBHOOK_URL\"
  }" \
  "$KWIK_MOCK_URL/1.0/payments/submit")
if echo "$RESP" | grep -q '"status":true'; then pass "payments/submit → status: true"; else fail "payments/submit"; fi

# Response shape: { status: true, payments: { id: "pay_xxx", mandate_id: "man_xxx", ... } }
PAYMENTS_ID=$(echo "$RESP" | grep -o '"id":"pay_[^"]*"' | head -1 | sed 's/"id":"//;s/"//')
MANDATE_ID=$(echo "$RESP" | grep -o '"mandate_id":"man_[^"]*"' | head -1 | sed 's/"mandate_id":"//;s/"//')
assert_field "Created payments_id" "$PAYMENTS_ID"
assert_field "Created mandate_id" "$MANDATE_ID"

# ── Step 8: Mark payment PAID ─────────────────────────────────────────────────
section "8. Mark payment PAID"
RESP=$(curl -s -X POST \
  -H "$KWIK_AUTH_HEADER" \
  "$KWIK_MOCK_URL/1.0/payments/status/$PAYMENTS_ID/PAID")
if echo "$RESP" | grep -q '"status":true'; then pass "payments/status/$PAYMENTS_ID/PAID → status: true"; else fail "payments/status PAID"; fi

DELIVERIES=$(curl -s "$KWIK_MOCK_URL/admin/data")
PAYMENT_DELIVERY=$(check_webhook_delivery "$DELIVERIES" "PAYMENT_STATUS" "$PAYMENTS_ID")
if [[ -n "$PAYMENT_DELIVERY" ]]; then
  pass "PAYMENT_STATUS webhook delivery recorded for $PAYMENTS_ID"
  PAYMENT_EVENT_ID=$(extract_delivery_event_id "$DELIVERIES" "PAYMENT_STATUS" "$PAYMENTS_ID")
  if [[ -n "$INNER_WEBHOOK_URL" ]]; then
    assert_delivery_2xx "$DELIVERIES" "PAYMENT_STATUS" "$PAYMENTS_ID"
  fi
elif [[ -n "$INNER_WEBHOOK_URL" ]]; then
  fail "PAYMENT_STATUS webhook delivery not recorded for $PAYMENTS_ID"
else
  warn "PAYMENT_STATUS webhook skipped (no notify_url)"
  PASS=$((PASS+1))
fi

# ── Step 9: Cancel mandate ────────────────────────────────────────────────────
section "9. Cancel mandate"
RESP=$(curl -s -X POST \
  -H "$KWIK_AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "{\"mandate_id\":\"$MANDATE_ID\",\"cancel_reason\":\"E2E test cancellation\"}" \
  "$KWIK_MOCK_URL/1.0/mandates/debicheck/update/cancel")
if echo "$RESP" | grep -q '"status":"CANCELLED"'; then pass "Mandate status = CANCELLED"; else fail "Mandate cancel — missing status:CANCELLED"; fi

DELIVERIES=$(curl -s "$KWIK_MOCK_URL/admin/data")
MANDATE_DELIVERY=$(check_webhook_delivery "$DELIVERIES" "MANDATE_UPDATED" "$MANDATE_ID")
if [[ -n "$MANDATE_DELIVERY" ]]; then
  pass "MANDATE_UPDATED webhook delivery recorded for $MANDATE_ID"
  MANDATE_EVENT_ID=$(extract_delivery_event_id "$DELIVERIES" "MANDATE_UPDATED" "$MANDATE_ID")
  if [[ -n "$INNER_WEBHOOK_URL" ]]; then
    assert_delivery_2xx "$DELIVERIES" "MANDATE_UPDATED" "$MANDATE_ID"
  fi
elif [[ -n "$INNER_WEBHOOK_URL" ]]; then
  fail "MANDATE_UPDATED webhook delivery not recorded for $MANDATE_ID"
else
  warn "MANDATE_UPDATED webhook skipped (no notify_url)"
  PASS=$((PASS+1))
fi

# ── Step 10: Duplicate webhook replay ────────────────────────────────────────
section "10. Duplicate webhook replay (same event_id)"
DELIVERIES=$(curl -s "$KWIK_MOCK_URL/admin/data")
FIRST_WDL=$(first_webhook_delivery_id "$DELIVERIES")
if [[ -n "$FIRST_WDL" && "$FIRST_WDL" != "null" ]]; then
  RESP=$(curl -s -X POST "$KWIK_MOCK_URL/admin/webhook/replay/$FIRST_WDL")
  OK=$(echo "$RESP" | grep -o '"ok":true\|"ok":false' | head -1)
  if [[ -n "$OK" ]]; then
    pass "Webhook replay $FIRST_WDL → $OK (delivery recorded regardless of target response)"
  else
    fail "Webhook replay returned unexpected response: $(echo "$RESP" | head -c 200)"
  fi
else
  warn "No webhook deliveries to replay (no notify_url was set)"
  PASS=$((PASS+1))
fi

# ── Step 11: Downstream Jobix side effects ────────────────────────────────────
section "11. Downstream Jobix side effects"
if [[ "$MOCK_ONLY" == "true" ]]; then
  warn "Skipping contacts/flow-engine checks (MOCK_ONLY mode)"
else
  DOWNSTREAM_CONTACT_ID=$(contact_id_by_uuid)
  assert_field "Jobix contact id for $JOBIX_CUSTOMER_UUID" "$DOWNSTREAM_CONTACT_ID"

  LINKED_KWIK_CUSTOMER_ID=$(contact_string_value "kwik_customer_id")
  LINKED_KWIK_MANDATE_ID=$(contact_string_value "kwik_mandate_id")
  DOWNSTREAM_TOTAL_BEFORE=$(contact_float_value "total_paid")

  assert_field "Existing contact kwik_customer_id" "$LINKED_KWIK_CUSTOMER_ID"
  assert_field "Existing contact kwik_mandate_id" "$LINKED_KWIK_MANDATE_ID"
  assert_field "Existing contact total_paid" "$DOWNSTREAM_TOTAL_BEFORE"

  DOWNSTREAM_CHECKOUT_EVENT_ID="kwik-e2e-checkout-$(date +%s)"
  DOWNSTREAM_PAYMENT_EVENT_ID="kwik-e2e-payment-$(date +%s)"
  DOWNSTREAM_MANDATE_EVENT_ID="kwik-e2e-mandate-$(date +%s)"
  DOWNSTREAM_PAYMENT_ID="pay_e2e_$(date +%s)"
  DOWNSTREAM_CARD_ID="card_e2e_$(date +%s)"

  CHECKOUT_AMOUNT="10.25"
  PAYMENT_AMOUNT="5.50"
  EXPECTED_AFTER_CHECKOUT=$(amount_sum "$DOWNSTREAM_TOTAL_BEFORE" "$CHECKOUT_AMOUNT")
  EXPECTED_AFTER_PAYMENT=$(amount_sum "$EXPECTED_AFTER_CHECKOUT" "$PAYMENT_AMOUNT")

  inner_webhook_ok "Linked CHECKOUT_COMPLETED webhook" "{
    \"event_type\":\"CHECKOUT_COMPLETED\",
    \"event_id\":\"$DOWNSTREAM_CHECKOUT_EVENT_ID\",
    \"checkout_id\":\"cho_downstream_$DOWNSTREAM_CHECKOUT_EVENT_ID\",
    \"kwik_customer_id\":\"$LINKED_KWIK_CUSTOMER_ID\",
    \"customers_id\":\"$LINKED_KWIK_CUSTOMER_ID\",
    \"card_id\":\"$DOWNSTREAM_CARD_ID\",
    \"amount\":\"$CHECKOUT_AMOUNT\",
    \"payment_status\":\"PAID\",
    \"status\":\"PAID\"
  }"
  assert_contact_string "card_id" "$DOWNSTREAM_CARD_ID"
  assert_contact_string "kwik_last_event_id" "$DOWNSTREAM_CHECKOUT_EVENT_ID"
  assert_contact_total_paid "$EXPECTED_AFTER_CHECKOUT"

  inner_webhook_ok "Linked PAYMENT_STATUS webhook" "{
    \"event_type\":\"PAYMENT_STATUS\",
    \"event_id\":\"$DOWNSTREAM_PAYMENT_EVENT_ID\",
    \"kwik_payment_id\":\"$DOWNSTREAM_PAYMENT_ID\",
    \"payments_id\":\"$DOWNSTREAM_PAYMENT_ID\",
    \"kwik_mandate_id\":\"$LINKED_KWIK_MANDATE_ID\",
    \"mandate_id\":\"$LINKED_KWIK_MANDATE_ID\",
    \"kwik_customer_id\":\"$LINKED_KWIK_CUSTOMER_ID\",
    \"customers_id\":\"$LINKED_KWIK_CUSTOMER_ID\",
    \"transaction_id\":\"txn_$DOWNSTREAM_PAYMENT_ID\",
    \"amount\":\"$PAYMENT_AMOUNT\",
    \"payment_status\":\"PAID\",
    \"status\":\"PAID\"
  }"
  assert_contact_string "kwik_payment_id" "$DOWNSTREAM_PAYMENT_ID"
  assert_contact_string "payment_status" "PAID"
  assert_contact_total_paid "$EXPECTED_AFTER_PAYMENT"

  inner_webhook_ok "Duplicate PAYMENT_STATUS webhook" "{
    \"event_type\":\"PAYMENT_STATUS\",
    \"event_id\":\"$DOWNSTREAM_PAYMENT_EVENT_ID\",
    \"kwik_payment_id\":\"$DOWNSTREAM_PAYMENT_ID\",
    \"payments_id\":\"$DOWNSTREAM_PAYMENT_ID\",
    \"kwik_mandate_id\":\"$LINKED_KWIK_MANDATE_ID\",
    \"mandate_id\":\"$LINKED_KWIK_MANDATE_ID\",
    \"kwik_customer_id\":\"$LINKED_KWIK_CUSTOMER_ID\",
    \"customers_id\":\"$LINKED_KWIK_CUSTOMER_ID\",
    \"transaction_id\":\"txn_$DOWNSTREAM_PAYMENT_ID\",
    \"amount\":\"$PAYMENT_AMOUNT\",
    \"payment_status\":\"PAID\",
    \"status\":\"PAID\"
  }"
  if echo "$LAST_INNER_RESPONSE" | grep -q '"duplicate":true' && echo "$LAST_INNER_RESPONSE" | grep -q '"applied":false'; then
    pass "Duplicate payment webhook detected by contacts-service"
  else
    fail "Duplicate payment webhook response did not report duplicate=true — response: $(echo "$LAST_INNER_RESPONSE" | head -c 300)"
  fi
  assert_contact_total_paid "$EXPECTED_AFTER_PAYMENT"

  inner_webhook_ok "Linked MANDATE_UPDATED webhook" "{
    \"event_type\":\"MANDATE_UPDATED\",
    \"event_id\":\"$DOWNSTREAM_MANDATE_EVENT_ID\",
    \"kwik_mandate_id\":\"$LINKED_KWIK_MANDATE_ID\",
    \"mandate_id\":\"$LINKED_KWIK_MANDATE_ID\",
    \"kwik_payment_id\":\"$DOWNSTREAM_PAYMENT_ID\",
    \"payments_id\":\"$DOWNSTREAM_PAYMENT_ID\",
    \"kwik_customer_id\":\"$LINKED_KWIK_CUSTOMER_ID\",
    \"customers_id\":\"$LINKED_KWIK_CUSTOMER_ID\",
    \"mandate_status\":\"CANCELLED\",
    \"status\":\"CANCELLED\"
  }"
  assert_contact_string "mandate_status" "CANCELLED"
  assert_contact_string "kwik_last_event_id" "$DOWNSTREAM_MANDATE_EVENT_ID"
  assert_contact_total_paid "$EXPECTED_AFTER_PAYMENT"
  DOWNSTREAM_TOTAL_AFTER=$(contact_float_value "total_paid")

  assert_flow_engine_consumed "$DOWNSTREAM_CONTACT_ID"
fi

# ── Step 12: Scenario controls ────────────────────────────────────────────────
section "12. Scenario controls"
RESP=$(curl -s "$KWIK_MOCK_URL/admin/scenario")
AUTH_MODE=$(echo "$RESP" | grep -o '"authMode":"[^"]*"' | sed 's/"authMode":"//;s/"//')
if [[ -n "$AUTH_MODE" ]]; then pass "GET /admin/scenario → authMode=$AUTH_MODE"; else fail "GET /admin/scenario missing authMode"; fi

RESP=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"cdvFailUnknown":true}' \
  "$KWIK_MOCK_URL/admin/scenario")
if echo "$RESP" | grep -q '"cdvFailUnknown":true'; then
  pass "POST /admin/scenario cdvFailUnknown=true"
else
  fail "POST /admin/scenario update"
fi

RESP=$(curl -s -X POST -H "$KWIK_AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"records":[{"bank_branch_code":999999,"bank_account_number":"00000000","bank_account_type":"SAVINGS"}]}' \
  "$KWIK_MOCK_URL/1.0/cdv")
if echo "$RESP" | grep -q '"passed":false'; then
  pass "CDV fails unknown account when cdvFailUnknown=true"
else
  fail "CDV should fail unknown account in strict mode"
fi

# Reset scenario
curl -s -X POST -H "Content-Type: application/json" -d '{"cdvFailUnknown":false}' "$KWIK_MOCK_URL/admin/scenario" > /dev/null

# ── Step 13: Admin reset (preserves seed data) ────────────────────────────────
section "13. Admin reset (preserves seed data)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$KWIK_MOCK_URL/admin/reset")
assert_status "DELETE /admin/reset" "200" "$STATUS"

RESP=$(curl -s "$KWIK_MOCK_URL/admin/data")
if echo "$RESP" | grep -q '"id":"cus_test_001"'; then
  pass "cus_test_001 preserved after reset"
else
  fail "cus_test_001 missing after reset"
fi

if [[ -n "$CUSTOMERS_ID" ]]; then
  if echo "$RESP" | grep -q "\"id\":\"$CUSTOMERS_ID\""; then
    fail "E2E customer $CUSTOMERS_ID still present after reset (should be cleared)"
  else
    pass "E2E customer $CUSTOMERS_ID cleared after reset"
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Results"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}Passed:${NC} $PASS"
echo -e "  ${RED}Failed:${NC} $FAIL"
echo ""
echo "  IDs created during this run:"
echo "    customers_id:      ${CUSTOMERS_ID:-<not created>}"
echo "    bank_accounts_id:  ${BANK_ACCOUNTS_ID:-<not created>}"
echo "    checkout_id:       ${CHECKOUT_ID:-<not created>}"
echo "    payments_id:       ${PAYMENTS_ID:-<not created>}"
echo "    mandate_id:        ${MANDATE_ID:-<not created>}"
echo "    checkout_event_id: ${CHECKOUT_EVENT_ID:-<no webhook>}"
echo "    payment_event_id:  ${PAYMENT_EVENT_ID:-<no webhook>}"
echo "    mandate_event_id:  ${MANDATE_EVENT_ID:-<no webhook>}"
echo ""

if [[ "$MOCK_ONLY" == "true" ]]; then
  echo -e "  ${YELLOW}NOTE: MOCK_ONLY run — not full Jobix e2e acceptance.${NC}"
  echo ""
fi

if [[ "$FAIL" -gt 0 ]]; then
  echo -e "  ${RED}FAILED ($FAIL test(s) failed)${NC}"
  exit 1
elif [[ "$MOCK_ONLY" == "true" ]]; then
  echo -e "  ${GREEN}MOCK CHECKS PASSED${NC} (run without MOCK_ONLY for full e2e)"
  exit 0
else
  echo -e "  ${GREEN}ALL PASSED${NC}"
  exit 0
fi
