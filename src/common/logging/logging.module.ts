import { Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { HttpLoggingInterceptor } from './http-logging.interceptor';
import { OutboundLogService } from './outbound-log.service';

@Global()
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        autoLogging: {
          ignore: (req) => {
            const url = req.url?.split('?')[0] ?? '';
            return (
              url.startsWith('/docs') ||
              url.startsWith('/interface/assets') ||
              url === '/admin/interface-data'
            );
          },
        },
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: false,
                  translateTime: 'SYS:standard',
                },
              }
            : undefined,
        redact: {
          paths: ['req.headers.authorization', 'headers.authorization'],
          censor: '[REDACTED]',
        },
      },
    }),
  ],
  providers: [HttpLoggingInterceptor, OutboundLogService],
  exports: [LoggerModule, HttpLoggingInterceptor, OutboundLogService],
})
export class AppLoggingModule {}
