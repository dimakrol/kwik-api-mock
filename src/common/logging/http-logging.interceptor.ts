import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { PinoLogger } from 'nestjs-pino';
import {
  resolveInboundRequestBody,
  sanitizeHeaders,
  sanitizePayload,
} from './sanitize-payload.util';
import { shouldSkipInboundHttpLog } from './should-skip-inbound-http-log.util';

type RequestWithMeta = Request & { rawBody?: string };

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext('HTTP');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<RequestWithMeta>();
    const res = http.getResponse<Response>();

    const path = req.path ?? req.url?.split('?')[0] ?? '';
    if (shouldSkipInboundHttpLog(path)) {
      return next.handle();
    }

    const started = Date.now();

    this.logger.info(
      {
        direction: 'inbound',
        transport: 'http',
        method: req.method,
        path: req.originalUrl,
        query: sanitizePayload(req.query),
        headers: sanitizeHeaders(req.headers as Record<string, unknown>),
        body: resolveInboundRequestBody(req),
      },
      'incoming request',
    );

    return next.handle().pipe(
      tap((responseBody) => {
        this.logger.info(
          {
            direction: 'inbound',
            transport: 'http',
            method: req.method,
            path: req.originalUrl,
            status_code: res.statusCode,
            duration_ms: Date.now() - started,
            body: sanitizePayload(responseBody),
          },
          'incoming response',
        );
      }),
      catchError((error) => {
        const statusCode =
          typeof error?.getStatus === 'function' ? error.getStatus() : 500;
        this.logger.error(
          {
            direction: 'inbound',
            transport: 'http',
            method: req.method,
            path: req.originalUrl,
            status_code: statusCode,
            duration_ms: Date.now() - started,
            error: error instanceof Error ? error.message : String(error),
            body: sanitizePayload(error?.response ?? null),
          },
          'incoming request failed',
        );
        return throwError(() => error);
      }),
    );
  }
}
