import { mockConfig } from './mock-config';

const COMPANY_UUID_PLACEHOLDER = '{companyUuid}';

export const DEFAULT_PAYMENT_NOTIFY_URL_TEMPLATE =
  'http://localhost:3005/v1/webhook/kwik/{companyUuid}';

export interface PaymentNotifySource {
  notify_url?: string | null;
  company_uuid?: string | null;
}

/** Resolves webhook target: payment.notify_url, else default template with {companyUuid} from payment. */
export function resolvePaymentNotifyUrl(payment: PaymentNotifySource): string | null {
  const explicit = payment.notify_url?.trim();
  if (explicit) return explicit;

  const template = (mockConfig.defaultNotifyUrl ?? DEFAULT_PAYMENT_NOTIFY_URL_TEMPLATE).trim();
  if (!template) return null;

  const companyUuid = payment.company_uuid?.trim() || mockConfig.defaultCompanyUuid?.trim() || null;
  if (!companyUuid) {
    return template.includes(COMPANY_UUID_PLACEHOLDER) ? null : template;
  }

  return template.split(COMPANY_UUID_PLACEHOLDER).join(companyUuid);
}
