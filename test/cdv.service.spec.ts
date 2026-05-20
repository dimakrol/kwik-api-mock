import { Test, TestingModule } from '@nestjs/testing';
import { CdvService } from '../src/cdv/cdv.service';
import { mockConfig } from '../src/common/mock-config';

describe('CdvService', () => {
  let service: CdvService;

  beforeEach(async () => {
    mockConfig.reset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CdvService],
    }).compile();

    service = module.get<CdvService>(CdvService);
  });

  afterEach(() => {
    delete process.env.CDV_FAIL_UNKNOWN;
    mockConfig.reset();
  });

  describe('validate()', () => {
    describe('when CDV_FAIL_UNKNOWN is not set', () => {
      it('should return passed: true for any record', () => {
        const results = service.validate([
          { bank_branch_code: 999999, bank_account_number: '000000000', bank_account_type: 'CHEQUE' },
        ]);
        expect(results).toHaveLength(1);
        expect(results[0].passed).toBe(true);
      });

      it('should return passed: true for multiple records with arbitrary data', () => {
        const results = service.validate([
          { bank_branch_code: 111111, bank_account_number: '111', bank_account_type: 'SAVINGS' },
          { bank_branch_code: 222222, bank_account_number: '222', bank_account_type: 'CHEQUE' },
        ]);
        expect(results.every((r) => r.passed)).toBe(true);
      });
    });

    describe('when CDV_FAIL_UNKNOWN=true (via env)', () => {
      beforeEach(() => {
        process.env.CDV_FAIL_UNKNOWN = 'true';
      });

      it('should return passed: true for ABSA branch 632005 with any account', () => {
        const results = service.validate([
          { bank_branch_code: 632005, bank_account_number: 'any-account-123', bank_account_type: 'CHEQUE' },
        ]);
        expect(results[0].passed).toBe(true);
        expect(results[0].error).toBeNull();
      });

      it('should return passed: true for Standard Bank branch 51001 with account 10004301100', () => {
        const results = service.validate([
          { bank_branch_code: 51001, bank_account_number: '10004301100', bank_account_type: 'CHEQUE' },
        ]);
        expect(results[0].passed).toBe(true);
        expect(results[0].error).toBeNull();
      });

      it('should return passed: false for Standard Bank branch 51001 with a wrong account', () => {
        const results = service.validate([
          { bank_branch_code: 51001, bank_account_number: '00000000000', bank_account_type: 'CHEQUE' },
        ]);
        expect(results[0].passed).toBe(false);
        expect(results[0].error).not.toBeNull();
      });

      it('should return passed: true for FNB branch 250655 with account 62001872440', () => {
        const results = service.validate([
          { bank_branch_code: 250655, bank_account_number: '62001872440', bank_account_type: 'CHEQUE' },
        ]);
        expect(results[0].passed).toBe(true);
        expect(results[0].error).toBeNull();
      });

      it('should return passed: false for unknown branch/account combination', () => {
        const results = service.validate([
          { bank_branch_code: 999999, bank_account_number: '12345678', bank_account_type: 'SAVINGS' },
        ]);
        expect(results[0].passed).toBe(false);
        expect(results[0].error).toBe('Account validation failed');
      });

      it('should process multiple records independently', () => {
        const results = service.validate([
          { bank_branch_code: 632005, bank_account_number: 'any', bank_account_type: 'CHEQUE' },
          { bank_branch_code: 999999, bank_account_number: 'unknown', bank_account_type: 'SAVINGS' },
          { bank_branch_code: 51001, bank_account_number: '10004301100', bank_account_type: 'CHEQUE' },
        ]);
        expect(results).toHaveLength(3);
        expect(results[0].passed).toBe(true);
        expect(results[1].passed).toBe(false);
        expect(results[2].passed).toBe(true);
      });
    });

    describe('when CDV_FAIL_UNKNOWN set via mockConfig', () => {
      beforeEach(() => {
        mockConfig.cdvFailUnknown = true;
      });

      it('should respect mockConfig override', () => {
        const results = service.validate([
          { bank_branch_code: 999999, bank_account_number: 'any', bank_account_type: 'CHEQUE' },
        ]);
        expect(results[0].passed).toBe(false);
      });
    });

    describe('branch code normalization', () => {
      it('should accept string branch code and return it as string', () => {
        const results = service.validate([
          { bank_branch_code: '632005', bank_account_number: 'acc123', bank_account_type: 'CHEQUE' },
        ]);
        expect(results[0].bank_branch_code).toBe('632005');
        expect(typeof results[0].bank_branch_code).toBe('string');
      });

      it('should accept numeric branch code and return it as string', () => {
        const results = service.validate([
          { bank_branch_code: 632005, bank_account_number: 'acc123', bank_account_type: 'CHEQUE' },
        ]);
        expect(results[0].bank_branch_code).toBe('632005');
        expect(typeof results[0].bank_branch_code).toBe('string');
      });

      it('should preserve leading zeros when branch code is provided as a string', () => {
        const results = service.validate([
          { bank_branch_code: '051001', bank_account_number: 'acc123', bank_account_type: 'CHEQUE' },
        ]);
        expect(results[0].bank_branch_code).toBe('051001');
      });

      it('should match Standard Bank branch "051001" (string with leading zero) as known passing account', () => {
        process.env.CDV_FAIL_UNKNOWN = 'true';
        const results = service.validate([
          { bank_branch_code: '051001', bank_account_number: '10004301100', bank_account_type: 'CHEQUE' },
        ]);
        expect(results[0].passed).toBe(true);
        expect(results[0].bank_branch_code).toBe('051001');
      });

      it('should fail unknown account for Standard Bank branch "051001" when CDV_FAIL_UNKNOWN=true', () => {
        process.env.CDV_FAIL_UNKNOWN = 'true';
        const results = service.validate([
          { bank_branch_code: '051001', bank_account_number: '00000000000', bank_account_type: 'CHEQUE' },
        ]);
        expect(results[0].passed).toBe(false);
        expect(results[0].bank_branch_code).toBe('051001');
      });
    });

    describe('result fields', () => {
      it('should include all original fields in the result', () => {
        const input = { bank_branch_code: 632005, bank_account_number: 'acc123', bank_account_type: 'SAVINGS' };
        const results = service.validate([input]);
        expect(results[0].bank_branch_code).toBe('632005');
        expect(results[0].bank_account_number).toBe(input.bank_account_number);
        expect(results[0].bank_account_type).toBe(input.bank_account_type);
      });

      it('should always set modified_bank_account_number to null', () => {
        const results = service.validate([
          { bank_branch_code: 632005, bank_account_number: 'acc123', bank_account_type: 'CHEQUE' },
        ]);
        expect(results[0].modified_bank_account_number).toBeNull();
      });

      it('should always set warning to null', () => {
        const results = service.validate([
          { bank_branch_code: 632005, bank_account_number: 'acc123', bank_account_type: 'CHEQUE' },
        ]);
        expect(results[0].warning).toBeNull();
      });

      it('should set error to null when passed is true', () => {
        const results = service.validate([
          { bank_branch_code: 632005, bank_account_number: 'acc123', bank_account_type: 'CHEQUE' },
        ]);
        expect(results[0].passed).toBe(true);
        expect(results[0].error).toBeNull();
      });
    });
  });
});
