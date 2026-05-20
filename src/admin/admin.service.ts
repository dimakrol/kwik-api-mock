import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { PaymentMethodEntity } from '../database/entities/payment-method.entity';
import { LookupEntity } from '../database/entities/lookup.entity';
import { CustomerEntity } from '../database/entities/customer.entity';
import { BankAccountEntity } from '../database/entities/bank-account.entity';
import { PaymentEntity } from '../database/entities/payment.entity';
import { MandateEntity } from '../database/entities/mandate.entity';
import { CheckoutSessionEntity } from '../database/entities/checkout-session.entity';
import { WebhookDeliveryService } from '../webhook-delivery/webhook-delivery.service';
import { SeedService } from '../seed/seed.service';
import { PaymentsService } from '../payments/payments.service';
import { mockConfig } from '../common/mock-config';

interface FireWebhookDto {
  target_url: string;
  event_type: string;
  payload: Record<string, unknown>;
  auth?: {
    access_key?: string;
    access_secret?: string;
    auth_mode?: string;
    hmac_secret?: string;
  };
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(PaymentMethodEntity)
    private readonly paymentMethodRepo: Repository<PaymentMethodEntity>,
    @InjectRepository(LookupEntity)
    private readonly lookupRepo: Repository<LookupEntity>,
    @InjectRepository(CustomerEntity)
    private readonly customerRepo: Repository<CustomerEntity>,
    @InjectRepository(BankAccountEntity)
    private readonly bankAccountRepo: Repository<BankAccountEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
    @InjectRepository(MandateEntity)
    private readonly mandateRepo: Repository<MandateEntity>,
    @InjectRepository(CheckoutSessionEntity)
    private readonly checkoutRepo: Repository<CheckoutSessionEntity>,
    private readonly webhookDeliveryService: WebhookDeliveryService,
    private readonly seedService: SeedService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async completePayment(
    paymentsId: string,
    options: { company_uuid?: string } = {},
  ): Promise<object> {
    const payments = await this.paymentsService.complete(paymentsId, options);
    return { ok: true, payments };
  }

  async fireWebhook(dto: FireWebhookDto): Promise<object> {
    try {
      const delivery = await this.webhookDeliveryService.deliver({
        event_type: dto.event_type,
        target_url: dto.target_url,
        payload: dto.payload,
        auth_override: dto.auth,
      });
      return {
        ok: delivery.success,
        delivery_id: delivery.id,
        status: delivery.response_status,
        body: delivery.response_body ? JSON.parse(delivery.response_body) : null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Webhook fire failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  async replayWebhook(deliveryId: string): Promise<object> {
    const delivery = await this.webhookDeliveryService.replay(deliveryId);
    return {
      ok: delivery.success,
      delivery_id: delivery.id,
      status: delivery.response_status,
      body: delivery.response_body ? JSON.parse(delivery.response_body) : null,
    };
  }

  async getAllData(): Promise<object> {
    const [payment_methods, lookups, customers, bank_accounts, payments, mandates, checkout_sessions, webhook_deliveries] =
      await Promise.all([
        this.paymentMethodRepo.find(),
        this.lookupRepo.find(),
        this.customerRepo.find(),
        this.bankAccountRepo.find(),
        this.paymentRepo.find(),
        this.mandateRepo.find(),
        this.checkoutRepo.find(),
        this.webhookDeliveryService.findAll(),
      ]);

    return {
      payment_methods,
      lookups,
      customers,
      bank_accounts,
      payments,
      mandates,
      checkout_sessions,
      webhook_deliveries,
      scenario: mockConfig.getAll(),
    };
  }

  async getInterfaceData(): Promise<object> {
    const data = (await this.getAllData()) as {
      payment_methods: unknown[];
      lookups: unknown[];
      customers: unknown[];
      bank_accounts: unknown[];
      payments: unknown[];
      mandates: unknown[];
      checkout_sessions: unknown[];
      webhook_deliveries: Array<{ success: boolean }>;
      scenario: object;
    };

    const webhook_success = data.webhook_deliveries.filter((d) => d.success).length;
    const webhook_failed = data.webhook_deliveries.length - webhook_success;

    return {
      data,
      summary: {
        payment_methods: data.payment_methods.length,
        lookups: data.lookups.length,
        customers: data.customers.length,
        bank_accounts: data.bank_accounts.length,
        payments: data.payments.length,
        mandates: data.mandates.length,
        checkout_sessions: data.checkout_sessions.length,
        webhook_deliveries: data.webhook_deliveries.length,
        webhook_success,
        webhook_failed,
      },
    };
  }

  async resetData(all = false): Promise<void> {
    await this.webhookDeliveryService.clear();
    await this.checkoutRepo.clear();
    await this.mandateRepo.clear();
    await this.paymentRepo.clear();
    await this.bankAccountRepo.clear();

    if (all) {
      await this.customerRepo.clear();
      await this.lookupRepo.clear();
      await this.paymentMethodRepo.clear();
      await this.seedService.seed();
    } else {
      await this.customerRepo.delete({ id: Not('cus_test_001') });
    }
  }

  async runSeed(): Promise<void> {
    await this.seedService.seed();
  }

  getScenario(): object {
    return mockConfig.getAll();
  }

  updateScenario(patch: Record<string, unknown>): object {
    if (typeof patch.authMode === 'string') mockConfig.authMode = patch.authMode;
    if (typeof patch.cdvFailUnknown === 'boolean') mockConfig.cdvFailUnknown = patch.cdvFailUnknown;
    if (typeof patch.avsFailUnknown === 'boolean') mockConfig.avsFailUnknown = patch.avsFailUnknown;
    if ('defaultNotifyUrl' in patch) mockConfig.defaultNotifyUrl = (patch.defaultNotifyUrl as string | null) ?? null;
    if ('defaultCompanyUuid' in patch) {
      mockConfig.defaultCompanyUuid = (patch.defaultCompanyUuid as string | null) ?? null;
    }
    if (typeof patch.webhookAuthMode === 'string') mockConfig.webhookAuthMode = patch.webhookAuthMode;
    if (typeof patch.webhookAccessKey === 'string') mockConfig.webhookAccessKey = patch.webhookAccessKey;
    if (typeof patch.webhookAccessSecret === 'string') mockConfig.webhookAccessSecret = patch.webhookAccessSecret;
    if (typeof patch.webhookHmacSecret === 'string') mockConfig.webhookHmacSecret = patch.webhookHmacSecret;
    return mockConfig.getAll();
  }
}
