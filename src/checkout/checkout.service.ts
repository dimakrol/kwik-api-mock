import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CheckoutSessionEntity } from '../database/entities/checkout-session.entity';
import { WebhookDeliveryService, DeliverWebhookOptions } from '../webhook-delivery/webhook-delivery.service';
import { genId } from '../common/gen-id.util';
import { mockConfig } from '../common/mock-config';

interface CreateCheckoutDto {
  customer_id?: string;
  customers_id?: string;
  amount: string;
  mode: string;
  currency?: string;
  order_id?: string;
  notify_url?: string;
  redirects?: { notify_url?: string };
}

@Injectable()
export class CheckoutService {
  constructor(
    @InjectRepository(CheckoutSessionEntity)
    private readonly repo: Repository<CheckoutSessionEntity>,
    private readonly webhookDelivery: WebhookDeliveryService,
  ) {}

  async createPage(dto: CreateCheckoutDto): Promise<object> {
    const id = genId('chk');
    const session_id = genId('ses');
    const baseUrl = process.env.MOCK_BASE_URL ?? 'http://localhost:3099';
    const page_url = `${baseUrl}/checkout/${id}`;

    const session = this.repo.create({
      id,
      customers_id: dto.customer_id ?? dto.customers_id ?? null,
      amount: dto.amount,
      mode: dto.mode,
      page_url,
      notify_url: dto.redirects?.notify_url ?? dto.notify_url ?? null,
      status: 'PENDING',
    });
    await this.repo.save(session);

    return {
      id: session.id,
      session_id,
      amount: session.amount,
      currency: dto.currency ?? 'ZAR',
      order_id: dto.order_id ?? null,
      customer_id: session.customers_id,
      page_url: session.page_url,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  async getSession(id: string): Promise<CheckoutSessionEntity> {
    const session = await this.repo.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException({ status: false, error_code: '007', error_message: 'Checkout session not found' });
    }
    return session;
  }

  async completeSession(id: string, cardIdOverride?: string): Promise<object> {
    const session = await this.getSession(id);
    const card_id = cardIdOverride ?? genId('card');
    await this.repo.update(id, { status: 'COMPLETED', card_id });
    await this.sendCheckoutWebhook(session, 'PAID', card_id);
    return { id, status: 'COMPLETED', card_id };
  }

  async failSession(id: string): Promise<object> {
    const session = await this.getSession(id);
    await this.repo.update(id, { status: 'FAILED' });
    await this.sendCheckoutWebhook(session, 'FAILED', null);
    return { id, status: 'FAILED' };
  }

  async saveCardSession(id: string): Promise<object> {
    const session = await this.getSession(id);
    const card_id = genId('card');
    await this.repo.update(id, { status: 'CARD_SAVED', card_id });
    await this.sendCheckoutWebhook(session, 'CARD_SAVED', card_id);
    return { id, status: 'CARD_SAVED', card_id };
  }

  private async sendCheckoutWebhook(
    session: CheckoutSessionEntity,
    paymentStatus: string,
    card_id: string | null,
  ): Promise<void> {
    const notifyUrl = session.notify_url ?? mockConfig.defaultNotifyUrl;
    if (!notifyUrl) return;

    const opts: DeliverWebhookOptions = {
      event_type: paymentStatus === 'FAILED' ? 'CHECKOUT_FAILED' : 'CHECKOUT_COMPLETED',
      target_url: notifyUrl,
      payload: {
        checkout: {
          id: session.id,
          session_id: genId('ses'),
          amount: session.amount,
          currency: 'ZAR',
          order_id: null,
          customer_id: session.customers_id,
          card_id,
          transaction_id: genId('tra'),
          transaction_status: paymentStatus,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          completed_at: new Date().toISOString(),
        },
        payment: {
          id: genId('pay'),
          amount: session.amount,
          currency: 'ZAR',
          payment_status: paymentStatus,
          payment_method: 'CARD',
          payment_method_id: null,
          created_at: new Date().toISOString(),
        },
      },
    };
    await this.webhookDelivery.deliver(opts);
  }
}
