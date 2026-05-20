import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentEntity } from '../database/entities/payment.entity';
import { MandateEntity } from '../database/entities/mandate.entity';
import { WebhookDeliveryService } from '../webhook-delivery/webhook-delivery.service';
import { genId } from '../common/gen-id.util';
import { mockConfig } from '../common/mock-config';
import { resolvePaymentNotifyUrl } from '../common/resolve-payment-notify-url.util';

const VALID_STATUSES = ['CANCELLED', 'COMPLETED', 'NO_REPLY', 'PAUSED', 'PENDING', 'REJECTED', 'RUNNING', 'STOPPED'];

type PaymentSubmitEntry = {
  customer_id?: string;
  customer?: Record<string, unknown>;
  bank_account_id?: string;
  bank_account?: Record<string, unknown>;
  bank?: Record<string, unknown>;
  mandate_id?: string;
  mandate?: {
    amount?: string;
    recurring?: {
      process_day?: number;
      payment_interval?: string;
      date_release?: string;
    };
    ['one-time']?: { process_date?: string };
    payment_industry?: string;
    debicheck?: Record<string, unknown>;
  };
  payment?: {
    amount?: string;
    payment_methods_id?: string;
    transaction_reference?: string;
    recurring?: {
      process_day?: number;
      date_start?: string;
      date_end?: string;
    };
    ['one-time']?: { process_date?: string };
  };
  notify_url?: string;
};

interface SubmitPaymentDto {
  batch_reference?: string;
  payments?: PaymentSubmitEntry[];
  customer_id?: string;
  bank_account_id?: string;
  customers_id?: string;
  bank_accounts_id?: string;
  payment_methods_id?: string;
  amount?: string;
  process_day?: number;
  payment_interval?: string;
  date_start?: string;
  date_end?: string;
  notify_url?: string;
  webhook_url?: string;
  callback_url?: string;
  company_uuid?: string;
}

type NormalizedSubmitPayment = {
  customer_id: string;
  bank_account_id: string;
  mandate_id?: string;
  payment_methods_id: string;
  amount: string;
  process_day?: number;
  payment_interval?: string;
  date_start?: string;
  date_end?: string;
  notify_url?: string;
  transaction_reference?: string;
  mandate?: PaymentSubmitEntry['mandate'];
};

