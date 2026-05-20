# Kwik API Integration Protocol

## General Payment Agent Protocol

### Step 1: Determining the Payment Method
The agent must determine the primary payment channel: bank card or direct debit from an account.
Agent's question: "Which method would you like to use: pay by bank card or set up direct debit from your bank account?"
Selection logic:
* If Card: Go to Step 2A.
* If Account: Go to Step 2B.

### Step 2A: "Card Payment" Scenario
For cards, an external payment page (Checkout) is used.
* Payment type: Agent asks: "Is this a one-time payment or would you like to save the card for future automatic payments?".
* Collection of amount: "For what amount are we processing the payment?".
* Technical action (Code):
  * Create Checkout session (`POST /checkout/page`).
  * If one-time: `mode: "ONE_TIME"`.
  * If auto-pay: `mode: "SAVE"` or `"RECURRING"`.
* Completion: Agent provides the client with a link (`page_url`) for secure data entry.

### Step 2B: "Bank Account" Scenario
Here the agent collects details for direct debit.
* Collection of bank details:
  * "Please specify the name of your bank."
  * "What is your account type: Cheque/Current, Savings, or Transmission?"
  * "Please specify the account number and branch code (if known)."
* Collection of personal data (for mandate):
  * Client's Full Name, ID number (South African ID or passport) and phone number (for DebiCheck).
* Validation (Code):
  * Format check: Call `POST /cdv` to confirm the correctness of account digits.
  * Owner check: Call `POST /avs-r` to confirm the account belongs to this person.
* Validation result: If the data is invalid, the agent asks for clarification.

### Step 3: Setting the Frequency (if auto-payment is selected)
This step is common for both scenarios if the client chose recurring deductions.
* Amount: "How much needs to be deducted each time?"
* Deduction date: "On what date of each month is it most convenient for you to make the payment? (e.g., the 1st or the 25th)"
* Interval: "How often should deductions be made: monthly or yearly?"
* Duration: "Is there an end date for these payments, or should they continue until you cancel?"

### Step 4: Finalization and Confirmation
* Summary: The agent repeats all conditions to the client: method, amount, date, and frequency.
* Technical action (Code):
  * Call `POST /payments/submit` with the recurring object.
* Parameters for code:
  * `amount`: sum.
  * `process_day`: calendar day (1-31).
  * `payment_interval`: MONTHLY or YEARLY.
  * `date_start` and `date_end`: validity period.

| Parameter | Value for code | Nuance |
| :--- | :--- | :--- |
| Amount | `amount` | Decimal number (e.g., "100.00"). |
| Day | `process_day` | If specified as 31st and the month has 30 days, it will deduct on the 30th. |
| Period | `payment_interval` | MONTHLY or YEARLY. |
| Validation | `/cdv` | Mandatory before creating a bank account. |
| Owner | `/avs-r` | Checks correspondence of Full Name and ID number in the bank. |

## Card Data Validation

### Step 1: Fetching Available Payment Methods
**Endpoint:** `/payment-methods`

A detailed guide on using the `/payment-methods` endpoint, which allows getting a list of available payment methods.

**How to properly use `/payment-methods` (Nuances and rules)**
* Getting Method ID: The main goal of this request is to get the `id` of a specific method (e.g., DebiCheck or EFT), to later use it to search for available banks and create a payment.
* Checking limits: The response returns limits for one transaction (`item_limit`) and monthly limits (`monthly_limit`), allowing your agent to understand if the client's desired amount will pass.
* No request body: This is a GET request, so records arrays are not needed here.

**Method:** `GET`
**URL:** `https://staging.app.kwik.co.za/1.0/payment-methods`
**Headers:**
`Content-Type: application/json`
`Authorization: Basic {your_base64_encoded_key}`

**Response:**
```json
{
  "status": true,
  "payment_methods": [{
    "id": "pam_abc123...",
    "payment_method_type": "DEBIT_ORDER",
    "payment_industry": "ACCOUNT_REPAYMENT",
    "provider_bank": "ABSA_BANK_LIMITED",
    "abbreviated_name": "KWIK PAY",
    "item_limit": "20000.00",
    "monthly_limit": "200000.00",
    "allow_date_adjustment": true
  }]
}
```

### Step 2: Fetching Available Banks for a Specific Payment Type
**Endpoint:** `/lookups/bank_name/{payment_methods_id}`

