import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PaymentMethodsService } from '../src/payment-methods/payment-methods.service';
import { PaymentMethodEntity } from '../src/database/entities/payment-method.entity';

const mockRepo = { find: jest.fn() };

describe('PaymentMethodsService', () => {
  let service: PaymentMethodsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentMethodsService,
        { provide: getRepositoryToken(PaymentMethodEntity), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<PaymentMethodsService>(PaymentMethodsService);
  });

  describe('findAll()', () => {
    it('should return empty array when repo returns empty', async () => {
      mockRepo.find.mockResolvedValue([]);
      const result = await service.findAll();
      expect(result).toEqual([]);
    });

    it('should map base entity fields to response object correctly', async () => {
      const entity: Partial<PaymentMethodEntity> = {
        id: 'pam_test',
        payment_method_type: 'DEBIT_ORDER',
        payment_industry: 'ACCOUNT_REPAYMENT',
        provider_bank: 'ABSA_BANK_LIMITED',
        abbreviated_name: 'KWIK PAY',
        item_limit: '20000.00',
        monthly_limit: '200000.00',
        debicheck_allow_date_adjustment: null,
        debicheck_allow_variable_amount: null,
        debicheck_allow_payment_tracking: null,
        payments_bank_name: null,
        payments_bank_account_number: null,
      };
      mockRepo.find.mockResolvedValue([entity]);

      const [result] = await service.findAll() as Record<string, unknown>[];

      expect(result.id).toBe('pam_test');
      expect(result.payment_method_type).toBe('DEBIT_ORDER');
      expect(result.payment_industry).toBe('ACCOUNT_REPAYMENT');
      expect(result.provider_bank).toBe('ABSA_BANK_LIMITED');
      expect(result.abbreviated_name).toBe('KWIK PAY');
      expect(result.item_limit).toBe('20000.00');
      expect(result.monthly_limit).toBe('200000.00');
    });

    it('should include debicheck nested object when debicheck fields are non-null', async () => {
      const entity: Partial<PaymentMethodEntity> = {
        id: 'pam_dc',
        payment_method_type: 'DEBICHECK',
        payment_industry: 'ACCOUNT_REPAYMENT',
        provider_bank: 'ABSA_BANK_LIMITED',
        abbreviated_name: 'DC',
        item_limit: '10000.00',
        monthly_limit: '100000.00',
        debicheck_allow_date_adjustment: 'true',
        debicheck_allow_variable_amount: 'false',
        debicheck_allow_payment_tracking: 'true',
        debicheck_payment_tracking_max_days: 2,
        debicheck_adjustment_category: 'ANNUALLY',
        debicheck_adjustment_type: 'RATE',
        debicheck_adjustment_rate: '5.0',
        debicheck_adjustment_amount: '0.00',
        debicheck_approval_window: 'BATCH_TT2',
        payments_bank_name: null,
        payments_bank_account_number: null,
      };
      mockRepo.find.mockResolvedValue([entity]);

      const [result] = await service.findAll() as Record<string, unknown>[];

      expect(result).toHaveProperty('debicheck');
    });

    it('should NOT include debicheck key when all debicheck fields are null', async () => {
      const entity: Partial<PaymentMethodEntity> = {
        id: 'pam_nodc',
        payment_method_type: 'DEBIT_ORDER',
        payment_industry: 'ACCOUNT_REPAYMENT',
        provider_bank: 'ABSA_BANK_LIMITED',
        abbreviated_name: 'EFT',
        item_limit: '20000.00',
        monthly_limit: '200000.00',
        debicheck_allow_date_adjustment: null,
        debicheck_allow_variable_amount: null,
        debicheck_allow_payment_tracking: null,
        payments_bank_name: null,
        payments_bank_account_number: null,
      };
      mockRepo.find.mockResolvedValue([entity]);

      const [result] = await service.findAll() as Record<string, unknown>[];

      expect(result).not.toHaveProperty('debicheck');
    });

    it('should include payments nested object when payments fields are non-null', async () => {
      const entity: Partial<PaymentMethodEntity> = {
        id: 'pam_pay',
        payment_method_type: 'DEBICHECK',
        payment_industry: 'ACCOUNT_REPAYMENT',
        provider_bank: 'ABSA_BANK_LIMITED',
        abbreviated_name: 'PAY',
        item_limit: '20000.00',
        monthly_limit: '200000.00',
        debicheck_allow_date_adjustment: null,
        debicheck_allow_variable_amount: null,
        debicheck_allow_payment_tracking: null,
        payments_bank_name: 'ABSA_BANK_LIMITED',
        payments_bank_branch_code: 632005,
        payments_bank_account_number: '1201303338',
        payments_bank_account_type: 'CHEQUE_OR_CURRENT',
        payments_bank_account_holder_name: 'J DOE',
      };
      mockRepo.find.mockResolvedValue([entity]);

      const [result] = await service.findAll() as Record<string, unknown>[];

      expect(result).toHaveProperty('payments');
      const payments = result.payments as Record<string, unknown>;
      expect(payments.bank_name).toBe('ABSA_BANK_LIMITED');
      expect(payments.bank_account_number).toBe('1201303338');
    });

    it('should NOT include payments key when all payments fields are null', async () => {
      const entity: Partial<PaymentMethodEntity> = {
        id: 'pam_nopay',
        payment_method_type: 'DEBIT_ORDER',
        payment_industry: 'ACCOUNT_REPAYMENT',
        provider_bank: 'ABSA_BANK_LIMITED',
        abbreviated_name: 'EFT',
        item_limit: '20000.00',
        monthly_limit: '200000.00',
        debicheck_allow_date_adjustment: null,
        debicheck_allow_variable_amount: null,
        debicheck_allow_payment_tracking: null,
        payments_bank_name: null,
        payments_bank_account_number: null,
      };
      mockRepo.find.mockResolvedValue([entity]);

      const [result] = await service.findAll() as Record<string, unknown>[];

      expect(result).not.toHaveProperty('payments');
    });

    it('should convert debicheck.allow_date_adjustment string "true" to boolean true', async () => {
      const entity: Partial<PaymentMethodEntity> = {
        id: 'pam_dc2',
        payment_method_type: 'DEBICHECK',
        payment_industry: 'ACCOUNT_REPAYMENT',
        provider_bank: 'ABSA_BANK_LIMITED',
        abbreviated_name: 'DC',
        item_limit: '10000.00',
        monthly_limit: '100000.00',
        debicheck_allow_date_adjustment: 'true',
        debicheck_allow_variable_amount: 'false',
        debicheck_allow_payment_tracking: 'false',
        payments_bank_name: null,
        payments_bank_account_number: null,
      };
      mockRepo.find.mockResolvedValue([entity]);

      const [result] = await service.findAll() as Record<string, unknown>[];
      const debicheck = result.debicheck as Record<string, unknown>;

      expect(debicheck.allow_date_adjustment).toBe(true);
    });

    it('should convert debicheck.allow_variable_amount string "false" to boolean false', async () => {
      const entity: Partial<PaymentMethodEntity> = {
        id: 'pam_dc3',
        payment_method_type: 'DEBICHECK',
        payment_industry: 'ACCOUNT_REPAYMENT',
        provider_bank: 'ABSA_BANK_LIMITED',
        abbreviated_name: 'DC',
        item_limit: '10000.00',
        monthly_limit: '100000.00',
        debicheck_allow_date_adjustment: 'true',
        debicheck_allow_variable_amount: 'false',
        debicheck_allow_payment_tracking: 'true',
        payments_bank_name: null,
        payments_bank_account_number: null,
      };
      mockRepo.find.mockResolvedValue([entity]);

      const [result] = await service.findAll() as Record<string, unknown>[];
      const debicheck = result.debicheck as Record<string, unknown>;

      expect(debicheck.allow_variable_amount).toBe(false);
    });
  });
});
