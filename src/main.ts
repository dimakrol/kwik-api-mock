import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { RequestMethod } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpLoggingInterceptor } from './common/logging/http-logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const requestLimit = '10mb';
  app.useBodyParser('json', {
    limit: requestLimit,
    verify: (req, _res, buf) => {
      (req as { rawBody?: string }).rawBody = buf.toString('utf8');
    },
  });
  app.useBodyParser('urlencoded', { extended: true, limit: requestLimit });

  app.useGlobalInterceptors(app.get(HttpLoggingInterceptor));

  app.setGlobalPrefix('1.0', {
    exclude: [
      { path: 'admin', method: RequestMethod.ALL },
      { path: 'admin/(.*)', method: RequestMethod.ALL },
      { path: 'docs', method: RequestMethod.ALL },
      { path: 'docs/(.*)', method: RequestMethod.ALL },
      // Checkout UI routes — served without /1.0 prefix (page_url links here)
      { path: 'checkout/:id', method: RequestMethod.GET },
      { path: 'checkout/:id/complete', method: RequestMethod.POST },
      { path: 'checkout/:id/fail', method: RequestMethod.POST },
      { path: 'checkout/:id/save-card', method: RequestMethod.POST },
      // Web interface (dashboard) — served at /, /interface, /interface/assets/*
      { path: '/', method: RequestMethod.GET },
      { path: 'interface', method: RequestMethod.GET },
      { path: 'interface/(.*)', method: RequestMethod.GET },
    ],
  });

  const config = new DocumentBuilder()
    .setTitle('Kwik API Mock')
    .setDescription(
      'Mock server for Kwik payment API integration testing.\n\n' +
      'All `/1.0/*` routes require Basic Auth. Use the **Authorize** button (any username:password).\n\n' +
      'Checkout page UI routes (`/checkout/:id`) are served without auth.',
    )
    .setVersion('1.0')
    .addBasicAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, doc);

  const port = process.env.PORT ?? 3099;
  await app.listen(port);
  console.log(`Kwik Mock API running on http://localhost:${port}`);
  console.log(`Swagger docs: http://localhost:${port}/docs`);
  console.log(`Dashboard:    http://localhost:${port}/interface`);
}
bootstrap();
