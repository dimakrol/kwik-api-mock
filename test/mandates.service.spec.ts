import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { MandatesService } from '../src/mandates/mandates.service';
import { MandateEntity } from '../src/database/entities/mandate.entity';
import { PaymentEntity } from '../src/database/entities/payment.entity';
import { WebhookDeliveryService } from '../src/webhook-delivery/webhook-delivery.service';

const mockMandateRepo = {
  findOne: jest.fn(),
  update: jest.fn().mockResolvedValue(undefined),
};

const mockPaymentRepo = {
  update: jest.fn().mockResolvedValue(undefined),
  findOne: jest.fn(),
};

const mockWebhookDelivery = {
  deliver: jest.fn().mockResolvedValue({ id: 'wdl_1', success: true }),
  replay: jest.fn(),
  findAll: jest.fn(),
  clear: jest.fn(),
};

describe('MandatesService', () => {
  let service: MandatesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockMandateRepo.update.mockResolvedValue(undefined);
    mockPaymentRepo.update.mockResolvedValue(undefined);
    mockPaymentRepo.findOne.mockResolvedValue(null);
    mockWebhookDelivery.deliver.mockResolvedValue({ id: 'wdl_1', success: true });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MandatesService,
        { provide: getRepositoryToken(MandateEntity), useValue: mockMandateRepo },
        { provide: getRepositoryToken(PaymentEntity), useValue: mockPaymentRepo },
        { provide: WebhookDeliveryService, useValue: mockWebhookDelivery },
      ],
    }).compile();

    service = module.get<MandatesService>(MandatesService);
  });

  describe('cancelDebicheck()', () => {
    it('should throw NotFoundException when mandate is not found', async () => {
      mockMandateRepo.findOne.mockResolvedValue(null);
      await expect(service.cancelDebicheck('man_nonexistent', 'Customer request')).rejects.toThrow(NotFoundException);
    });

    it('should update mandate status to CANCELLED', async () => {
      const mandate = { id: 'man_abc', payments_id: null, customers_id: 'cus_1', bank_accounts_id: 'bac_1', status: 'PENDING' } as MandateEntity;
      mockMandateRepo.findOne.mockResolvedValue(mandate);

      await service.cancelDebicheck('man_abc', 'Customer request');

      expect(mockMandateRepo.update).toHaveBeenCalledWith('man_abc', { status: 'CANCELLED', cancel_reason: 'Customer request' });
    });

    it('should set cancel_reason on the mandate update', async () => {
      const mandate = { id: 'man_abc', payments_id: null, customers_id: 'cus_1', bank_accounts_id: 'bac_1', status: 'PENDING' } as MandateEntity;
      mockMandateRepo.findOne.mockResolvedValue(mandate);

      await service.cancelDebicheck('man_abc', 'Fraud detected');

      const updateCall = mockMandateRepo.update.mock.calls[0];
      expect(updateCall[1].cancel_reason).toBe('Fraud detected');
    });

    it('should update linked payment status to STOPPED when payments_id exists', async () => {
      const mandate = { id: 'man_abc', payments_id: 'pay_linked', customers_id: 'cus_1', bank_accounts_id: 'bac_1', status: 'PENDING' } as MandateEntity;
      mockMandateRepo.findOne.mockResolvedValue(mandate);

      await service.cancelDebicheck('man_abc', 'Customer request');

      expect(mockPaymentRepo.update).toHaveBeenCalledWith('pay_linked', { status: 'STOPPED' });
    });

    it('should NOT call paymentRepo.update when mandate has no payments_id', async () => {
      const mandate = { id: 'man_abc', payments_id: null, customers_id: 'cus_1', bank_accounts_id: 'bac_1', status: 'PENDING' } as MandateEntity;
      mockMandateRepo.findOne.mockResolvedValue(mandate);

      await service.cancelDebicheck('man_abc', 'Customer request');

      expect(mockPaymentRepo.update).not.toHaveBeenCalled();
    });

    it('should return { id, status: "CANCELLED", cancel_reason }', async () => {
      const mandate = { id: 'man_abc', payments_id: null, customers_id: 'cus_1', bank_accounts_id: 'bac_1', status: 'PENDING' } as MandateEntity;
      mockMandateRepo.findOne.mockResolvedValue(mandate);

      const result = await service.cancelDebicheck('man_abc', 'No longer needed') as Record<string, unknown>;

      expect(result.id).toBe('man_abc');
      expect(result.status).toBe('CANCELLED');
      expect(result.cancel_reason).toBe('No longer needed');
    });

    it('should deliver MANDATE_UPDATED webhook when payment has notify_url', async () => {
      const mandate = { id: 'man_abc', payments_id: 'pay_linked', customers_id: 'cus_1', bank_accounts_id: 'bac_1', status: 'PENDING' } as MandateEntity;
      mockMandateRepo.findOne.mockResolvedValue(mandate);
      mockPaymentRepo.findOne.mockResolvedValue({ id: 'pay_linked', notify_url: 'https://hook.example.com' } as PaymentEntity);

      await service.cancelDebicheck('man_abc', 'Customer request');

      expect(mockWebhookDelivery.deliver).toHaveBeenCalledWith(expect.objectContaining({
        event_type: 'MANDATE_UPDATED',
        target_url: 'https://hook.example.com',
        payload: expect.objectContaining({ mandate_status: 'CANCELLED', kwik_mandate_id: 'man_abc' }),
      }));
    });

    it('should NOT deliver webhook when no notify_url and no default', async () => {
      const mandate = { id: 'man_abc', payments_id: null, customers_id: 'cus_1', bank_accounts_id: 'bac_1', status: 'PENDING' } as MandateEntity;
      mockMandateRepo.findOne.mockResolvedValue(mandate);

      await service.cancelDebicheck('man_abc', 'Customer request');

      expect(mockWebhookDelivery.deliver).not.toHaveBeenCalled();
    });
  });
});
