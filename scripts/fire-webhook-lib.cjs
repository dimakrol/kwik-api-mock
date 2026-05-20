'use strict';

const TARGET_PRESETS = {
  local: 'http://localhost:3005',
  stage: 'https://inner-api-stage.jobix.ai',
};

const TEMPLATES = {
  MANDATE_UPDATED: {
    kwik_mandate_id: 'man_xxx',
    mandate_id: 'man_xxx',
    kwik_payment_id: 'pay_xxx',
    payments_id: 'pay_xxx',
    kwik_customer_id: 'cus_xxx',
    customers_id: 'cus_xxx',
    mandate_status: 'ACTIVE',
    status: 'ACTIVE',
  },
  CHECKOUT_COMPLETED: {
    checkout_id: 'cho_xxx',
    kwik_customer_id: 'cus_xxx',
    customers_id: 'cus_xxx',
    kwik_payment_id: 'pay_xxx',
    payments_id: 'pay_xxx',
    card_id: 'card_xxx',
    amount: '100.00',
    payment_status: 'PAID',
    status: 'PAID',
  },
  PAYMENT_STATUS: {
    kwik_payment_id: 'pay_xxx',
    payments_id: 'pay_xxx',
    kwik_mandate_id: 'man_xxx',
    mandate_id: 'man_xxx',
    kwik_customer_id: 'cus_xxx',
    customers_id: 'cus_xxx',
    transaction_id: 'txn_xxx',
    amount: '100.00',
    payment_status: 'PAID',
    status: 'PAID',
  },
  'checkout.failed': {
    checkout_id: 'cho_xxx',
    kwik_customer_id: 'cus_xxx',
    customers_id: 'cus_xxx',
    kwik_payment_id: 'pay_xxx',
    payments_id: 'pay_xxx',
    amount: '100.00',
    payment_status: 'FAILED',
    status: 'FAILED',
    failure_reason: 'Mock checkout failure',
  },
  'transaction.updated': {
    transaction_id: 'txn_xxx',
    kwik_payment_id: 'pay_xxx',
    payments_id: 'pay_xxx',
    kwik_customer_id: 'cus_xxx',
    customers_id: 'cus_xxx',
    amount: '100.00',
    payment_status: 'PAID',
    status: 'PAID',
  },
};

function templateFor(eventType) {
  if (TEMPLATES[eventType]) return { ...TEMPLATES[eventType] };
  if (eventType.startsWith('customer.')) return { kwik_customer_id: 'cus_xxx', customers_id: 'cus_xxx' };
  if (eventType.startsWith('mandate.')) return { kwik_mandate_id: 'man_xxx', mandate_id: 'man_xxx', kwik_customer_id: 'cus_xxx', status: 'ACTIVE' };
  if (eventType.startsWith('payment.')) return { kwik_payment_id: 'pay_xxx', payments_id: 'pay_xxx', amount: '100.00', payment_status: 'PAID', status: 'PAID' };
  if (eventType.startsWith('transaction.')) return { transaction_id: 'txn_xxx', kwik_payment_id: 'pay_xxx', amount: '100.00', status: 'PAID' };
  if (eventType.startsWith('checkout.')) return { checkout_id: 'cho_xxx', kwik_customer_id: 'cus_xxx', amount: '100.00', status: 'PAID' };
  if (eventType === 'bank_account.created') {
    return {
      id: 'bac_xxx',
      customers_id: 'cus_xxx',
      bank_name: 'ABSA_BANK_LIMITED',
      bank_branch_code: '632005',
      status: 'ACTIVE',
    };
  }
  return {};
}

function parseArgs(argv) {
  const parsed = { set: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument "${token}"`);
    }
    const key = token.slice(2);
    if (key === 'help' || key === 'template') {
      parsed[key] = true;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    i += 1;
    if (key === 'set') {
      parsed.set.push(next);
    } else {
      parsed[key] = next;
    }
  }
  return parsed;
}

function resolveTargetUrl(args) {
  if (args['target-url']) {
    return args['target-url'];
  }
  const preset = args['target-preset'];
  if (!preset) {
    throw new Error('Either --target-url or --target-preset is required');
  }
  const base = TARGET_PRESETS[preset];
  if (!base) {
    throw new Error(`Unknown --target-preset "${preset}". Allowed: ${Object.keys(TARGET_PRESETS).join(', ')}`);
  }
  const companyUuid = requireString(args['company-uuid'], '--company-uuid is required when using --target-preset');
  return `${stripTrailingSlash(base)}/v1/webhook/kwik/${companyUuid}`;
}

async function resolvePayload(eventType, args, readFile) {
  let payload = {};
  if (args.template) {
    payload = templateFor(eventType);
  }
  if (args['payload-json']) {
    payload = parseJson(args['payload-json'], '--payload-json');
  }
  if (args['payload-file']) {
    if (!readFile) {
      throw new Error('readFile handler is required for --payload-file');
    }
    const fileContent = await readFile(args['payload-file']);
    payload = parseJson(fileContent, '--payload-file');
  }
  for (const entry of args.set || []) {
    const idx = entry.indexOf('=');
    if (idx <= 0) {
      throw new Error(`Invalid --set value "${entry}". Expected key=value`);
    }
    const key = entry.slice(0, idx);
    const rawValue = entry.slice(idx + 1);
    payload[key] = parseSetValue(rawValue);
  }
  return payload;
}

function resolveAuth(args) {
  const auth = {};
  if (args['auth-mode'] && args['auth-mode'] !== 'default') auth.auth_mode = args['auth-mode'];
  if (args['access-key']) auth.access_key = args['access-key'];
  if (args['access-secret']) auth.access_secret = args['access-secret'];
  if (args['hmac-secret']) auth.hmac_secret = args['hmac-secret'];
  return Object.keys(auth).length > 0 ? auth : null;
}

async function buildRequestBody(args, readFile) {
  const eventType = requireString(args['event-type'], '--event-type is required');
  const payload = await resolvePayload(eventType, args, readFile);
  const body = {
    target_url: resolveTargetUrl(args),
    event_type: eventType,
    payload,
  };
  const auth = resolveAuth(args);
  if (auth) body.auth = auth;
  return body;
}

function parseSetValue(rawValue) {
  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;
  if (rawValue === 'null') return null;
  if (rawValue.startsWith('{') || rawValue.startsWith('[') || rawValue.startsWith('"')) {
    return parseJson(rawValue, '--set');
  }
  return rawValue;
}

function parseJson(value, source) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON for ${source}: ${error.message}`);
  }
}

function requireString(value, message) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(message);
  }
  return value.trim();
}

function stripTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

module.exports = {
  TARGET_PRESETS,
  TEMPLATES,
  templateFor,
  parseArgs,
  resolveTargetUrl,
  resolvePayload,
  resolveAuth,
  buildRequestBody,
  parseSetValue,
  parseJson,
  requireString,
  stripTrailingSlash,
};
