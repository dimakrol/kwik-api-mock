import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { ADMIN_RECORD_RESOURCES, type AdminRecordResource, isAdminRecordResource } from './admin-records.util';
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

  async deleteRecord(resource: string, id: string): Promise<{ ok: true; resource: AdminRecordResource; id: string }> {
    if (!id?.trim()) {
      throw new BadRequestException({ ok: false, message: 'Record id is required' });
    }
    if (!isAdminRecordResource(resource)) {
      throw new BadRequestException({
        ok: false,
        message: `Unknown resource "${resource}". Allowed: ${ADMIN_RECORD_RESOURCES.join(', ')}`,
      });
    }

    const deleted = await this.deleteRecordByType(resource, id.trim());
    if (!deleted) {
      throw new NotFoundException({ ok: false, message: `${resource} "${id}" not found` });
    }

    return { ok: true, resource, id: id.trim() };
  }

  async deleteRecords(
    resource: string,
    ids: string[],
  ): Promise<{
    ok: true;
    resource: AdminRecordResource;
    deleted: string[];
    notFound: string[];
  }> {
    if (!isAdminRecordResource(resource)) {
      throw new BadRequestException({
        ok: false,
        message: `Unknown resource "${resource}". Allowed: ${ADMIN_RECORD_RESOURCES.join(', ')}`,
      });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException({ ok: false, message: 'ids array is required and must not be empty' });
    }

    const uniqueIds = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
    const deleted: string[] = [];
    const notFound: string[] = [];

    for (const id of uniqueIds) {
      const removed = await this.deleteRecordByType(resource, id);
      if (removed) deleted.push(id);
      else notFound.push(id);
    }

    return { ok: true, resource, deleted, notFound };
  }

  private async deleteRecordByType(resource: AdminRecordResource, id: string): Promise<boolean> {
    switch (resource) {
      case 'payment_methods': {
        await this.lookupRepo.delete({ payment_methods_id: id });
        const result = await this.paymentMethodRepo.delete({ id });
        return (result.affected ?? 0) > 0;
      }
      case 'lookups': {
        const result = await this.lookupRepo.delete({ id });
        return (result.affected ?? 0) > 0;
      }
      case 'customers': {
        await this.bankAccountRepo.delete({ customers_id: id });
        const payments = await this.paymentRepo.find({ where: { customers_id: id } });
        for (const payment of payments) {
          await this.deletePaymentCascade(payment.id);
        }
        const mandates = await this.mandateRepo.find({ where: { customers_id: id } });
        if (mandates.length > 0) {
          await this.mandateRepo.delete({ id: In(mandates.map((m) => m.id)) });
        }
        await this.checkoutRepo.delete({ customers_id: id });
        const result = await this.customerRepo.delete({ id });
        return (result.affected ?? 0) > 0;
      }
      case 'bank_accounts': {
        const result = await this.bankAccountRepo.delete({ id });
        return (result.affected ?? 0) > 0;
      }
      case 'payments':
        return this.deletePaymentCascade(id);
      case 'mandates': {
        const mandate = await this.mandateRepo.findOne({ where: { id } });
        if (!mandate) return false;
        if (mandate.payments_id) {
          await this.paymentRepo.update(mandate.payments_id, { mandate_id: null });
        }
        const result = await this.mandateRepo.delete({ id });
        return (result.affected ?? 0) > 0;
      }
      case 'checkout_sessions': {
        const result = await this.checkoutRepo.delete({ id });
        return (result.affected ?? 0) > 0;
      }
      case 'webhook_deliveries': {
        const result = await this.webhookDeliveryService.deleteById(id);
        return result;
      }
      default:
        return false;
    }
  }

  private async deletePaymentCascade(paymentId: string): Promise<boolean> {
    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
    if (!payment) return false;

    if (payment.mandate_id) {
      await this.mandateRepo.delete({ id: payment.mandate_id });
    }
    await this.mandateRepo.delete({ payments_id: paymentId });

    const result = await this.paymentRepo.delete({ id: paymentId });
    return (result.affected ?? 0) > 0;
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
