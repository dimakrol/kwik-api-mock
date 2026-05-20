import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MandateEntity } from '../database/entities/mandate.entity';
import { PaymentEntity } from '../database/entities/payment.entity';
import { WebhookDeliveryService } from '../webhook-delivery/webhook-delivery.service';
import { mockConfig } from '../common/mock-config';

@Injectable()
export class MandatesService {
  constructor(
    @InjectRepository(MandateEntity)
    private readonly mandateRepo: Repository<MandateEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
    private readonly webhookDelivery: WebhookDeliveryService,
  ) {}

  async cancelDebicheck(mandateId: string, cancelReason: string): Promise<object> {
    if (!mandateId) {
      throw new BadRequestException({ status: false, error_code: '002', error_message: 'mandate_id is required' });
    }
    if (!cancelReason) {
      throw new BadRequestException({ status: false, error_code: '002', error_message: 'cancel_reason is required' });
    }

    const mandate = await this.mandateRepo.findOne({ where: { id: mandateId } });
    if (!mandate) {
      throw new NotFoundException({ status: false, error_code: '007', error_message: 'Mandate not found' });
    }

    await this.mandateRepo.update(mandateId, { status: 'CANCELLED', cancel_reason: cancelReason });

    let notifyUrl: string | null = null;
    if (mandate.payments_id) {
      await this.paymentRepo.update(mandate.payments_id, { status: 'STOPPED' });
      const payment = await this.paymentRepo.findOne({ where: { id: mandate.payments_id } });
      notifyUrl = payment?.notify_url ?? null;
    }
    const effectiveNotifyUrl = notifyUrl ?? mockConfig.defaultNotifyUrl;

    if (effectiveNotifyUrl) {
      await this.webhookDelivery.deliver({
        event_type: 'MANDATE_UPDATED',
        target_url: effectiveNotifyUrl,
        payload: {
          kwik_mandate_id: mandateId,
          mandate_id: mandateId,
          kwik_payment_id: mandate.payments_id ?? null,
          payments_id: mandate.payments_id ?? null,
          kwik_customer_id: mandate.customers_id,
          customers_id: mandate.customers_id,
          mandate_status: 'CANCELLED',
          status: 'CANCELLED',
        },
      });
    }

    return {
      id: mandateId,
      status: 'CANCELLED',
      cancel_reason: cancelReason,
    };
  }
}
