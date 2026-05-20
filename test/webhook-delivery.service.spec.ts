import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { WebhookDeliveryService } from '../src/webhook-delivery/webhook-delivery.service';
import { WebhookDeliveryEntity } from '../src/database/entities/webhook-delivery.entity';
import { mockConfig } from '../src/common/mock-config';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockRepo = {
  create: jest.fn().mockImplementation((dto) => dto),
  save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
  findOne: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
  clear: jest.fn().mockResolvedValue(undefined),
};

describe('WebhookDeliveryService', () => {
  let service: WebhookDeliveryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfig.reset();
    mockRepo.create.mockImplementation((dto) => dto);
    mockRepo.save.mockImplementation((e) => Promise.resolve(e));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDeliveryService,
        { provide: getRepositoryToken(WebhookDeliveryEntity), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<WebhookDeliveryService>(WebhookDeliveryService);
  });

  afterEach(() => {
    mockConfig.reset();
  });

  describe('deliver()', () => {
    it('should generate event_id starting with "evt_" when not provided', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      await service.deliver({
        event_type: 'PAYMENT_STATUS',
        target_url: 'https://hook.example.com',
        payload: { pay_id: 'pay_1' },
      });

      const savedArg = mockRepo.create.mock.calls[0][0];
      expect(savedArg.event_id).toMatch(/^evt_/);
    });

    it('should use provided event_id when given', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      await service.deliver({
        event_type: 'PAYMENT_STATUS',
        target_url: 'https://hook.example.com',
        payload: {},
        event_id: 'evt_custom123',
      });

      const savedArg = mockRepo.create.mock.calls[0][0];
      expect(savedArg.event_id).toBe('evt_custom123');
    });

    it('should store delivery record with success=true on 200 response', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: { ok: true } });

      await service.deliver({
        event_type: 'MANDATE_UPDATED',
        target_url: 'https://hook.example.com',
        payload: { mandate_id: 'man_1' },
      });

      const savedArg = mockRepo.create.mock.calls[0][0];
      expect(savedArg.success).toBe(true);
      expect(savedArg.response_status).toBe(200);
    });

    it('should store delivery record with success=false on non-2xx response', async () => {
      mockedAxios.post.mockRejectedValue({ response: { status: 500, data: 'Error' }, message: 'Request failed' });

      await service.deliver({
        event_type: 'PAYMENT_STATUS',
        target_url: 'https://hook.example.com',
        payload: {},
      });

      const savedArg = mockRepo.create.mock.calls[0][0];
      expect(savedArg.success).toBe(false);
      expect(savedArg.response_status).toBe(500);
      expect(savedArg.error).toBe('Request failed');
    });

    it('should merge event_type and event_id into the POST body', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      await service.deliver({
        event_type: 'CHECKOUT_COMPLETED',
        target_url: 'https://hook.example.com',
        payload: { checkout_id: 'cho_1' },
        event_id: 'evt_123',
      });

      const postBody = mockedAxios.post.mock.calls[0][1] as Record<string, unknown>;
      expect(postBody.event_type).toBe('CHECKOUT_COMPLETED');
      expect(postBody.event_id).toBe('evt_123');
      expect(postBody.checkout_id).toBe('cho_1');
    });

    it('should add Basic Auth header in basic webhookAuthMode', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      mockConfig.webhookAuthMode = 'basic';
      mockConfig.webhookAccessKey = 'mykey';
      mockConfig.webhookAccessSecret = 'mysecret';

      await service.deliver({ event_type: 'PAYMENT_STATUS', target_url: 'https://hook.example.com', payload: {} });

      const headers = mockedAxios.post.mock.calls[0][2]?.headers as Record<string, string>;
      const expected = `Basic ${Buffer.from('mykey:mysecret').toString('base64')}`;
      expect(headers['Authorization']).toBe(expected);
    });

    it('should add x-kwik-api-key header in api-key webhookAuthMode', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      mockConfig.webhookAuthMode = 'api-key';
      mockConfig.webhookAccessKey = 'apikey123';

      await service.deliver({ event_type: 'PAYMENT_STATUS', target_url: 'https://hook.example.com', payload: {} });

      const headers = mockedAxios.post.mock.calls[0][2]?.headers as Record<string, string>;
      expect(headers['x-kwik-api-key']).toBe('apikey123');
    });

    it('should use auth_override when provided', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      mockConfig.webhookAuthMode = 'basic';

      await service.deliver({
        event_type: 'PAYMENT_STATUS',
        target_url: 'https://hook.example.com',
        payload: {},
        auth_override: { access_key: 'override_key', access_secret: 'override_secret' },
      });

      const headers = mockedAxios.post.mock.calls[0][2]?.headers as Record<string, string>;
      const expected = `Basic ${Buffer.from('override_key:override_secret').toString('base64')}`;
      expect(headers['Authorization']).toBe(expected);
    });

    it('should store delivery with id starting with "wdl_"', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      await service.deliver({ event_type: 'PAYMENT_STATUS', target_url: 'https://hook.example.com', payload: {} });

      const savedArg = mockRepo.create.mock.calls[0][0];
      expect(savedArg.id).toMatch(/^wdl_/);
    });
  });

  describe('replay()', () => {
    it('should throw NotFoundException when delivery not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.replay('wdl_nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should re-deliver using stored event_type, target_url, and event_id', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      const stored = {
        id: 'wdl_1',
        event_id: 'evt_abc',
        event_type: 'PAYMENT_STATUS',
        target_url: 'https://hook.example.com',
        request_body: '{"pay_id":"pay_1","event_type":"PAYMENT_STATUS","event_id":"evt_abc"}',
      } as WebhookDeliveryEntity;
      mockRepo.findOne.mockResolvedValue(stored);

      await service.replay('wdl_1');

      expect(mockedAxios.post).toHaveBeenCalledWith('https://hook.example.com', expect.any(Object), expect.any(Object));
    });
  });

  describe('findAll()', () => {
    it('should return all deliveries ordered by created_at DESC', async () => {
      const deliveries = [{ id: 'wdl_1' }, { id: 'wdl_2' }] as WebhookDeliveryEntity[];
      mockRepo.find.mockResolvedValue(deliveries);

      const result = await service.findAll();

      expect(mockRepo.find).toHaveBeenCalledWith({ order: { created_at: 'DESC' } });
      expect(result).toBe(deliveries);
    });
  });

  describe('clear()', () => {
    it('should call repo.clear()', async () => {
      await service.clear();
      expect(mockRepo.clear).toHaveBeenCalledTimes(1);
    });
  });
});
