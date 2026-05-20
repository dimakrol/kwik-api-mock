import { mockConfig } from '../src/common/mock-config';
import { resolvePaymentNotifyUrl } from '../src/common/resolve-payment-notify-url.util';

describe('resolvePaymentNotifyUrl', () => {
  const originalNotifyUrl = mockConfig.defaultNotifyUrl;
  const originalCompanyUuid = mockConfig.defaultCompanyUuid;

  afterEach(() => {
    mockConfig.defaultNotifyUrl = originalNotifyUrl;
    mockConfig.defaultCompanyUuid = originalCompanyUuid;
  });

  it('prefers explicit notify_url on payment', () => {
    expect(
      resolvePaymentNotifyUrl({
        notify_url: 'https://custom.example/hook',
        company_uuid: 'co-1',
      }),
    ).toBe('https://custom.example/hook');
  });

  it('substitutes {companyUuid} from payment into default template', () => {
    mockConfig.defaultNotifyUrl = 'http://localhost:3005/v1/webhook/kwik/{companyUuid}';
    expect(
      resolvePaymentNotifyUrl({ company_uuid: 'my-company-uuid' }),
    ).toBe('http://localhost:3005/v1/webhook/kwik/my-company-uuid');
  });

  it('returns null when template needs companyUuid but payment has none', () => {
    mockConfig.defaultNotifyUrl = 'http://localhost:3005/v1/webhook/kwik/{companyUuid}';
    mockConfig.defaultCompanyUuid = null;
    expect(resolvePaymentNotifyUrl({})).toBeNull();
  });

  it('uses mockConfig.defaultCompanyUuid when payment has no company_uuid', () => {
    mockConfig.defaultCompanyUuid = 'env-co';
    expect(resolvePaymentNotifyUrl({})).toBe('http://localhost:3005/v1/webhook/kwik/env-co');
    mockConfig.defaultCompanyUuid = null;
  });
});
