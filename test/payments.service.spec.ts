import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from '../src/payments/payments.service';
import { PaymentEntity } from '../src/database/entities/payment.entity';
import { MandateEntity } from '../src/database/entities/mandate.entity';
import { WebhookDeliveryService } from '../src/webhook-delivery/webhook-delivery.service';
import { mockConfig } from '../src/common/mock-config';

const mockPaymentRepo = {
  create: jest.fn().mockImplementation((dto) => dto),
  save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
  update: jest.fn().mockResolvedValue(undefined),
  findOne: jest.fn(),
};

const mockMandateRepo = {
  create: jest.fn().mockImplementation((dto) => dto),
  save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
  update: jest.fn().mockResolvedValue(undefined),
};

const mockWebhookDelivery = {
  deliver: jest.fn().mockResolvedValue({ id: 'wdl_1', success: true }),
  replay: jest.fn(),
  findAll: jest.fn(),
  clear: jest.fn(),
};

describe('PaymentsService', () => {
  let service: PaymentsService;

  const savedDefaultNotifyUrl = mockConfig.defaultNotifyUrl;

  beforeEach(async () => {
    mockConfig.defaultNotifyUrl = null;
    jest.clearAllMocks();
    mockPaymentRepo.create.mockImplementation((dto) => dto);
    mockPaymentRepo.save.mockImplementation((e) => Promise.resolve(e));
    mockPaymentRepo.update.mockResolvedValue(undefined);
    mockMandateRepo.create.mockImplementation((dto) => dto);
    mockMandateRepo.save.mockImplementation((e) => Promise.resolve(e));
    mockWebhookDelivery.deliver.mockResolvedValue({ id: 'wdl_1', success: true });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getRepositoryToken(PaymentEntity), useValue: mockPaymentRepo },
        { provide: getRepositoryToken(MandateEntity), useValue: mockMandateRepo },
        { provide: WebhookDeliveryService, useValue: mockWebhookDelivery },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  afterEach(() => {
    mockConfig.defaultNotifyUrl = savedDefaultNotifyUrl;
  });

  const baseDto = {
    customers_id: 'cus_test',
    bank_accounts_id: 'bac_test',
    payment_methods_id: 'pam_test',
    amount: '500.00',
  };

  describe('submit()', () => {
    it('should create a mandate with ID prefix "man_"', async () => {
      await service.submit(baseDto);
      const mandateArg = mockMandateRepo.create.mock.calls[0][0];
      expect(mandateArg.id).toMatch(/^man_/);
    });

    it('should create a payment with ID prefix "pay_"', async () => {
      await service.submit(baseDto);
      const paymentArg = mockPaymentRepo.create.mock.calls[0][0];
      expect(paymentArg.id).toMatch(/^pay_/);
    });

    it('should set mandate status to PENDING', async () => {
      await service.submit(baseDto);
      const mandateArg = mockMandateRepo.create.mock.calls[0][0];
      expect(mandateArg.status).toBe('PENDING');
    });

    it('should set payment status to RUNNING', async () => {
      await service.submit(baseDto);
      const paymentArg = mockPaymentRepo.create.mock.calls[0][0];
      expect(paymentArg.status).toBe('RUNNING');
    });

    it('should link payment.mandate_id to the mandate.id', async () => {
      await service.submit(baseDto);
      const mandateArg = mockMandateRepo.create.mock.calls[0][0];
      const paymentArg = mockPaymentRepo.create.mock.calls[0][0];
      expect(paymentArg.mandate_id).toBe(mandateArg.id);
    });

    it('should return Kwik documented payments array', async () => {
      const result = (await service.submit(baseDto))[0] as Record<string, unknown>;
      expect(result).toHaveProperty('payments_id');
      expect(result).toHaveProperty('mandate_id');
      expect(result.customer_id).toBe('cus_test');
      expect(result.bank_account_id).toBe('bac_test');
      expect(result.payment).toMatchObject({
        payment_methods_id: 'pam_test',
        amount: '500.00',
        payment_status: 'RUNNING',
      });
    });

    it('should handle optional fields: process_day, payment_interval, date_start, date_end', async () => {
      const dto = { ...baseDto, process_day: 1, payment_interval: 'MONTHLY', date_start: '2025-01-01', date_end: '2026-01-01' };
      const result = (await service.submit(dto))[0] as Record<string, any>;
      expect(result.payment.recurring.process_day).toBe(1);
      expect(result.payment.recurring.date_start).toBe('2025-01-01');
      expect(result.payment.recurring.date_end).toBe('2026-01-01');
    });

    it('should set process_day to null when not provided', async () => {
      const result = (await service.submit(baseDto))[0] as Record<string, any>;
      expect(result.payment.recurring).toBeUndefined();
    });

    it('should set payment_interval to null when not provided', async () => {
      const result = (await service.submit(baseDto))[0] as Record<string, any>;
      expect(result.mandate.recurring).toBeUndefined();
    });

    it('should throw BadRequestException when required field is missing', async () => {
      const { customers_id: _c, ...missing } = baseDto;
      await expect(service.submit(missing as never)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid amount', async () => {
      await expect(service.submit({ ...baseDto, amount: '-10' })).rejects.toThrow(BadRequestException);
    });

    it('should NOT deliver webhooks when no notify_url configured', async () => {
      await service.submit(baseDto);
      expect(mockWebhookDelivery.deliver).not.toHaveBeenCalled();
    });

    it('should deliver documented mandate.updated and payment.updated webhooks when notify_url provided', async () => {
      jest.useFakeTimers();
      await service.submit({ ...baseDto, notify_url: 'https://hook.example.com' });
      expect(mockWebhookDelivery.deliver).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1000);
      expect(mockWebhookDelivery.deliver).toHaveBeenCalledTimes(2);
      const calls = mockWebhookDelivery.deliver.mock.calls.map((c: [Record<string, unknown>]) => c[0].event_type);
      expect(calls).toContain('MANDATE_UPDATED');
      expect(calls).toContain('PAYMENT_UPDATED');
      jest.useRealTimers();
    });

    it('should deliver webhooks to default URL when company_uuid is set', async () => {
      jest.useFakeTimers();
      await service.submit({ ...baseDto, company_uuid: 'co-dev' });
      await jest.advanceTimersByTimeAsync(1000);
      expect(mockWebhookDelivery.deliver).toHaveBeenCalledTimes(2);
      const target = mockWebhookDelivery.deliver.mock.calls[0][0].target_url as string;
      expect(target).toBe('http://localhost:3005/v1/webhook/kwik/co-dev');
      jest.useRealTimers();
    });
  });

  describe('updateStatus()', () => {
    it('should call paymentRepo.update with new status', async () => {
      const existingPayment = { id: 'pay_abc', status: 'RUNNING', notify_url: null } as PaymentEntity;
      mockPaymentRepo.findOne.mockResolvedValue(existingPayment);

      await service.updateStatus('pay_abc', 'STOPPED');

      expect(mockPaymentRepo.update).toHaveBeenCalledWith('pay_abc', { status: 'STOPPED' });
    });

    it('should throw NotFoundException when payment is not found', async () => {
      mockPaymentRepo.findOne.mockResolvedValue(null);
      await expect(service.updateStatus('pay_nonexistent', 'STOPPED')).rejects.toThrow(NotFoundException);
    });

    it('should return documented status true on success', async () => {
      const existingPayment = { id: 'pay_abc', status: 'RUNNING', notify_url: null } as PaymentEntity;
      mockPaymentRepo.findOne.mockResolvedValue(existingPayment);

      const result = await service.updateStatus('pay_abc', 'STOPPED') as Record<string, unknown>;

      expect(result.status).toBe(true);
    });

    it('should throw BadRequestException for invalid status', async () => {
      const existingPayment = { id: 'pay_abc', status: 'RUNNING', notify_url: null } as PaymentEntity;
      mockPaymentRepo.findOne.mockResolvedValue(existingPayment);

      await expect(service.updateStatus('pay_abc', 'INVALID_STATUS')).rejects.toThrow(BadRequestException);
    });

    it('should deliver PAYMENT_UPDATED webhook when payment has notify_url', async () => {
      const existingPayment = { id: 'pay_abc', status: 'RUNNING', notify_url: 'https://hook.example.com', mandate_id: 'man_abc', customers_id: 'cus_1', amount: '100.00' } as PaymentEntity;
      mockPaymentRepo.findOne.mockResolvedValue(existingPayment);

      await service.updateStatus('pay_abc', 'COMPLETED');

      expect(mockWebhookDelivery.deliver).toHaveBeenCalledWith(expect.objectContaining({
        event_type: 'PAYMENT_UPDATED',
        target_url: 'https://hook.example.com',
        payload: expect.objectContaining({ payment_status: 'COMPLETED' }),
      }));
    });

    it('should deliver to default URL with company_uuid substituted', async () => {
      mockConfig.defaultNotifyUrl = 'http://localhost:3005/v1/webhook/kwik/{companyUuid}';
      const existingPayment = {
        id: 'pay_abc',
        status: 'RUNNING',
        notify_url: null,
        company_uuid: 'co-99',
        mandate_id: 'man_abc',
        customers_id: 'cus_1',
        amount: '100.00',
      } as PaymentEntity;
      mockPaymentRepo.findOne.mockResolvedValue(existingPayment);

      await service.updateStatus('pay_abc', 'COMPLETED');

      expect(mockWebhookDelivery.deliver).toHaveBeenCalledWith(expect.objectContaining({
        target_url: 'http://localhost:3005/v1/webhook/kwik/co-99',
      }));
    });
  });

  describe('complete()', () => {
    it('should set payment status to COMPLETED and deliver webhook', async () => {
      mockConfig.defaultNotifyUrl = 'http://localhost:3005/v1/webhook/kwik/{companyUuid}';
      const existingPayment = {
        id: 'pay_abc',
        status: 'RUNNING',
        notify_url: null,
        company_uuid: 'co-1',
        mandate_id: 'man_abc',
        customers_id: 'cus_1',
        amount: '500.00',
      } as PaymentEntity;
      mockPaymentRepo.findOne.mockResolvedValue(existingPayment);

      const result = await service.complete('pay_abc') as Record<string, unknown>;

      expect(mockPaymentRepo.update).toHaveBeenCalledWith('pay_abc', { status: 'COMPLETED' });
      expect(mockMandateRepo.update).toHaveBeenCalledWith('man_abc', { status: 'ACTIVE' });
      expect(result.status).toBe('COMPLETED');
      expect(mockWebhookDelivery.deliver).toHaveBeenCalledWith(expect.objectContaining({
        event_type: 'PAYMENT_UPDATED',
        target_url: 'http://localhost:3005/v1/webhook/kwik/co-1',
        payload: expect.objectContaining({ payment_status: 'COMPLETED' }),
      }));
    });

    it('should throw NotFoundException when payment is not found', async () => {
      mockPaymentRepo.findOne.mockResolvedValue(null);
      await expect(service.complete('pay_missing')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when payment is already COMPLETED', async () => {
      mockPaymentRepo.findOne.mockResolvedValue({ id: 'pay_abc', status: 'COMPLETED' } as PaymentEntity);
      await expect(service.complete('pay_abc')).rejects.toThrow(BadRequestException);
    });

    it('should deliver webhook using MOCK_DEFAULT_COMPANY_UUID when payment has no company_uuid', async () => {
      mockConfig.defaultCompanyUuid = 'fallback-co';
      const existingPayment = {
        id: 'pay_abc',
        status: 'RUNNING',
        notify_url: null,
        company_uuid: null,
        mandate_id: 'man_abc',
        customers_id: 'cus_1',
        amount: '100.00',
      } as PaymentEntity;
      mockPaymentRepo.findOne.mockResolvedValue(existingPayment);

      const result = await service.complete('pay_abc') as Record<string, unknown>;

      expect(result.webhook_delivered).toBe(true);
      expect(mockWebhookDelivery.deliver).toHaveBeenCalledWith(expect.objectContaining({
        target_url: 'http://localhost:3005/v1/webhook/kwik/fallback-co',
      }));
      mockConfig.defaultCompanyUuid = null;
    });
  });
});
