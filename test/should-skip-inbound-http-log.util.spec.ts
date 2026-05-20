import { shouldSkipInboundHttpLog } from '../src/common/logging/should-skip-inbound-http-log.util';

describe('shouldSkipInboundHttpLog', () => {
  it('should skip dashboard SPA routes and assets', () => {
    expect(shouldSkipInboundHttpLog('/')).toBe(true);
    expect(shouldSkipInboundHttpLog('/interface')).toBe(true);
    expect(shouldSkipInboundHttpLog('/interface/overview')).toBe(true);
    expect(shouldSkipInboundHttpLog('/interface/records/payments')).toBe(true);
    expect(shouldSkipInboundHttpLog('/interface/assets/app.js')).toBe(true);
  });

  it('should skip docs and interface-data polling', () => {
    expect(shouldSkipInboundHttpLog('/docs')).toBe(true);
    expect(shouldSkipInboundHttpLog('/admin/interface-data')).toBe(true);
  });

  it('should not skip API routes', () => {
    expect(shouldSkipInboundHttpLog('/admin/data')).toBe(false);
    expect(shouldSkipInboundHttpLog('/1.0/customers')).toBe(false);
    expect(shouldSkipInboundHttpLog('/admin/records/payments/pay_abc')).toBe(false);
  });
});