Guide on using directory endpoints to get a list of banks for a specific payment method.

**How to properly use `/lookups` (Nuances and rules)**
* Method dependency: You must pass the payment method ID (`pam_...`) in the URL. This ensures the bank is supported by the selected method (especially important for DebiCheck).
* Using the result: You will use the enum value from the response in `/cdv`, `/avs-r`, and `/payments/submit` requests as `bank_name`.

**Method:** `GET`
**URL:** `https://staging.app.kwik.co.za/1.0/lookups/bank_name/pam_abc123...`
**Headers:**
`Content-Type: application/json`
`Authorization: Basic {your_base64_encoded_key}`

**Request:** (Empty body)

**Response:**
```json
{
  "status": true,
  "lookups": [{
    "id": "loo_abc123...",
    "parent_lookups_id": null,
    "title": "ABSA BANK LIMITED",
    "enum": "ABSA_BANK_LIMITED",
    "type": "bank_name"
  }]
}
```

### Step 3: Checking Bank Account for Correct Data
**Endpoint:** `/cdv`

Validation of bank account format via Check Digit Verification.

**How to properly use `/cdv` (Nuances and rules)**
* Goal: Allows checking the correctness of South African account numbers and reducing rejected payments before processing.
* Mandatory fields: The request requires `bank_branch_code`, `bank_account_number`, and `bank_account_type`.
* Account modification: Some bank accounts need modification before sending to the bank (e.g., dropping the highest bit for Unibank). If the `modified_bank_account_number` field is not null, use it for future payments.

**Method:** `POST`
**URL:** `https://staging.app.kwik.co.za/1.0/cdv`
**Headers:**
`Content-Type: application/json`
`Authorization: Basic {your_base64_encoded_key}`

**Request:**
```json
{
  "records": [
    {
      "bank_branch_code": "051001",
      "bank_account_number": "10004291601",
      "bank_account_type": "CHEQUE_OR_CURRENT"
    }
  ]
}
```

#### Account Types according to Kwik API
According to the Kwik API documentation, the `bank_account_type` field can only take three strictly defined values (ENUM), complying with South African financial standards:

1. **CHEQUE_OR_CURRENT** (Cheque or Current Account)
* Meaning: The most popular account type for daily use (salaries, card payments, Debit Orders / DebiCheck).
* Nuance: In South Africa, these terms are combined into one type.
* AI Agent Question: *"Is this your current (Current/Cheque) account?"*

2. **SAVINGS** (Savings Account)
* Meaning: An account primarily for accumulating funds with interest.
* Nuance: While many countries disallow direct debits from savings, SA banks often allow DebiCheck/EFT Debit Orders from SAVINGS accounts. The client must ensure their bank allows it and has sufficient funds.
* AI Agent Question: *"Is this your savings account?"*

3. **TRANSMISSION** (Transmission Account)
* Meaning: A hybrid account specific to the SA banking system, solely for moving funds (salary, bills).
* Nuance: Unlike CHEQUE_OR_CURRENT, they usually lack credit limits (overdrafts) and have different service fees. Ideal for auto-debits.

**Response:**
```json
{
  "status": true,
  "results": [
    {
      "passed": true,
      "bank_branch_code": "051001",
      "bank_account_number": "10004291601",
      "bank_account_type": "CHEQUE_OR_CURRENT",
      "modified_bank_account_number": null,
      "warning": null,
      "error": null
    }
  ]
}
```

## Creating a Client in the KWIK System
This section describes the logic of working with payers' personal data to avoid duplicates and keep info updated.

### Step 1: Finding an Existing Client (Check)
* Description: Before registering a new profile, the system must check if this client was created previously using `GET /customers/list`.
* Nuances: Search using unique parameters like ID number (`customer_id_number`) or email (`customer_email`). If found, save the `id` (e.g., `cus_abc123...`).

### Step 2: Collecting Data for Profile Creation
* Description: If Step 1 yields no results, the agent collects full info for registration.
* Nuances:
  * Client type (`client_type`): Usually `RESIDENT_INDIVIDUAL`.
  * ID type (`id_type`): For SA citizens, `SOUTH_AFRICAN_ID`.
  * Phone (`contact_number`): International format (`+27...`), mandatory for mandates.
  * Reference (`reference`): Your internal unique client code.
