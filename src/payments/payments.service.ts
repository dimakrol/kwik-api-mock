import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentEntity } from '../database/entities/payment.entity';
import { MandateEntity } from '../database/entities/mandate.entity';
import { WebhookDeliveryService } from '../webhook-delivery/webhook-delivery.service';
import { genId } from '../common/gen-id.util';
import { mockConfig } from '../common/mock-config';

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
}

@Injectable()
export class PaymentsService {
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
      status: 'RUNNING',
    });
    await this.paymentRepo.save(payment);

    const effectiveNotifyUrl = notifyUrl ?? mockConfig.defaultNotifyUrl;
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

    const notifyUrl = payment.notify_url ?? mockConfig.defaultNotifyUrl;
    if (notifyUrl) {
      await this.webhookDelivery.deliver({
        event_type: 'PAYMENT_STATUS',
        target_url: notifyUrl,
        payload: {
          kwik_payment_id: paymentsId,
          payments_id: paymentsId,
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
    }

    return { id: paymentsId, status };
  }
}
