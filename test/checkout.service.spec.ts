import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CheckoutService } from '../src/checkout/checkout.service';
import { CheckoutSessionEntity } from '../src/database/entities/checkout-session.entity';
import { WebhookDeliveryService } from '../src/webhook-delivery/webhook-delivery.service';

const mockRepo = {
  create: jest.fn().mockImplementation((dto) => dto),
  save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
  findOne: jest.fn(),
  update: jest.fn().mockResolvedValue(undefined),
};

const mockWebhookDelivery = {
  deliver: jest.fn().mockResolvedValue({ id: 'wdl_1', success: true }),
  replay: jest.fn(),
  findAll: jest.fn(),
  clear: jest.fn(),
};

describe('CheckoutService', () => {
  let service: CheckoutService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepo.create.mockImplementation((dto) => dto);
    mockRepo.save.mockImplementation((e) => Promise.resolve(e));
    mockRepo.update.mockResolvedValue(undefined);
    mockWebhookDelivery.deliver.mockResolvedValue({ id: 'wdl_1', success: true });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutService,
        { provide: getRepositoryToken(CheckoutSessionEntity), useValue: mockRepo },
        { provide: WebhookDeliveryService, useValue: mockWebhookDelivery },
      ],
    }).compile();

    service = module.get<CheckoutService>(CheckoutService);
  });

  afterEach(() => {
    delete process.env.MOCK_BASE_URL;
  });

  const baseDto = { amount: '100.00', mode: 'DEBICHECK' };

  describe('createPage()', () => {
    it('should generate a documented checkout ID starting with "chk_"', async () => {
      const result = await service.createPage(baseDto) as Record<string, unknown>;
      expect(result.id).toMatch(/^chk_/);
    });

    it('should build page_url as `${MOCK_BASE_URL}/checkout/${id}`', async () => {
      process.env.MOCK_BASE_URL = 'https://mock.example.com';
      const result = await service.createPage(baseDto) as Record<string, unknown>;
      expect(result.page_url).toBe(`https://mock.example.com/checkout/${result.id}`);
    });

    it('should use default "http://localhost:3099" when MOCK_BASE_URL is not set', async () => {
      delete process.env.MOCK_BASE_URL;
      const result = await service.createPage(baseDto) as Record<string, unknown>;
      expect(result.page_url).toMatch(/^http:\/\/localhost:3099\/checkout\/chk_/);
    });

    it('should use process.env.MOCK_BASE_URL when set', async () => {
      process.env.MOCK_BASE_URL = 'https://custom.host';
      const result = await service.createPage(baseDto) as Record<string, unknown>;
      expect((result.page_url as string).startsWith('https://custom.host')).toBe(true);
    });

    it('should return session_id and expires_at', async () => {
      const result = await service.createPage(baseDto) as Record<string, unknown>;
      expect(result.session_id).toMatch(/^ses_/);
      expect(result.expires_at).toBeTruthy();
    });

    it('should save entity to repo', async () => {
      await service.createPage(baseDto);
      expect(mockRepo.create).toHaveBeenCalledTimes(1);
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
    });

    it('should return documented checkout result shape', async () => {
      const result = await service.createPage(baseDto) as Record<string, unknown>;
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('session_id');
      expect(result).toHaveProperty('page_url');
      expect(result.amount).toBe('100.00');
      expect(result.currency).toBe('ZAR');
    });

    it('should set customers_id to null when not provided', async () => {
      await service.createPage(baseDto);
      const arg = mockRepo.create.mock.calls[0][0];
      expect(arg.customers_id).toBeNull();
    });

    it('should use provided customers_id when given', async () => {
      await service.createPage({ ...baseDto, customers_id: 'cus_abc' });
      const arg = mockRepo.create.mock.calls[0][0];
      expect(arg.customers_id).toBe('cus_abc');
    });

    it('should set notify_url to null when not provided', async () => {
      await service.createPage(baseDto);
      const arg = mockRepo.create.mock.calls[0][0];
      expect(arg.notify_url).toBeNull();
    });

    it('should use provided notify_url when given', async () => {
      await service.createPage({ ...baseDto, notify_url: 'https://notify.example.com/hook' });
      const arg = mockRepo.create.mock.calls[0][0];
      expect(arg.notify_url).toBe('https://notify.example.com/hook');
    });
  });

  describe('getSession()', () => {
    it('should throw NotFoundException when session not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.getSession('cho_missing')).rejects.toThrow(NotFoundException);
    });

    it('should return the session when found', async () => {
      const session = { id: 'cho_abc', amount: '100.00', mode: 'ONE_TIME', status: 'PENDING' } as CheckoutSessionEntity;
      mockRepo.findOne.mockResolvedValue(session);
      const result = await service.getSession('cho_abc');
      expect(result).toBe(session);
    });
  });

  describe('completeSession()', () => {
    it('should update status to COMPLETED and return card_id', async () => {
      const session = { id: 'cho_abc', amount: '100.00', customers_id: 'cus_1', notify_url: null } as CheckoutSessionEntity;
      mockRepo.findOne.mockResolvedValue(session);

      const result = await service.completeSession('cho_abc') as Record<string, unknown>;

      expect(mockRepo.update).toHaveBeenCalledWith('cho_abc', expect.objectContaining({ status: 'COMPLETED' }));
      expect(result.status).toBe('COMPLETED');
      expect(result.card_id).toMatch(/^card_/);
    });

    it('should use provided card_id override', async () => {
      const session = { id: 'cho_abc', amount: '100.00', customers_id: 'cus_1', notify_url: null } as CheckoutSessionEntity;
      mockRepo.findOne.mockResolvedValue(session);

      const result = await service.completeSession('cho_abc', 'card_custom') as Record<string, unknown>;

      expect(result.card_id).toBe('card_custom');
    });

    it('should NOT deliver webhook when notify_url is null and no default', async () => {
      const session = { id: 'cho_abc', amount: '100.00', customers_id: 'cus_1', notify_url: null } as CheckoutSessionEntity;
      mockRepo.findOne.mockResolvedValue(session);

      await service.completeSession('cho_abc');

      expect(mockWebhookDelivery.deliver).not.toHaveBeenCalled();
    });

    it('should deliver CHECKOUT_COMPLETED webhook when notify_url is set', async () => {
      const session = {
        id: 'cho_abc', amount: '150.00', customers_id: 'cus_1', notify_url: 'https://hook.example.com',
      } as CheckoutSessionEntity;
      mockRepo.findOne.mockResolvedValue(session);

      await service.completeSession('cho_abc');

      expect(mockWebhookDelivery.deliver).toHaveBeenCalledWith(expect.objectContaining({
        event_type: 'CHECKOUT_COMPLETED',
        target_url: 'https://hook.example.com',
        payload: expect.objectContaining({
          checkout: expect.objectContaining({ id: 'cho_abc' }),
          payment: expect.objectContaining({ payment_status: 'PAID' }),
        }),
      }));
    });
  });

  describe('failSession()', () => {
    it('should update status to FAILED', async () => {
      const session = { id: 'cho_abc', amount: '100.00', customers_id: 'cus_1', notify_url: null } as CheckoutSessionEntity;
      mockRepo.findOne.mockResolvedValue(session);

      const result = await service.failSession('cho_abc') as Record<string, unknown>;

      expect(mockRepo.update).toHaveBeenCalledWith('cho_abc', { status: 'FAILED' });
      expect(result.status).toBe('FAILED');
    });

    it('should deliver CHECKOUT_FAILED webhook with FAILED status when notify_url set', async () => {
      const session = {
        id: 'cho_abc', amount: '100.00', customers_id: 'cus_1', notify_url: 'https://hook.example.com',
      } as CheckoutSessionEntity;
      mockRepo.findOne.mockResolvedValue(session);

      await service.failSession('cho_abc');

      expect(mockWebhookDelivery.deliver).toHaveBeenCalledWith(expect.objectContaining({
        event_type: 'CHECKOUT_FAILED',
        payload: expect.objectContaining({
          payment: expect.objectContaining({ payment_status: 'FAILED' }),
        }),
      }));
    });
  });

  describe('saveCardSession()', () => {
    it('should update status to CARD_SAVED and return card_id', async () => {
      const session = { id: 'cho_abc', amount: '100.00', customers_id: 'cus_1', notify_url: null } as CheckoutSessionEntity;
      mockRepo.findOne.mockResolvedValue(session);

      const result = await service.saveCardSession('cho_abc') as Record<string, unknown>;

      expect(mockRepo.update).toHaveBeenCalledWith('cho_abc', expect.objectContaining({ status: 'CARD_SAVED' }));
      expect(result.status).toBe('CARD_SAVED');
      expect(result.card_id).toMatch(/^card_/);
    });
  });
});
