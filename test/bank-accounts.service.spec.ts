import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { BankAccountsService } from '../src/bank-accounts/bank-accounts.service';
import { BankAccountEntity } from '../src/database/entities/bank-account.entity';

const mockRepo = {
  find: jest.fn(),
  create: jest.fn().mockImplementation((dto) => dto),
  save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
  update: jest.fn().mockResolvedValue(undefined),
  findOne: jest.fn(),
};

describe('BankAccountsService', () => {
  let service: BankAccountsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepo.create.mockImplementation((dto) => dto);
    mockRepo.save.mockImplementation((e) => Promise.resolve(e));
    mockRepo.update.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankAccountsService,
        { provide: getRepositoryToken(BankAccountEntity), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<BankAccountsService>(BankAccountsService);
  });

  const baseDto = {
    customers_id: 'cus_abc',
    bank_account_holder_name: 'John Doe',
    bank_account_number: '12345678',
    bank_account_type: 'CHEQUE',
    bank_name: 'ABSA_BANK_LIMITED',
    bank_branch_code: '632005',
    reference: 'REF-BA-001',
  };

  describe('findAll()', () => {
    it('should return all bank accounts from repo when no filters', async () => {
      const entities = [{ id: 'bac_1' }, { id: 'bac_2' }] as BankAccountEntity[];
      mockRepo.find.mockResolvedValue(entities);
      const result = await service.findAll();
      expect(result).toBe(entities);
    });

    it('should pass customers_id filter to repo', async () => {
      mockRepo.find.mockResolvedValue([]);
      await service.findAll({ customers_id: 'cus_abc' });
      expect(mockRepo.find).toHaveBeenCalledWith({ where: expect.objectContaining({ customers_id: 'cus_abc' }) });
    });

    it('should pass bank_account_number filter to repo', async () => {
      mockRepo.find.mockResolvedValue([]);
      await service.findAll({ bank_account_number: '12345678' });
      expect(mockRepo.find).toHaveBeenCalledWith({ where: expect.objectContaining({ bank_account_number: '12345678' }) });
    });
  });

  describe('createMany()', () => {
    it('should generate IDs starting with "bac_"', async () => {
      await service.createMany([baseDto]);
      const arg = mockRepo.create.mock.calls[0][0];
      expect(arg.id).toMatch(/^bac_/);
    });

    it('should set default status to "ACTIVE" when not provided', async () => {
      await service.createMany([baseDto]);
      const arg = mockRepo.create.mock.calls[0][0];
      expect(arg.status).toBe('ACTIVE');
    });

    it('should use provided status when given', async () => {
      await service.createMany([{ ...baseDto, status: 'SUSPENDED' }]);
      const arg = mockRepo.create.mock.calls[0][0];
      expect(arg.status).toBe('SUSPENDED');
    });

    it('should normalize bank_branch_code to string', async () => {
      await service.createMany([{ ...baseDto, bank_branch_code: '632005' }]);
      const arg = mockRepo.create.mock.calls[0][0];
      expect(arg.bank_branch_code).toBe('632005');
    });

    it('should create multiple records', async () => {
      await service.createMany([baseDto, { ...baseDto, reference: 'REF-BA-002' }]);
      expect(mockRepo.create).toHaveBeenCalledTimes(2);
      expect(mockRepo.save).toHaveBeenCalledTimes(2);
    });

    it('should return created entities', async () => {
      const savedEntity = { ...baseDto, id: 'bac_abc123', status: 'ACTIVE' };
      mockRepo.create.mockReturnValue(savedEntity);
      mockRepo.save.mockResolvedValue(savedEntity);
      const result = await service.createMany([baseDto]);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(savedEntity);
    });
  });

  describe('updateMany()', () => {
    it('should call repo.update with id and fields', async () => {
      const updatedEntity = { id: 'bac_123', bank_account_number: '99999999', status: 'ACTIVE' } as BankAccountEntity;
      mockRepo.findOne.mockResolvedValue(updatedEntity);

      await service.updateMany([{ id: 'bac_123', bank_account_number: '99999999' }]);

      expect(mockRepo.update).toHaveBeenCalledWith('bac_123', { bank_account_number: '99999999' });
    });

    it('should return updated entity from repo.findOne', async () => {
      const updatedEntity = { id: 'bac_123', bank_account_number: '99999999', status: 'ACTIVE' } as BankAccountEntity;
      mockRepo.findOne.mockResolvedValue(updatedEntity);

      const result = await service.updateMany([{ id: 'bac_123', bank_account_number: '99999999' }]);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(updatedEntity);
    });

    it('should throw NotFoundException when bank account not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.updateMany([{ id: 'bac_nonexistent' }])).rejects.toThrow(NotFoundException);
    });

    it('should process multiple update records', async () => {
      const entity1 = { id: 'bac_1', bank_account_number: '111' } as BankAccountEntity;
      const entity2 = { id: 'bac_2', bank_account_number: '222' } as BankAccountEntity;
      mockRepo.findOne
        .mockResolvedValueOnce(entity1)
        .mockResolvedValueOnce(entity1)
        .mockResolvedValueOnce(entity2)
        .mockResolvedValueOnce(entity2);

      const result = await service.updateMany([
        { id: 'bac_1', bank_account_number: '111' },
        { id: 'bac_2', bank_account_number: '222' },
      ]);

      expect(mockRepo.update).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });
  });
});
