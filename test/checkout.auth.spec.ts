/**
 * Route-level auth boundary tests for checkout endpoints.
 *
 * Validates that:
 * - POST /1.0/checkout/page requires Basic auth (returns 401 without it)
 * - GET  /checkout/:id  does NOT require auth
 * - POST /checkout/:id/complete does NOT require auth
 * - POST /checkout/:id/fail     does NOT require auth
 * - POST /checkout/:id/save-card does NOT require auth
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, RequestMethod } from '@nestjs/common';
import * as request from 'supertest';
import { CheckoutController } from '../src/checkout/checkout.controller';
import { CheckoutService } from '../src/checkout/checkout.service';
import { mockConfig } from '../src/common/mock-config';

const VALID_AUTH = `Basic ${Buffer.from('key:secret').toString('base64')}`;

const mockCheckoutService = {
  createPage: jest.fn().mockResolvedValue({
    id: 'cho_test123',
    page_url: 'http://localhost:3099/checkout/cho_test123',
    mode: 'ONE_TIME',
    amount: '100.00',
    status: 'PENDING',
  }),
  getSession: jest.fn().mockResolvedValue({
    id: 'cho_test123',
    amount: '100.00',
    mode: 'ONE_TIME',
    status: 'PENDING',
    customers_id: 'cus_1',
    notify_url: null,
  }),
  completeSession: jest.fn().mockResolvedValue({ id: 'cho_test123', status: 'COMPLETED', card_id: 'card_abc' }),
  failSession: jest.fn().mockResolvedValue({ id: 'cho_test123', status: 'FAILED' }),
  saveCardSession: jest.fn().mockResolvedValue({ id: 'cho_test123', status: 'CARD_SAVED', card_id: 'card_abc' }),
};

async function buildApp(): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [CheckoutController],
    providers: [{ provide: CheckoutService, useValue: mockCheckoutService }],
  }).compile();

  const app = module.createNestApplication();

  app.setGlobalPrefix('1.0', {
    exclude: [
      { path: 'checkout/:id', method: RequestMethod.GET },
      { path: 'checkout/:id/complete', method: RequestMethod.POST },
      { path: 'checkout/:id/fail', method: RequestMethod.POST },
      { path: 'checkout/:id/save-card', method: RequestMethod.POST },
    ],
  });

  await app.init();
  return app;
}

describe('Checkout auth boundaries', () => {
  let app: INestApplication;

  beforeAll(async () => {
    mockConfig.reset();
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    mockConfig.reset();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /1.0/checkout/page — requires Basic auth', () => {
    it('should return 401 when no Authorization header is provided', async () => {
      await request(app.getHttpServer())
        .post('/1.0/checkout/page')
        .send({ amount: '100.00', mode: 'ONE_TIME' })
        .expect(401);
    });

    it('should return 401 when Authorization header is malformed', async () => {
      await request(app.getHttpServer())
        .post('/1.0/checkout/page')
        .set('Authorization', 'Bearer some-token')
        .send({ amount: '100.00', mode: 'ONE_TIME' })
        .expect(401);
    });

    it('should return 200 with valid Basic auth in loose mode', async () => {
      await request(app.getHttpServer())
        .post('/1.0/checkout/page')
        .set('Authorization', VALID_AUTH)
        .send({ amount: '100.00', mode: 'ONE_TIME' })
        .expect(201);
    });
  });

  describe('GET /checkout/:id — no auth required', () => {
    it('should return 200 without any Authorization header', async () => {
      await request(app.getHttpServer())
        .get('/checkout/cho_test123')
        .expect(200);
    });

    it('should return 200 even with a wrong Authorization header', async () => {
      await request(app.getHttpServer())
        .get('/checkout/cho_test123')
        .set('Authorization', 'Basic aW52YWxpZA==')
        .expect(200);
    });
  });

  describe('POST /checkout/:id/complete — no auth required', () => {
    it('should return 201 without Authorization header', async () => {
      await request(app.getHttpServer())
        .post('/checkout/cho_test123/complete')
        .send({})
        .expect(201);
    });
  });

  describe('POST /checkout/:id/fail — no auth required', () => {
    it('should return 201 without Authorization header', async () => {
      await request(app.getHttpServer())
        .post('/checkout/cho_test123/fail')
        .send({})
        .expect(201);
    });
  });

  describe('POST /checkout/:id/save-card — no auth required', () => {
    it('should return 201 without Authorization header', async () => {
      await request(app.getHttpServer())
        .post('/checkout/cho_test123/save-card')
        .send({})
        .expect(201);
    });
  });

  describe('Strict mode auth on POST /1.0/checkout/page', () => {
    beforeEach(() => {
      mockConfig.authMode = 'strict';
      process.env.MOCK_ACCESS_KEY = 'correct_key';
      process.env.MOCK_ACCESS_SECRET = 'correct_secret';
    });

    afterEach(() => {
      mockConfig.reset();
      delete process.env.MOCK_ACCESS_KEY;
      delete process.env.MOCK_ACCESS_SECRET;
    });

    it('should reject wrong credentials with 401', async () => {
      const badAuth = `Basic ${Buffer.from('wrong:wrong').toString('base64')}`;
      await request(app.getHttpServer())
        .post('/1.0/checkout/page')
        .set('Authorization', badAuth)
        .send({ amount: '100.00', mode: 'ONE_TIME' })
        .expect(401);
    });

    it('should accept correct credentials with 201', async () => {
      const goodAuth = `Basic ${Buffer.from('correct_key:correct_secret').toString('base64')}`;
      await request(app.getHttpServer())
        .post('/1.0/checkout/page')
        .set('Authorization', goodAuth)
        .send({ amount: '100.00', mode: 'ONE_TIME' })
        .expect(201);
    });

    it('should accept x-kwik-api-key header with correct key', async () => {
      await request(app.getHttpServer())
        .post('/1.0/checkout/page')
        .set('x-kwik-api-key', 'correct_key')
        .send({ amount: '100.00', mode: 'ONE_TIME' })
        .expect(201);
    });

    it('should still return 200 for GET /checkout/:id without auth in strict mode', async () => {
      await request(app.getHttpServer())
        .get('/checkout/cho_test123')
        .expect(200);
    });
  });
});
