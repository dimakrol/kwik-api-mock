/** Runtime-mutable config. Falls back to env vars when no override is set. */
const overrides: {
  authMode: string | null;
  cdvFailUnknown: boolean | null;
  avsFailUnknown: boolean | null;
  defaultNotifyUrl: string | null;
  defaultCompanyUuid: string | null;
  webhookAuthMode: string | null;
  webhookAccessKey: string | null;
  webhookAccessSecret: string | null;
  webhookHmacSecret: string | null;
} = {
  authMode: null,
  cdvFailUnknown: null,
  avsFailUnknown: null,
  defaultNotifyUrl: null,
  defaultCompanyUuid: null,
  webhookAuthMode: null,
  webhookAccessKey: null,
  webhookAccessSecret: null,
  webhookHmacSecret: null,
};

export const mockConfig = {
  get authMode(): string { return overrides.authMode ?? process.env.MOCK_AUTH_MODE ?? 'loose'; },
  set authMode(v: string) { overrides.authMode = v; },

  get cdvFailUnknown(): boolean { return overrides.cdvFailUnknown ?? process.env.CDV_FAIL_UNKNOWN === 'true'; },
  set cdvFailUnknown(v: boolean) { overrides.cdvFailUnknown = v; },

  get avsFailUnknown(): boolean { return overrides.avsFailUnknown ?? process.env.AVS_FAIL_UNKNOWN === 'true'; },
  set avsFailUnknown(v: boolean) { overrides.avsFailUnknown = v; },

  get defaultNotifyUrl(): string | null { return overrides.defaultNotifyUrl ?? process.env.MOCK_DEFAULT_NOTIFY_URL ?? null; },
  set defaultNotifyUrl(v: string | null) { overrides.defaultNotifyUrl = v; },

  get defaultCompanyUuid(): string | null {
    return overrides.defaultCompanyUuid ?? process.env.MOCK_DEFAULT_COMPANY_UUID ?? null;
  },
  set defaultCompanyUuid(v: string | null) { overrides.defaultCompanyUuid = v; },

  get webhookAuthMode(): string { return overrides.webhookAuthMode ?? process.env.MOCK_WEBHOOK_AUTH_MODE ?? 'basic'; },
  set webhookAuthMode(v: string) { overrides.webhookAuthMode = v; },

  get webhookAccessKey(): string { return overrides.webhookAccessKey ?? process.env.MOCK_WEBHOOK_ACCESS_KEY ?? 'test_key'; },
  set webhookAccessKey(v: string) { overrides.webhookAccessKey = v; },

  get webhookAccessSecret(): string { return overrides.webhookAccessSecret ?? process.env.MOCK_WEBHOOK_ACCESS_SECRET ?? 'test_secret'; },
  set webhookAccessSecret(v: string) { overrides.webhookAccessSecret = v; },

  get webhookHmacSecret(): string { return overrides.webhookHmacSecret ?? process.env.MOCK_WEBHOOK_HMAC_SECRET ?? ''; },
  set webhookHmacSecret(v: string) { overrides.webhookHmacSecret = v; },

  get mockAccessKey(): string { return process.env.MOCK_ACCESS_KEY ?? 'test_key'; },
  get mockAccessSecret(): string { return process.env.MOCK_ACCESS_SECRET ?? 'test_secret'; },

  reset(): void {
    overrides.authMode = null;
    overrides.cdvFailUnknown = null;
    overrides.avsFailUnknown = null;
    overrides.defaultNotifyUrl = null;
    overrides.defaultCompanyUuid = null;
    overrides.webhookAuthMode = null;
    overrides.webhookAccessKey = null;
    overrides.webhookAccessSecret = null;
    overrides.webhookHmacSecret = null;
  },

  getAll(): object {
    return {
      authMode: this.authMode,
      cdvFailUnknown: this.cdvFailUnknown,
      avsFailUnknown: this.avsFailUnknown,
      defaultNotifyUrl: this.defaultNotifyUrl,
      defaultCompanyUuid: this.defaultCompanyUuid,
      webhookAuthMode: this.webhookAuthMode,
      webhookAccessKey: this.webhookAccessKey,
      webhookAccessSecret: this.webhookAccessSecret,
      webhookHmacSecret: this.webhookHmacSecret,
    };
  },
};
