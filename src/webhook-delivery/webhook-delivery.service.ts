import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { createHmac } from 'node:crypto';
import { WebhookDeliveryEntity } from '../database/entities/webhook-delivery.entity';
import { genId } from '../common/gen-id.util';
import { mockConfig } from '../common/mock-config';

export interface DeliverWebhookOptions {
  event_type: string;
  target_url: string;
  payload: Record<string, unknown>;
  event_id?: string;
  auth_override?: { access_key: string; access_secret: string };
}

@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);

  constructor(
    @InjectRepository(WebhookDeliveryEntity)
    private readonly repo: Repository<WebhookDeliveryEntity>,
  ) {}

  async deliver(opts: DeliverWebhookOptions): Promise<WebhookDeliveryEntity> {
    const event_id = opts.event_id ?? genId('evt');
    const body = { ...opts.payload, event_type: opts.event_type, event_id };
    const requestBodyStr = JSON.stringify(body);
    const headers = this.buildHeaders(requestBodyStr, opts.auth_override);

    let response_status = 0;
    let response_body: string | null = null;
    let success = false;
    let error: string | null = null;

    try {
      const response = await axios.post(opts.target_url, body, { headers });
      response_status = response.status;
      response_body = JSON.stringify(response.data);
      success = response.status >= 200 && response.status < 300;
    } catch (err: unknown) {
      const e = err as { response?: { status: number; data: unknown }; message?: string };
      if (e.response) {
        response_status = e.response.status;
        response_body = JSON.stringify(e.response.data);
      }
      error = e.message ?? 'Unknown error';
      this.logger.error(`Webhook delivery failed to ${opts.target_url}: ${error}`);
    }

    const delivery = this.repo.create({
      id: genId('wdl'),
      event_id,
      event_type: opts.event_type,
      target_url: opts.target_url,
      request_body: requestBodyStr,
      request_headers: JSON.stringify(headers),
      response_status,
      response_body,
      success,
      error,
    });
    return this.repo.save(delivery);
  }

  async replay(deliveryId: string): Promise<WebhookDeliveryEntity> {
    const original = await this.repo.findOne({ where: { id: deliveryId } });
    if (!original) {
      throw new NotFoundException({ status: false, error_code: '007', error_message: 'Webhook delivery not found' });
    }
    const stored = JSON.parse(original.request_body) as Record<string, unknown>;
    const { event_type, event_id, ...payload } = stored;
    return this.deliver({
      event_id: (event_id as string | undefined) ?? original.event_id,
      event_type: (event_type as string | undefined) ?? original.event_type,
      target_url: original.target_url,
      payload,
    });
  }

  async findAll(): Promise<WebhookDeliveryEntity[]> {
    return this.repo.find({ order: { created_at: 'DESC' } });
  }

  async clear(): Promise<void> {
    await this.repo.clear();
  }

  private buildHeaders(
    body: string,
    authOverride?: { access_key: string; access_secret: string },
  ): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const authMode = mockConfig.webhookAuthMode;
    const key = authOverride?.access_key ?? mockConfig.webhookAccessKey;
    const secret = authOverride?.access_secret ?? mockConfig.webhookAccessSecret;

    if (authMode === 'basic') {
      headers['Authorization'] = `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`;
    } else if (authMode === 'api-key') {
      headers['x-kwik-api-key'] = key;
    } else if (authMode === 'hmac' && mockConfig.webhookHmacSecret) {
      headers['x-kwik-signature'] = createHmac('sha256', mockConfig.webhookHmacSecret).update(body).digest('hex');
    }

    return headers;
  }
}