export interface CompletePaymentOptions {
  company_uuid?: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
    @InjectRepository(MandateEntity)
    private readonly mandateRepo: Repository<MandateEntity>,
    private readonly webhookDelivery: WebhookDeliveryService,
  ) {}

  async submit(dto: SubmitPaymentDto): Promise<object[]> {
    const requests = this.normalizeSubmitRequests(dto);
    const results: object[] = [];

    for (const request of requests) {
      if (!/^\d+(\.\d+)?$/.test(request.amount) || parseFloat(request.amount) <= 0) {
        throw new BadRequestException({ status: false, error_code: '002', error_message: 'amount must be a positive decimal string' });
      }

      const mandateId = request.mandate_id || genId('man');
      const paymentId = genId('pay');
      const notifyUrl = request.notify_url ?? dto.webhook_url ?? dto.callback_url ?? null;
      const companyUuid = dto.company_uuid?.trim() || mockConfig.defaultCompanyUuid?.trim() || null;

      const mandate = this.mandateRepo.create({
        id: mandateId,
        payments_id: paymentId,
        customers_id: request.customer_id,
        bank_accounts_id: request.bank_account_id,
        status: 'PENDING',
      });
      await this.mandateRepo.save(mandate);

      const payment = this.paymentRepo.create({
        id: paymentId,
        mandate_id: mandateId,
        customers_id: request.customer_id,
        bank_accounts_id: request.bank_account_id,
        payment_methods_id: request.payment_methods_id,
        amount: request.amount,
        process_day: request.process_day ?? null,
        payment_interval: request.payment_interval ?? null,
        date_start: request.date_start ?? null,
        date_end: request.date_end ?? null,
        notify_url: notifyUrl,
        company_uuid: companyUuid,
        status: 'RUNNING',
      });
      await this.paymentRepo.save(payment);

      const effectiveNotifyUrl = resolvePaymentNotifyUrl(payment);
      if (effectiveNotifyUrl) {
        this.deliverInitialWebhooksAfterResponse({
          targetUrl: effectiveNotifyUrl,
          mandateId,
          paymentId,
          customerId: request.customer_id,
          bankAccountId: request.bank_account_id,
          amount: request.amount,
        });
      }

      results.push(this.serializePayment(payment, dto.batch_reference, request));
    }

    return results;
  }

  private normalizeSubmitRequests(dto: SubmitPaymentDto): NormalizedSubmitPayment[] {
    if (Array.isArray(dto.payments) && dto.payments.length > 0) {
      return dto.payments.map((entry, index) => {
        const payment = entry.payment ?? {};
        const mandate = entry.mandate ?? {};
        const recurring = payment.recurring ?? mandate.recurring ?? {};
        const customerId = entry.customer_id ?? this.stringValue(entry.customer?.id);
        const bankAccountId =
          entry.bank_account_id ??
          this.stringValue(entry.bank_account?.id) ??
          this.stringValue(entry.bank?.id);
        const amount = payment.amount ?? mandate.amount;
        const paymentMethodsId = payment.payment_methods_id;

        this.requireValue(customerId, `payments.${index}.customer_id`);
        this.requireValue(bankAccountId, `payments.${index}.bank_account_id`);
        this.requireValue(paymentMethodsId, `payments.${index}.payment.payment_methods_id`);
        this.requireValue(amount, `payments.${index}.payment.amount`);

        return {
          customer_id: customerId!,
          bank_account_id: bankAccountId!,
          mandate_id: entry.mandate_id,
          payment_methods_id: paymentMethodsId!,
          amount: amount!,
          process_day: recurring.process_day,
          payment_interval: mandate.recurring?.payment_interval,
          date_start: payment.recurring?.date_start,
          date_end: payment.recurring?.date_end,
          notify_url: entry.notify_url,
          transaction_reference: payment.transaction_reference,
          mandate,
        };
      });
    }

    const customerId = dto.customer_id ?? dto.customers_id;
    const bankAccountId = dto.bank_account_id ?? dto.bank_accounts_id;
    this.requireValue(customerId, 'customer_id');
    this.requireValue(bankAccountId, 'bank_account_id');
    this.requireValue(dto.payment_methods_id, 'payment_methods_id');
    this.requireValue(dto.amount, 'amount');
    return [{
      customer_id: customerId!,
      bank_account_id: bankAccountId!,
      payment_methods_id: dto.payment_methods_id!,
      amount: dto.amount!,
      process_day: dto.process_day,
      payment_interval: dto.payment_interval,
      date_start: dto.date_start,
      date_end: dto.date_end,
      notify_url: dto.notify_url,
    }];
  }

  private requireValue(value: unknown, field: string): void {
    if (!value) {
      throw new BadRequestException({ status: false, error_code: '002', error_message: `Field "${field}" is required` });
    }
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private serializePayment(
    payment: PaymentEntity,
    batchReference: string | undefined,
    request: NormalizedSubmitPayment,
  ): object {
    return {
      payments_id: payment.id,
      deleted_at: null,
      updated_at: null,
      created_at: this.formatDate(payment.created_at),
      batch_reference: batchReference ?? null,
      customer_id: payment.customers_id,
      bank_account_id: payment.bank_accounts_id,
      mandate_id: payment.mandate_id,
      mandate: {
        ...(request.mandate ?? {}),
        mandate_status: 'PENDING',
      },
      payment: {
        amount: payment.amount,
        payment_methods_id: payment.payment_methods_id,
        ...(request.transaction_reference ? { transaction_reference: request.transaction_reference } : {}),
        payment_status: payment.status,
        ...(payment.process_day || payment.date_start || payment.date_end
          ? {
              recurring: {
                ...(payment.process_day ? { process_day: payment.process_day } : {}),
                ...(payment.date_start ? { date_start: payment.date_start } : {}),
                ...(payment.date_end ? { date_end: payment.date_end } : {}),
              },
            }
          : {}),
      },
    };
  }

  private formatDate(value?: Date): string {
    const date = value ?? new Date();
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  private deliverInitialWebhooksAfterResponse(args: {
    targetUrl: string;
    mandateId: string;
    paymentId: string;
    customerId: string;
    bankAccountId: string;
    amount: string;
  }): void {
    setTimeout(() => {
      void this.deliverInitialWebhooks(args).catch((error) => {
        this.logger.error(
          `Failed to deliver initial payment webhooks for ${args.paymentId}`,
          error instanceof Error ? error.stack : String(error),
        );
      });
    }, 1000);
  }

  private async deliverInitialWebhooks(args: {
    targetUrl: string;
    mandateId: string;
    paymentId: string;
    customerId: string;
    bankAccountId: string;
    amount: string;
  }): Promise<void> {
    await this.webhookDelivery.deliver({
      event_type: 'MANDATE_UPDATED',
      target_url: args.targetUrl,
      payload: {
        id: args.mandateId,
        payment_id: args.paymentId,
        customer_id: args.customerId,
        bank_account_id: args.bankAccountId,
        mandate_status: 'PENDING',
      },
    });
    await this.webhookDelivery.deliver({
      event_type: 'PAYMENT_UPDATED',
      target_url: args.targetUrl,
      payload: {
        payments_id: args.paymentId,
        mandate_id: args.mandateId,
        customer_id: args.customerId,
        bank_account_id: args.bankAccountId,
        transaction_id: genId('txn'),
        payment: {
          amount: args.amount,
          payment_status: 'RUNNING',
        },
        payment_status: 'RUNNING',
      },
    });
  }

  async updateStatus(paymentsId: string, status: string): Promise<object> {
    if (!VALID_STATUSES.includes(status)) {
      throw new BadRequestException({
        status: false,
        error_code: '002',
        error_message: `Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    const payment = await this.paymentRepo.findOne({ where: { id: paymentsId } });
    if (!payment) {
      throw new NotFoundException({ status: false, error_code: '007', error_message: 'Payment not found' });
    }
    await this.paymentRepo.update(paymentsId, { status });
    payment.status = status;

    await this.deliverPaymentStatusWebhook(payment, status);

    return { status: true };
  }

  /** Test helper: mark an existing payment as COMPLETED and deliver a payment.updated webhook. */
  async complete(paymentsId: string, options: CompletePaymentOptions = {}): Promise<object> {
    const payment = await this.paymentRepo.findOne({ where: { id: paymentsId } });
    if (!payment) {
      throw new NotFoundException({ status: false, error_code: '007', error_message: 'Payment not found' });
    }
    if (payment.status === 'COMPLETED') {
      throw new BadRequestException({
        status: false,
        error_code: '002',
        error_message: 'Payment is already COMPLETED',
      });
    }

    const companyUuid = options.company_uuid?.trim()
      || payment.company_uuid?.trim()
      || mockConfig.defaultCompanyUuid?.trim()
      || null;

    if (companyUuid && !payment.company_uuid) {
      await this.paymentRepo.update(paymentsId, { company_uuid: companyUuid });
      payment.company_uuid = companyUuid;
    }

    await this.paymentRepo.update(paymentsId, { status: 'COMPLETED' });
    payment.status = 'COMPLETED';

    if (payment.mandate_id) {
      await this.mandateRepo.update(payment.mandate_id, { status: 'ACTIVE' });
    }

    const webhookDelivered = await this.deliverPaymentStatusWebhook(payment, 'COMPLETED');

    return {
      id: paymentsId,
      status: 'COMPLETED',
      mandate_id: payment.mandate_id,
      company_uuid: payment.company_uuid ?? companyUuid,
      webhook_delivered: webhookDelivered,
      webhook_target_url: webhookDelivered ? resolvePaymentNotifyUrl(payment) : null,
    };
  }

  private async deliverPaymentStatusWebhook(payment: PaymentEntity, status: string): Promise<boolean> {
    const targetUrl = resolvePaymentNotifyUrl(payment);
    if (!targetUrl) {
      this.logger.warn(
        `Skipping PAYMENT_UPDATED webhook for ${payment.id}: set payment.company_uuid, notify_url, or MOCK_DEFAULT_COMPANY_UUID`,
      );
      return false;
    }

    await this.webhookDelivery.deliver({
      event_type: 'PAYMENT_UPDATED',
      target_url: targetUrl,
      payload: {
        payments_id: payment.id,
        mandate_id: payment.mandate_id,
        customer_id: payment.customers_id,
        bank_account_id: payment.bank_accounts_id,
        transaction_id: genId('txn'),
        payment: {
          amount: payment.amount,
          payment_status: status,
        },
        payment_status: status,
      },
    });
    return true;
  }
}
