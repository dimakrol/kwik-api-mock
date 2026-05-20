export const ADMIN_RECORD_RESOURCES = [
  'payment_methods',
  'lookups',
  'customers',
  'bank_accounts',
  'payments',
  'mandates',
  'checkout_sessions',
  'webhook_deliveries',
] as const;

export type AdminRecordResource = (typeof ADMIN_RECORD_RESOURCES)[number];

export function isAdminRecordResource(value: string): value is AdminRecordResource {
  return (ADMIN_RECORD_RESOURCES as readonly string[]).includes(value);
}
