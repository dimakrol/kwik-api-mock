'use strict';

const state = {
  data: null,
  summary: null,
  activeRecord: 'payment_methods',
  recordFilter: '',
  webhookFilters: {
    eventType: '',
    success: 'all',
    target: '',
    eventId: '',
  },
};

// ---------- DOM helpers ----------

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === false || v === null || v === undefined) continue;
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function copy(text) {
  if (!navigator.clipboard) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
    return Promise.resolve();
  }
  return navigator.clipboard.writeText(text);
}

function setStatus(id, text, kind) {
  const node = $(id);
  if (!node) return;
  node.textContent = text;
  node.className = 'result-line' + (kind ? ' ' + kind : '');
}

// ---------- API calls ----------

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch (_) { json = text; }
  if (!res.ok) {
    const msg = (json && json.message) || (typeof json === 'string' ? json : `HTTP ${res.status}`);
    const err = new Error(msg);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function refresh() {
  try {
    const r = await api('/admin/interface-data');
    state.data = r.data;
    state.summary = r.summary;
    renderOverview();
    renderRecords();
    renderWebhooks();
    renderScenarioForm();
    renderRaw();
    const now = new Date();
    $('#last-refresh').textContent = 'refreshed ' + now.toLocaleTimeString();
  } catch (err) {
    setStatus('#actions-result', 'Refresh failed: ' + err.message, 'err');
  }
}

// ---------- Tabs ----------

function activateTab(name) {
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('.panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === name));
}

function activateRecord(name) {
  state.activeRecord = name;
  $$('.sub-tab').forEach((b) => b.classList.toggle('active', b.dataset.record === name));
  renderRecords();
}

// ---------- Overview ----------

const COUNTER_DEFS = [
  ['payment_methods', 'Payment methods'],
  ['customers', 'Customers'],
  ['bank_accounts', 'Bank accounts'],
  ['payments', 'Payments'],
  ['mandates', 'Mandates'],
  ['checkout_sessions', 'Checkout sessions'],
  ['webhook_deliveries', 'Webhook deliveries'],
  ['webhook_success', 'Webhook success'],
  ['webhook_failed', 'Webhook failed'],
];

function renderOverview() {
  const counters = $('#counters');
  counters.innerHTML = '';
  const s = state.summary || {};
  for (const [key, label] of COUNTER_DEFS) {
    counters.appendChild(
      el('div', { class: 'counter' }, [
        el('div', { class: 'label' }, [label]),
        el('div', { class: 'value' }, [String(s[key] ?? 0)]),
      ]),
    );
  }

  const sc = (state.data && state.data.scenario) || {};
  const summary = $('#scenario-summary');
  summary.innerHTML = '';
  const rows = [
    ['authMode', sc.authMode],
    ['cdvFailUnknown', String(sc.cdvFailUnknown)],
    ['avsFailUnknown', String(sc.avsFailUnknown)],
    ['defaultNotifyUrl', sc.defaultNotifyUrl || '(none)'],
    ['webhookAuthMode', sc.webhookAuthMode],
    ['webhookAccessKey', sc.webhookAccessKey || '(none)'],
    ['webhookAccessSecret set', sc.webhookAccessSecret ? 'yes' : 'no'],
    ['webhookHmacSecret set', sc.webhookHmacSecret ? 'yes' : 'no'],
  ];
  for (const [k, v] of rows) {
    summary.appendChild(el('div', { class: 'key' }, [k]));
    summary.appendChild(el('div', { class: 'val' }, [v ?? '']));
  }
}

// ---------- Records ----------

const RECORD_COLUMNS = {
  payment_methods: ['id', 'abbreviated_name', 'payment_method_type', 'provider_bank'],
  lookups: ['id', 'title', 'enum', 'payment_methods_id'],
  customers: ['id', 'reference', 'person_name', 'person_surname', 'email', 'contact_number', 'customer_status'],
  bank_accounts: ['id', 'customers_id', 'bank_account_number', 'bank_account_type', 'bank_name', 'bank_branch_code', 'status'],
  payments: ['id', 'mandate_id', 'customers_id', 'bank_accounts_id', 'payment_methods_id', 'amount', 'status', 'notify_url'],
  mandates: ['id', 'payments_id', 'customers_id', 'bank_accounts_id', 'status', 'cancel_reason'],
  checkout_sessions: ['id', 'customers_id', 'amount', 'mode', 'page_url', 'status', 'notify_url'],
};

function rowMatchesFilter(row, filter) {
  if (!filter) return true;
  const needle = filter.toLowerCase();
  return Object.values(row).some((v) =>
    v !== null && v !== undefined && String(v).toLowerCase().includes(needle),
  );
}

function renderRecords() {
  const container = $('#record-table');
  container.innerHTML = '';
  if (!state.data) {
    container.appendChild(el('div', { class: 'muted' }, ['No data loaded.']));
    return;
  }
  const rows = state.data[state.activeRecord] || [];
  const cols = RECORD_COLUMNS[state.activeRecord] || (rows[0] ? Object.keys(rows[0]).slice(0, 6) : []);
  const filtered = rows.filter((r) => rowMatchesFilter(r, state.recordFilter));

  if (filtered.length === 0) {
    container.appendChild(el('div', { class: 'muted' }, [`No ${state.activeRecord} (${rows.length} total).`]));
    return;
  }

  const wrap = el('div', { class: 'table-scroll' });
  const table = el('table');
  const thead = el('thead');
  const headRow = el('tr');
  for (const c of cols) headRow.appendChild(el('th', {}, [c]));
  headRow.appendChild(el('th', {}, ['actions']));
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  filtered.forEach((row, idx) => {
    const tr = el('tr');
    for (const c of cols) {
      const v = row[c];
      const text = v === null || v === undefined ? '' : String(v);
      tr.appendChild(el('td', {}, [text]));
    }
    const id = row.id ?? '';
    const detailId = `detail-${state.activeRecord}-${idx}`;
    const actions = el('div', { class: 'row-actions' }, [
      id ? el('button', { class: 'btn small', onclick: () => copy(String(id)) }, ['Copy ID']) : null,
      el('button', {
        class: 'btn small',
        onclick: () => {
          const dr = document.getElementById(detailId);
          if (!dr) return;
          dr.style.display = dr.style.display === 'none' ? '' : 'none';
        },
      }, ['Toggle JSON']),
    ]);
    tr.appendChild(el('td', {}, [actions]));
    tbody.appendChild(tr);

    const detailTr = el('tr', { class: 'detail-row', id: detailId, style: 'display:none' });
    const detailCell = el('td', { colspan: String(cols.length + 1) });
    detailCell.appendChild(el('pre', {}, [JSON.stringify(row, null, 2)]));
    detailTr.appendChild(detailCell);
    tbody.appendChild(detailTr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  container.appendChild(wrap);

  const meta = el('div', { class: 'mini' }, [`${filtered.length} of ${rows.length} rows shown`]);
  container.appendChild(meta);
}

// ---------- Webhooks ----------

function webhookBadge(d) {
  if (d.success) return el('span', { class: 'badge good' }, ['success']);
  if (d.response_status && d.response_status >= 400) return el('span', { class: 'badge bad' }, ['failed']);
  if (!d.response_status) return el('span', { class: 'badge pending' }, ['pending']);
  return el('span', { class: 'badge neutral' }, ['unknown']);
}

function webhookMatches(d) {
  const f = state.webhookFilters;
  if (f.eventType && !String(d.event_type || '').toLowerCase().includes(f.eventType.toLowerCase())) return false;
  if (f.target && !String(d.target_url || '').toLowerCase().includes(f.target.toLowerCase())) return false;
  if (f.eventId && !String(d.event_id || '').toLowerCase().includes(f.eventId.toLowerCase())) return false;
  if (f.success === 'success' && !d.success) return false;
  if (f.success === 'failed' && d.success) return false;
  if (f.success === 'pending' && d.response_status !== 0) return false;
  return true;
}

function renderWebhooks() {
  const container = $('#webhook-table');
  container.innerHTML = '';
  const all = (state.data && state.data.webhook_deliveries) || [];
  const rows = all.filter(webhookMatches);
  if (rows.length === 0) {
    container.appendChild(el('div', { class: 'muted' }, [`No webhook deliveries (${all.length} total).`]));
    return;
  }
  const wrap = el('div', { class: 'table-scroll' });
  const table = el('table');
  const thead = el('thead');
  const headRow = el('tr');
  ['created_at', 'id', 'event_id', 'event_type', 'target_url', 'status', 'badge', 'error', 'actions'].forEach((c) => {
    headRow.appendChild(el('th', {}, [c]));
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  rows.forEach((d, idx) => {
    const tr = el('tr');
    tr.appendChild(el('td', {}, [d.created_at || '']));
    tr.appendChild(el('td', {}, [d.id || '']));
    tr.appendChild(el('td', {}, [d.event_id || '']));
    tr.appendChild(el('td', {}, [d.event_type || '']));
    tr.appendChild(el('td', { class: 'mono', style: 'max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, [d.target_url || '']));
    tr.appendChild(el('td', {}, [String(d.response_status ?? 0)]));
    tr.appendChild(el('td', {}, [webhookBadge(d)]));
    tr.appendChild(el('td', {}, [d.error || '']));

    const detailId = `wh-detail-${idx}`;
    const actions = el('div', { class: 'row-actions' }, [
      el('button', { class: 'btn small', onclick: () => replayDelivery(d.id) }, ['Replay']),
      el('button', { class: 'btn small', onclick: () => copy(d.request_body || '') }, ['Copy req']),
      el('button', { class: 'btn small', onclick: () => copy(d.request_headers || '') }, ['Copy headers']),
      el('button', { class: 'btn small', onclick: () => copy(d.response_body || '') }, ['Copy resp']),
      el('button', { class: 'btn small', onclick: () => {
        const node = document.getElementById(detailId);
        if (!node) return;
        node.style.display = node.style.display === 'none' ? '' : 'none';
      } }, ['Expand']),
    ]);
    tr.appendChild(el('td', {}, [actions]));
    tbody.appendChild(tr);

    const detailTr = el('tr', { class: 'detail-row', id: detailId, style: 'display:none' });
    const detailCell = el('td', { colspan: '9' });
    let reqBody = d.request_body || '';
    let respBody = d.response_body || '';
    try { reqBody = JSON.stringify(JSON.parse(reqBody), null, 2); } catch (_) {}
    try { respBody = JSON.stringify(JSON.parse(respBody), null, 2); } catch (_) {}
    let headers = d.request_headers || '';
    try { headers = JSON.stringify(JSON.parse(headers), null, 2); } catch (_) {}
    detailCell.appendChild(el('pre', {}, [
      'REQUEST HEADERS\n' + headers +
      '\n\nREQUEST BODY\n' + reqBody +
      '\n\nRESPONSE BODY\n' + respBody,
    ]));
    detailTr.appendChild(detailCell);
    tbody.appendChild(detailTr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  container.appendChild(wrap);
  container.appendChild(el('div', { class: 'mini' }, [`${rows.length} of ${all.length} deliveries shown`]));
}

async function replayDelivery(id) {
  try {
    const r = await api(`/admin/webhook/replay/${id}`, { method: 'POST' });
    await refresh();
    alert(`Replayed → status ${r.status}, delivery ${r.delivery_id}`);
  } catch (err) {
    alert('Replay failed: ' + err.message);
  }
}

// ---------- Event Sender ----------

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
  if (TEMPLATES[eventType]) return TEMPLATES[eventType];
  // Reasonable defaults for resource events
  if (eventType.startsWith('customer.')) return { kwik_customer_id: 'cus_xxx', customers_id: 'cus_xxx' };
  if (eventType.startsWith('mandate.')) return { kwik_mandate_id: 'man_xxx', mandate_id: 'man_xxx', kwik_customer_id: 'cus_xxx', status: 'ACTIVE' };
  if (eventType.startsWith('payment.')) return { kwik_payment_id: 'pay_xxx', payments_id: 'pay_xxx', amount: '100.00', payment_status: 'PAID', status: 'PAID' };
  if (eventType.startsWith('transaction.')) return { transaction_id: 'txn_xxx', kwik_payment_id: 'pay_xxx', amount: '100.00', status: 'PAID' };
  if (eventType.startsWith('checkout.')) return { checkout_id: 'cho_xxx', kwik_customer_id: 'cus_xxx', amount: '100.00', status: 'PAID' };
  if (eventType === 'bank_account.created') return { id: 'bac_xxx', customers_id: 'cus_xxx', bank_name: 'ABSA_BANK_LIMITED', bank_branch_code: '632005', status: 'ACTIVE' };
  return {};
}

function loadTemplate() {
  const type = $('#sender-event-type').value;
  const tmpl = templateFor(type);
  $('#sender-payload').value = JSON.stringify(tmpl, null, 2);
  setStatus('#sender-validation', 'Template loaded for ' + type, 'ok');
}

function buildTargetUrl(base) {
  const company = $('#sender-company').value.trim();
  const uuid = company || '{companyUuid}';
  $('#sender-target').value = `${base}/v1/webhook/kwik/${uuid}`;
}

function prettifyPayload() {
  try {
    const v = JSON.parse($('#sender-payload').value || '{}');
    $('#sender-payload').value = JSON.stringify(v, null, 2);
    setStatus('#sender-validation', 'OK', 'ok');
  } catch (e) {
    setStatus('#sender-validation', 'Invalid JSON: ' + e.message, 'err');
  }
}

async function sendWebhook() {
  const target = $('#sender-target').value.trim();
  const event_type = $('#sender-event-type').value;
  const authMode = $('#sender-auth-mode').value;
  const key = $('#sender-access-key').value;
  const secret = $('#sender-access-secret').value;
  const hmac = $('#sender-hmac-secret').value;

  if (!target) { setStatus('#sender-validation', 'Target URL is required', 'err'); return; }
  let payload;
  try { payload = JSON.parse($('#sender-payload').value || '{}'); }
  catch (e) { setStatus('#sender-validation', 'Invalid JSON payload: ' + e.message, 'err'); return; }

  setStatus('#sender-validation', 'Sending…');

  const body = { target_url: target, event_type, payload };
  if (authMode !== 'default' || key || secret || hmac) {
    body.auth = {};
    if (authMode !== 'default') body.auth.auth_mode = authMode;
    if (key) body.auth.access_key = key;
    if (secret) body.auth.access_secret = secret;
    if (hmac) body.auth.hmac_secret = hmac;
  }

  try {
    const r = await api('/admin/webhook/fire', { method: 'POST', body });
    setStatus('#sender-validation', r.ok ? 'Delivered' : 'Delivery returned non-2xx', r.ok ? 'ok' : 'err');
    renderSenderResult(r);
    await refresh();
  } catch (e) {
    setStatus('#sender-validation', 'Send failed: ' + e.message, 'err');
  }
}

function renderSenderResult(r) {
  const node = $('#sender-result');
  node.innerHTML = '';
  const meta = el('div', { class: 'mini' }, [
    `delivery=${r.delivery_id || '?'} · http=${r.status || 0} · ok=${r.ok}`,
  ]);
  const actions = el('div', { class: 'btn-row' }, [
    r.delivery_id ? el('button', { class: 'btn small', onclick: () => replayDelivery(r.delivery_id) }, ['Replay']) : null,
    r.delivery_id ? el('button', { class: 'btn small', onclick: () => copy(r.delivery_id) }, ['Copy delivery ID']) : null,
  ]);
  node.appendChild(meta);
  node.appendChild(actions);
  node.appendChild(el('pre', {}, [JSON.stringify(r, null, 2)]));
}

// ---------- Scenario Settings ----------

function renderScenarioForm() {
  const sc = (state.data && state.data.scenario) || {};
  $('#sc-authMode').value = sc.authMode || 'loose';
  $('#sc-webhookAuthMode').value = sc.webhookAuthMode || 'basic';
  $('#sc-cdvFailUnknown').checked = !!sc.cdvFailUnknown;
  $('#sc-avsFailUnknown').checked = !!sc.avsFailUnknown;
  $('#sc-defaultNotifyUrl').value = sc.defaultNotifyUrl || '';
  $('#sc-webhookAccessKey').value = sc.webhookAccessKey || '';
  $('#sc-webhookAccessSecret').value = sc.webhookAccessSecret || '';
  $('#sc-webhookHmacSecret').value = sc.webhookHmacSecret || '';
}

async function saveScenario() {
  const patch = {
    authMode: $('#sc-authMode').value,
    webhookAuthMode: $('#sc-webhookAuthMode').value,
    cdvFailUnknown: $('#sc-cdvFailUnknown').checked,
    avsFailUnknown: $('#sc-avsFailUnknown').checked,
    defaultNotifyUrl: $('#sc-defaultNotifyUrl').value || null,
    webhookAccessKey: $('#sc-webhookAccessKey').value,
    webhookAccessSecret: $('#sc-webhookAccessSecret').value,
    webhookHmacSecret: $('#sc-webhookHmacSecret').value,
  };
  try {
    await api('/admin/scenario', { method: 'POST', body: patch });
    setStatus('#scenario-result', 'Saved', 'ok');
    await refresh();
  } catch (e) {
    setStatus('#scenario-result', 'Save failed: ' + e.message, 'err');
  }
}

// ---------- Raw Data ----------

function renderRaw() {
  $('#raw-pretty').textContent = JSON.stringify(state.data || {}, null, 2);
}

async function refreshRaw() {
  try {
    const r = await api('/admin/data');
    state.data = r;
    renderRaw();
    setStatus('#raw-result', 'Refreshed', 'ok');
  } catch (e) {
    setStatus('#raw-result', e.message, 'err');
  }
}

// ---------- Admin action buttons ----------

async function runSeed() {
  setStatus('#actions-result', 'Re-seeding…');
  try {
    await api('/admin/seed', { method: 'POST' });
    setStatus('#actions-result', 'Re-seeded', 'ok');
    await refresh();
  } catch (e) {
    setStatus('#actions-result', 'Seed failed: ' + e.message, 'err');
  }
}

async function runReset(all) {
  if (!confirm(all ? 'Reset ALL data and re-seed?' : 'Reset transactional data?')) return;
  setStatus('#actions-result', 'Resetting…');
  try {
    await api('/admin/reset' + (all ? '?all=true' : ''), { method: 'DELETE' });
    setStatus('#actions-result', all ? 'Reset all + re-seeded' : 'Transactional data reset', 'ok');
    await refresh();
  } catch (e) {
    setStatus('#actions-result', 'Reset failed: ' + e.message, 'err');
  }
}

// ---------- Wiring ----------

function init() {
  $$('.tab').forEach((b) => b.addEventListener('click', () => activateTab(b.dataset.tab)));
  $$('.sub-tab').forEach((b) => b.addEventListener('click', () => activateRecord(b.dataset.record)));

  $('#btn-refresh').addEventListener('click', refresh);
  $('#btn-refresh-2').addEventListener('click', refresh);
  $('#btn-seed').addEventListener('click', runSeed);
  $('#btn-reset').addEventListener('click', () => runReset(false));
  $('#btn-reset-all').addEventListener('click', () => runReset(true));

  $('#record-filter').addEventListener('input', (e) => { state.recordFilter = e.target.value; renderRecords(); });

  $('#wh-event-type').addEventListener('input', (e) => { state.webhookFilters.eventType = e.target.value; renderWebhooks(); });
  $('#wh-success').addEventListener('change', (e) => { state.webhookFilters.success = e.target.value; renderWebhooks(); });
  $('#wh-target').addEventListener('input', (e) => { state.webhookFilters.target = e.target.value; renderWebhooks(); });
  $('#wh-event-id').addEventListener('input', (e) => { state.webhookFilters.eventId = e.target.value; renderWebhooks(); });

  $('#sender-event-type').addEventListener('change', loadTemplate);
  $('#btn-template').addEventListener('click', loadTemplate);
  $('#btn-pretty').addEventListener('click', prettifyPayload);
  $('#btn-copy-payload').addEventListener('click', () => copy($('#sender-payload').value));
  $('#btn-send').addEventListener('click', sendWebhook);
  $('#btn-build-local').addEventListener('click', () => buildTargetUrl('http://localhost:3005'));
  $('#btn-build-stage').addEventListener('click', () => buildTargetUrl('https://inner-api-stage.jobix.ai'));
  $('#btn-clear-target').addEventListener('click', () => { $('#sender-target').value = ''; });

  $('#btn-scenario-save').addEventListener('click', saveScenario);
  $('#btn-scenario-reset').addEventListener('click', renderScenarioForm);

  $('#btn-raw-refresh').addEventListener('click', refreshRaw);
  $('#btn-raw-copy').addEventListener('click', () => copy(JSON.stringify(state.data || {}, null, 2)));

  loadTemplate();
  refresh();
}

document.addEventListener('DOMContentLoaded', init);
