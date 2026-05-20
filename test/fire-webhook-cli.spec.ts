const {
  parseArgs,
  buildRequestBody,
  resolveTargetUrl,
  parseSetValue,
} = require('../scripts/fire-webhook-lib.cjs');

describe('fire-webhook CLI helpers', () => {
  it('builds the same admin webhook body shape with template, overrides, and auth override', async () => {
    const args = parseArgs([
      '--target-url', 'http://example.com/webhook/kwik/co-1',
      '--event-type', 'PAYMENT_STATUS',
      '--template',
      '--set', 'kwik_payment_id=pay_live_1',
      '--set', 'status=FAILED',
      '--set', 'amount=100.00',
      '--auth-mode', 'basic',
      '--access-key', 'cli_key',
      '--access-secret', 'cli_secret',
    ]);

    const body = await buildRequestBody(args);

    expect(body).toEqual({
      target_url: 'http://example.com/webhook/kwik/co-1',
      event_type: 'PAYMENT_STATUS',
      payload: {
        kwik_payment_id: 'pay_live_1',
        payments_id: 'pay_xxx',
        kwik_mandate_id: 'man_xxx',
        mandate_id: 'man_xxx',
        kwik_customer_id: 'cus_xxx',
        customers_id: 'cus_xxx',
        transaction_id: 'txn_xxx',
        amount: '100.00',
        payment_status: 'PAID',
        status: 'FAILED',
      },
      auth: {
        auth_mode: 'basic',
        access_key: 'cli_key',
        access_secret: 'cli_secret',
      },
    });
  });

  it('builds target URL from preset and reads payload from file content', async () => {
    const args = parseArgs([
      '--target-preset', 'local',
      '--company-uuid', 'co-xyz',
      '--event-type', 'payment.updated',
      '--payload-file', '/tmp/payload.json',
    ]);

    const body = await buildRequestBody(args, async () => JSON.stringify({ status: 'PAID', nested: { ok: true } }));

    expect(resolveTargetUrl(args)).toBe('http://localhost:3005/v1/webhook/kwik/co-xyz');
    expect(body).toEqual({
      target_url: 'http://localhost:3005/v1/webhook/kwik/co-xyz',
      event_type: 'payment.updated',
      payload: { status: 'PAID', nested: { ok: true } },
    });
  });

  it('keeps plain --set numbers as strings and parses structured JSON values', () => {
    expect(parseSetValue('100.00')).toBe('100.00');
    expect(parseSetValue('true')).toBe(true);
    expect(parseSetValue('{"ok":true}')).toEqual({ ok: true });
  });
});
