import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from '../src/payments/payments.service';
import { PaymentEntity } from '../src/database/entities/payment.entity';
import { MandateEntity } from '../src/database/entities/mandate.entity';
import { WebhookDeliveryService } from '../src/webhook-delivery/webhook-delivery.service';

const mockPaymentRepo = {
  create: jest.fn().mockImplementation((dto) => dto),
  save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
  update: jest.fn().mockResolvedValue(undefined),
  findOne: jest.fn(),
};

const mockMandateRepo = {
  create: jest.fn().mockImplementation((dto) => dto),
  save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
};

const mockWebhookDelivery = {
  deliver: jest.fn().mockResolvedValue({ id: 'wdl_1', success: true }),
  replay: jest.fn(),
  findAll: jest.fn(),
  clear: jest.fn(),
};

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(async () => {
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

    it('should return object with id, mandate_id, customers_id, bank_accounts_id, payment_methods_id, amount, status', async () => {
      const result = await service.submit(baseDto) as Record<string, unknown>;
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('mandate_id');
      expect(result.customers_id).toBe('cus_test');
      expect(result.bank_accounts_id).toBe('bac_test');
      expect(result.payment_methods_id).toBe('pam_test');
      expect(result.amount).toBe('500.00');
      expect(result.status).toBe('RUNNING');
    });

    it('should handle optional fields: process_day, payment_interval, date_start, date_end', async () => {
      const dto = { ...baseDto, process_day: 1, payment_interval: 'MONTHLY', date_start: '2025-01-01', date_end: '2026-01-01' };
      const result = await service.submit(dto) as Record<string, unknown>;
      expect(result.process_day).toBe(1);
      expect(result.payment_interval).toBe('MONTHLY');
      expect(result.date_start).toBe('2025-01-01');
      expect(result.date_end).toBe('2026-01-01');
    });

    it('should set process_day to null when not provided', async () => {
      const result = await service.submit(baseDto) as Record<string, unknown>;
      expect(result.process_day).toBeNull();
    });

    it('should set payment_interval to null when not provided', async () => {
      const result = await service.submit(baseDto) as Record<string, unknown>;
      expect(result.payment_interval).toBeNull();
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

    it('should deliver MANDATE_UPDATED and PAYMENT_STATUS webhooks when notify_url provided', async () => {
      await service.submit({ ...baseDto, notify_url: 'https://hook.example.com' });
      expect(mockWebhookDelivery.deliver).toHaveBeenCalledTimes(2);
      const calls = mockWebhookDelivery.deliver.mock.calls.map((c: [Record<string, unknown>]) => c[0].event_type);
      expect(calls).toContain('MANDATE_UPDATED');
      expect(calls).toContain('PAYMENT_STATUS');
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

    it('should return { id, status } on success', async () => {
      const existingPayment = { id: 'pay_abc', status: 'RUNNING', notify_url: null } as PaymentEntity;
      mockPaymentRepo.findOne.mockResolvedValue(existingPayment);

      const result = await service.updateStatus('pay_abc', 'STOPPED') as Record<string, unknown>;

      expect(result.id).toBe('pay_abc');
      expect(result.status).toBe('STOPPED');
    });

    it('should throw BadRequestException for invalid status', async () => {
      const existingPayment = { id: 'pay_abc', status: 'RUNNING', notify_url: null } as PaymentEntity;
      mockPaymentRepo.findOne.mockResolvedValue(existingPayment);

      await expect(service.updateStatus('pay_abc', 'INVALID_STATUS')).rejects.toThrow(BadRequestException);
    });

    it('should deliver PAYMENT_STATUS webhook when payment has notify_url', async () => {
      const existingPayment = { id: 'pay_abc', status: 'RUNNING', notify_url: 'https://hook.example.com', mandate_id: 'man_abc', customers_id: 'cus_1', amount: '100.00' } as PaymentEntity;
      mockPaymentRepo.findOne.mockResolvedValue(existingPayment);

      await service.updateStatus('pay_abc', 'PAID');

      expect(mockWebhookDelivery.deliver).toHaveBeenCalledWith(expect.objectContaining({
        event_type: 'PAYMENT_STATUS',
        target_url: 'https://hook.example.com',
        payload: expect.objectContaining({ payment_status: 'PAID' }),
      }));
    });
  });
});
