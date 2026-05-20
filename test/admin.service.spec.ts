import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminService } from '../src/admin/admin.service';
import { PaymentMethodEntity } from '../src/database/entities/payment-method.entity';
import { LookupEntity } from '../src/database/entities/lookup.entity';
import { CustomerEntity } from '../src/database/entities/customer.entity';
import { BankAccountEntity } from '../src/database/entities/bank-account.entity';
import { PaymentEntity } from '../src/database/entities/payment.entity';
import { MandateEntity } from '../src/database/entities/mandate.entity';
import { CheckoutSessionEntity } from '../src/database/entities/checkout-session.entity';
import { WebhookDeliveryService } from '../src/webhook-delivery/webhook-delivery.service';
import { SeedService } from '../src/seed/seed.service';
import { mockConfig } from '../src/common/mock-config';

const mockPaymentMethodRepo = { find: jest.fn(), clear: jest.fn() };
const mockLookupRepo = { find: jest.fn(), clear: jest.fn() };
const mockCustomerRepo = { find: jest.fn(), clear: jest.fn(), delete: jest.fn() };
const mockBankAccountRepo = { find: jest.fn(), clear: jest.fn() };
const mockPaymentRepo = { find: jest.fn(), clear: jest.fn() };
const mockMandateRepo = { find: jest.fn(), clear: jest.fn() };
const mockCheckoutRepo = { find: jest.fn(), clear: jest.fn() };
const mockSeedService = { seed: jest.fn().mockResolvedValue(undefined) };
const mockWebhookDeliveryService = {
  deliver: jest.fn(),
  replay: jest.fn(),
  findAll: jest.fn().mockResolvedValue([]),
  clear: jest.fn().mockResolvedValue(undefined),
};

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfig.reset();
    mockSeedService.seed.mockResolvedValue(undefined);
    mockCustomerRepo.clear.mockResolvedValue(undefined);
    mockCustomerRepo.delete.mockResolvedValue(undefined);
    mockBankAccountRepo.clear.mockResolvedValue(undefined);
    mockPaymentRepo.clear.mockResolvedValue(undefined);
    mockMandateRepo.clear.mockResolvedValue(undefined);
    mockCheckoutRepo.clear.mockResolvedValue(undefined);
    mockPaymentMethodRepo.clear.mockResolvedValue(undefined);
    mockLookupRepo.clear.mockResolvedValue(undefined);
    mockWebhookDeliveryService.clear.mockResolvedValue(undefined);
    mockWebhookDeliveryService.findAll.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(PaymentMethodEntity), useValue: mockPaymentMethodRepo },
        { provide: getRepositoryToken(LookupEntity), useValue: mockLookupRepo },
        { provide: getRepositoryToken(CustomerEntity), useValue: mockCustomerRepo },
        { provide: getRepositoryToken(BankAccountEntity), useValue: mockBankAccountRepo },
        { provide: getRepositoryToken(PaymentEntity), useValue: mockPaymentRepo },
        { provide: getRepositoryToken(MandateEntity), useValue: mockMandateRepo },
        { provide: getRepositoryToken(CheckoutSessionEntity), useValue: mockCheckoutRepo },
        { provide: WebhookDeliveryService, useValue: mockWebhookDeliveryService },
        { provide: SeedService, useValue: mockSeedService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  describe('fireWebhook()', () => {
    it('should call webhookDeliveryService.deliver with correct event_type and target_url', async () => {
      mockWebhookDeliveryService.deliver.mockResolvedValue({
        id: 'wdl_1', success: true, response_status: 200, response_body: '{}', event_id: 'evt_1',
      });

      await service.fireWebhook({
        target_url: 'https://example.com/hook',
        event_type: 'PAYMENT_STATUS',
        payload: { payment_id: 'pay_abc' },
      });

      expect(mockWebhookDeliveryService.deliver).toHaveBeenCalledWith(expect.objectContaining({
        event_type: 'PAYMENT_STATUS',
        target_url: 'https://example.com/hook',
        payload: { payment_id: 'pay_abc' },
      }));
    });

    it('should pass auth_override when auth is provided', async () => {
      mockWebhookDeliveryService.deliver.mockResolvedValue({
        id: 'wdl_1', success: true, response_status: 200, response_body: '{}',
      });

      await service.fireWebhook({
        target_url: 'https://example.com/hook',
        event_type: 'MANDATE_UPDATED',
        payload: {},
        auth: { access_key: 'mykey', access_secret: 'mysecret' },
      });

      expect(mockWebhookDeliveryService.deliver).toHaveBeenCalledWith(expect.objectContaining({
        auth_override: { access_key: 'mykey', access_secret: 'mysecret' },
      }));
    });

    it('should return { ok, delivery_id, status, body } on success', async () => {
      mockWebhookDeliveryService.deliver.mockResolvedValue({
        id: 'wdl_abc', success: true, response_status: 200, response_body: '{"result":"done"}',
      });

      const result = await service.fireWebhook({
        target_url: 'https://example.com/hook',
        event_type: 'PAYMENT_STATUS',
        payload: {},
      }) as Record<string, unknown>;

      expect(result.ok).toBe(true);
      expect(result.delivery_id).toBe('wdl_abc');
      expect(result.status).toBe(200);
    });

    it('should return { ok: false, error } when deliver throws', async () => {
      mockWebhookDeliveryService.deliver.mockRejectedValue(new Error('Network error'));

      const result = await service.fireWebhook({
        target_url: 'https://example.com/hook',
        event_type: 'PAYMENT_STATUS',
        payload: {},
      }) as Record<string, unknown>;

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('getAllData()', () => {
    it('should call find/findAll on all repos and return all results including webhook_deliveries and scenario', async () => {
      const pmData = [{ id: 'pam_1' }];
      const lookupData = [{ id: 'loo_1' }];
      const customerData = [{ id: 'cus_1' }];
      const bankAccountData = [{ id: 'bac_1' }];
      const paymentData = [{ id: 'pay_1' }];
      const mandateData = [{ id: 'man_1' }];
      const checkoutData = [{ id: 'cho_1' }];
      const deliveryData = [{ id: 'wdl_1' }];

      mockPaymentMethodRepo.find.mockResolvedValue(pmData);
      mockLookupRepo.find.mockResolvedValue(lookupData);
      mockCustomerRepo.find.mockResolvedValue(customerData);
      mockBankAccountRepo.find.mockResolvedValue(bankAccountData);
      mockPaymentRepo.find.mockResolvedValue(paymentData);
      mockMandateRepo.find.mockResolvedValue(mandateData);
      mockCheckoutRepo.find.mockResolvedValue(checkoutData);
      mockWebhookDeliveryService.findAll.mockResolvedValue(deliveryData);

      const result = await service.getAllData() as Record<string, unknown>;

      expect(result.payment_methods).toBe(pmData);
      expect(result.customers).toBe(customerData);
      expect(result.webhook_deliveries).toBe(deliveryData);
      expect(result.scenario).toBeDefined();
    });
  });

  describe('getInterfaceData()', () => {
    it('should return { data, summary } with counts and webhook success/failed split', async () => {
      mockPaymentMethodRepo.find.mockResolvedValue([{ id: 'pam_1' }, { id: 'pam_2' }]);
      mockLookupRepo.find.mockResolvedValue([{ id: 'loo_1' }]);
      mockCustomerRepo.find.mockResolvedValue([{ id: 'cus_1' }]);
      mockBankAccountRepo.find.mockResolvedValue([]);
      mockPaymentRepo.find.mockResolvedValue([{ id: 'pay_1' }]);
      mockMandateRepo.find.mockResolvedValue([]);
      mockCheckoutRepo.find.mockResolvedValue([{ id: 'cho_1' }]);
      mockWebhookDeliveryService.findAll.mockResolvedValue([
        { id: 'wdl_1', success: true },
        { id: 'wdl_2', success: false },
        { id: 'wdl_3', success: true },
      ]);

      const result = (await service.getInterfaceData()) as { data: object; summary: Record<string, number> };

      expect(result.data).toBeDefined();
      expect(result.summary.payment_methods).toBe(2);
      expect(result.summary.lookups).toBe(1);
      expect(result.summary.customers).toBe(1);
      expect(result.summary.bank_accounts).toBe(0);
      expect(result.summary.payments).toBe(1);
      expect(result.summary.mandates).toBe(0);
      expect(result.summary.checkout_sessions).toBe(1);
      expect(result.summary.webhook_deliveries).toBe(3);
      expect(result.summary.webhook_success).toBe(2);
      expect(result.summary.webhook_failed).toBe(1);
    });
  });

  describe('resetData()', () => {
    it('should clear transactional repos and delete non-seed customers by default', async () => {
      await service.resetData();

      expect(mockWebhookDeliveryService.clear).toHaveBeenCalledTimes(1);
      expect(mockCheckoutRepo.clear).toHaveBeenCalledTimes(1);
      expect(mockMandateRepo.clear).toHaveBeenCalledTimes(1);
      expect(mockPaymentRepo.clear).toHaveBeenCalledTimes(1);
      expect(mockBankAccountRepo.clear).toHaveBeenCalledTimes(1);
      expect(mockCustomerRepo.delete).toHaveBeenCalledTimes(1);
      expect(mockCustomerRepo.clear).not.toHaveBeenCalled();
    });

    it('should clear ALL repos and re-seed when all=true', async () => {
      await service.resetData(true);

      expect(mockCustomerRepo.clear).toHaveBeenCalledTimes(1);
      expect(mockLookupRepo.clear).toHaveBeenCalledTimes(1);
      expect(mockPaymentMethodRepo.clear).toHaveBeenCalledTimes(1);
      expect(mockSeedService.seed).toHaveBeenCalledTimes(1);
    });
  });

  describe('runSeed()', () => {
    it('should call seedService.seed()', async () => {
      await service.runSeed();
      expect(mockSeedService.seed).toHaveBeenCalledTimes(1);
    });
  });

  describe('getScenario()', () => {
    it('should return current scenario config', () => {
      const scenario = service.getScenario() as Record<string, unknown>;
      expect(scenario).toHaveProperty('authMode');
      expect(scenario).toHaveProperty('cdvFailUnknown');
    });
  });

  describe('updateScenario()', () => {
    it('should update authMode in mockConfig', () => {
      service.updateScenario({ authMode: 'strict' });
      expect(mockConfig.authMode).toBe('strict');
    });

    it('should update cdvFailUnknown in mockConfig', () => {
      service.updateScenario({ cdvFailUnknown: true });
      expect(mockConfig.cdvFailUnknown).toBe(true);
    });

    it('should return updated config', () => {
      const result = service.updateScenario({ webhookAuthMode: 'api-key' }) as Record<string, unknown>;
      expect(result.webhookAuthMode).toBe('api-key');
    });
  });
});
