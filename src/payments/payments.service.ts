import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentEntity } from '../database/entities/payment.entity';
import { MandateEntity } from '../database/entities/mandate.entity';
import { WebhookDeliveryService } from '../webhook-delivery/webhook-delivery.service';
import { genId } from '../common/gen-id.util';
import { mockConfig } from '../common/mock-config';
import { resolvePaymentNotifyUrl } from '../common/resolve-payment-notify-url.util';

const VALID_STATUSES = ['RUNNING', 'STOPPED', 'PAUSED', 'CANCELLED', 'PAID', 'FAILED', 'REVERSED'];

interface SubmitPaymentDto {
  customers_id: string;
  bank_accounts_id: string;
  payment_methods_id: string;
  amount: string;
  process_day?: number;
  payment_interval?: string;
  date_start?: string;
  date_end?: string;
  notify_url?: string;
  webhook_url?: string;
  callback_url?: string;
  company_uuid?: string;
}

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

  async submit(dto: SubmitPaymentDto): Promise<object> {
    const required = ['customers_id', 'bank_accounts_id', 'payment_methods_id', 'amount'];
    for (const field of required) {
      if (!dto[field as keyof SubmitPaymentDto]) {
        throw new BadRequestException({ status: false, error_code: '002', error_message: `Field "${field}" is required` });
      }
    }
    if (!/^\d+(\.\d+)?$/.test(dto.amount) || parseFloat(dto.amount) <= 0) {
      throw new BadRequestException({ status: false, error_code: '002', error_message: 'amount must be a positive decimal string' });
    }

    const mandateId = genId('man');
    const paymentId = genId('pay');
    const notifyUrl = dto.notify_url ?? dto.webhook_url ?? dto.callback_url ?? null;
    const companyUuid = dto.company_uuid?.trim() || mockConfig.defaultCompanyUuid?.trim() || null;

    const mandate = this.mandateRepo.create({
      id: mandateId,
      payments_id: paymentId,
      customers_id: dto.customers_id,
      bank_accounts_id: dto.bank_accounts_id,
      status: 'PENDING',
    });
    await this.mandateRepo.save(mandate);

    const payment = this.paymentRepo.create({
      id: paymentId,
      mandate_id: mandateId,
      customers_id: dto.customers_id,
      bank_accounts_id: dto.bank_accounts_id,
      payment_methods_id: dto.payment_methods_id,
      amount: dto.amount,
      process_day: dto.process_day ?? null,
      payment_interval: dto.payment_interval ?? null,
      date_start: dto.date_start ?? null,
      date_end: dto.date_end ?? null,
      notify_url: notifyUrl,
      company_uuid: companyUuid,
      status: 'RUNNING',
    });
    await this.paymentRepo.save(payment);

    const effectiveNotifyUrl = resolvePaymentNotifyUrl(payment);
    if (effectiveNotifyUrl) {
      await this.webhookDelivery.deliver({
        event_type: 'MANDATE_UPDATED',
        target_url: effectiveNotifyUrl,
        payload: {
          kwik_mandate_id: mandateId,
          mandate_id: mandateId,
          kwik_payment_id: paymentId,
          payments_id: paymentId,
          kwik_customer_id: dto.customers_id,
          customers_id: dto.customers_id,
          mandate_status: 'PENDING',
          status: 'PENDING',
        },
      });
      await this.webhookDelivery.deliver({
        event_type: 'PAYMENT_STATUS',
        target_url: effectiveNotifyUrl,
        payload: {
          kwik_payment_id: paymentId,
          payments_id: paymentId,
          kwik_mandate_id: mandateId,
          mandate_id: mandateId,
          kwik_customer_id: dto.customers_id,
          customers_id: dto.customers_id,
          transaction_id: genId('txn'),
          amount: dto.amount,
          payment_status: 'RUNNING',
          status: 'RUNNING',
        },
      });
    }

    return {
      id: payment.id,
      mandate_id: payment.mandate_id,
      customers_id: payment.customers_id,
      bank_accounts_id: payment.bank_accounts_id,
      payment_methods_id: payment.payment_methods_id,
      amount: payment.amount,
      process_day: payment.process_day,
      payment_interval: payment.payment_interval,
      date_start: payment.date_start,
      date_end: payment.date_end,
      status: payment.status,
    };
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

    await this.deliverPaymentStatusWebhook(payment, status);

    return { id: paymentsId, status };
  }

  /** Mark an existing payment as PAID and deliver PAYMENT_STATUS webhook. */
  async complete(paymentsId: string, options: CompletePaymentOptions = {}): Promise<object> {
    const payment = await this.paymentRepo.findOne({ where: { id: paymentsId } });
    if (!payment) {
      throw new NotFoundException({ status: false, error_code: '007', error_message: 'Payment not found' });
    }
    if (payment.status === 'PAID') {
      throw new BadRequestException({
        status: false,
        error_code: '002',
        error_message: 'Payment is already PAID',
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

    await this.paymentRepo.update(paymentsId, { status: 'PAID' });
    payment.status = 'PAID';

    if (payment.mandate_id) {
      await this.mandateRepo.update(payment.mandate_id, { status: 'ACTIVE' });
    }

    const webhookDelivered = await this.deliverPaymentStatusWebhook(payment, 'PAID');

    return {
      id: paymentsId,
      status: 'PAID',
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
        `Skipping PAYMENT_STATUS webhook for ${payment.id}: set payment.company_uuid, notify_url, or MOCK_DEFAULT_COMPANY_UUID`,
      );
      return false;
    }

    await this.webhookDelivery.deliver({
      event_type: 'PAYMENT_STATUS',
      target_url: targetUrl,
      payload: {
        kwik_payment_id: payment.id,
        payments_id: payment.id,
        kwik_mandate_id: payment.mandate_id,
        mandate_id: payment.mandate_id,
        kwik_customer_id: payment.customers_id,
        customers_id: payment.customers_id,
        transaction_id: genId('txn'),
        amount: payment.amount,
        payment_status: status,
        status,
      },
    });
    return true;
  }
}
