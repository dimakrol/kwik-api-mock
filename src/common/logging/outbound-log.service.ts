import { Injectable } from '@nestjs/common';
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { PinoLogger } from 'nestjs-pino';
import { sanitizeHeaders, sanitizePayload } from './sanitize-payload.util';

@Injectable()
export class OutboundLogService {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(OutboundLogService.name);
  }

  async post<T = unknown>(
    url: string,
    data: unknown,
    config?: AxiosRequestConfig,
    meta?: { service?: string; operation?: string },
  ): Promise<AxiosResponse<T>> {
    const started = Date.now();
    const service = meta?.service ?? 'http';
    const operation = meta?.operation ?? 'POST';

    this.logger.info(
      {
        direction: 'outbound',
        transport: 'http',
        service,
        operation,
        method: 'POST',
        url,
        headers: sanitizeHeaders(config?.headers as Record<string, unknown>),
        body: sanitizePayload(data),
      },
      'outgoing request',
    );

    try {
      const response = await axios.post<T>(url, data, config);
      this.logger.info(
        {
          direction: 'outbound',
          transport: 'http',
          service,
          operation,
          method: 'POST',
          url,
          status_code: response.status,
          duration_ms: Date.now() - started,
          body: sanitizePayload(response.data),
        },
        'outgoing response',
      );
      return response;
    } catch (error: unknown) {
      const err = error as {
        response?: { status: number; data: unknown };
        message?: string;
      };
      this.logger.error(
        {
          direction: 'outbound',
          transport: 'http',
          service,
          operation,
          method: 'POST',
          url,
          duration_ms: Date.now() - started,
          status_code: err.response?.status,
          error: err.message ?? String(error),
          body: sanitizePayload(err.response?.data ?? null),
        },
        'outgoing request failed',
      );
      throw error;
    }
  }
}