* Agent Question: *"Please provide your first name, last name, phone number, and your ID document number for registration."*

### Step 3: Creating a New Client
* Description: Send the collected data to the server via `POST /customers/create`. Takes an array of records.
* Nuance: You cannot create DebiCheck payments for companies, only for individuals.

## Managing Bank Accounts in the KWIK System
This section describes the process of registering a client's bank details. One client can have multiple accounts.

### Step 1: Finding an Existing Account (Check)
* Description: Check if the account was registered previously using `GET /bank-accounts/list` filtering by `customers_id` and `bank_account_number`. If found, use its `id` (`ban_abc123...`).

### Step 2: Creating a Bank Account
* Description: Add new bank details via `POST /bank-accounts/create`. This is ONLY executed after a successful `/cdv` check.
* Nuances: `bank_branch_code` must be the universal bank code. `bank_account_holder_name` must match the bank's records.

### Step 3: Updating a Bank Account
* Description: Edit details like owner name or account status via `POST /bank-accounts/update`. (Account numbers are usually not edited; create a new one instead).

### For the AI Agent and Code:
* Action Order:
  1. Collect account data via the Agent.
  2. Call `/cdv` (validation).
  3. If successful -> Call `/bank-accounts/list`.
  4. If not found -> Call `/bank-accounts/create`.
* Sandbox (Testing): Always use `ABSA_BANK_LIMITED` (632005) and account number `10004291601` for testing, as it always passes checks.

## Full Workflow of the AI Agent and System (Kwik API)

### Stage 0: Preparation
System performs `GET /payment-methods` and saves `payment_methods_id` in session memory.

### Stage 1: Identification and Client Creation
Agent asks for details. System performs `GET /customers/list`. If not found, `POST /customers/create`.

### Stage 2: Selecting Basic Payment Method
Agent asks whether to pay by card or bank account. Logic branches into Branch A (Card) or Branch B (Account).

### Stage 3: Logic Branching
#### Branch A: Card Payment
Agent asks if it's a one-time or saved card. System fixes the mode (`ONE_TIME` or `SAVE`/`RECURRING`) and generates a payment link via `POST /checkout/page`.
#### Branch B: Payment via Bank Account (DebiCheck / EFT)
System fetches banks via `GET /lookups/bank_name/{payment_methods_id}`. Agent asks client to select their bank and provide account details. System validates via `POST /cdv`. If valid, registers account via `POST /bank-accounts/create`.

### Stage 4: Agreeing on Payment Terms
Agent asks for the amount, payment recurrence (one-time or regular), and preferred deduction day.

### Stage 5: Finalization and Payload Generation
System prepares the final payload to initialize deduction or create a mandate using `customers_id`, `bank_accounts_id`, `payment_methods_id`, `amount`, and recurring `process_day`.

## Payment Flow Implementation

### Option 1: Bank Card Payment
Cards are processed via a Checkout page.
**Method:** `POST /checkout/page`.
After payment, a webhook (`checkout.completed`) is sent to your `notify_url`.

### Option 2: Bank Account Payment (DebiCheck, RM, EFT)
Initiate payment directly via `POST /payments/submit`. This creates a mandate and a payment schedule in one request. Save `payments_id` and `mandate_id` to stop the auto-payment in the future.

### Tracking and Stopping Auto-Payments (Installments)
* Step 1: Track successful payments via Webhooks (`transaction.created` or `transaction.updated` with status `PAID`).
* Step 2: When the total amount is paid, stop the payment programmatically using `POST /payments/status/:paymentsID/STOPPED`.
* Step 3: Cancel the mandate (for DebiCheck/RM) via `POST /mandates/debicheck/update/cancel` with `cancel_reason: CONTRACT_EXPIRED`.

### Summary for Backend Developer (Automation Algorithm)
1. Initialization: Collect all IDs (`cus_...`, `ban_...`, `pam_...`).
2. Launch: Call `POST /payments/submit` (for accounts) or `/checkout/page` (for cards).
3. Saving: Record `payments_id` in the client contract table.
4. Listener: Write an endpoint to receive webhooks.
5. Increment: Add to the paid amount counter upon receiving a `PAID` status.
6. Stop Condition: If Paid >= Contract Amount, call `/payments/status/{payments_id}/STOPPED` and cancel the mandate.
