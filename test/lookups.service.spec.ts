import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LookupsService } from '../src/lookups/lookups.service';
import { LookupEntity } from '../src/database/entities/lookup.entity';

describe('LookupsService', () => {
  let service: LookupsService;

  const mockQb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };

  const mockRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(mockQb),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepo.createQueryBuilder.mockReturnValue(mockQb);
    mockQb.where.mockReturnThis();
    mockQb.andWhere.mockReturnThis();
    mockQb.getMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LookupsService,
        { provide: getRepositoryToken(LookupEntity), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<LookupsService>(LookupsService);
  });

  describe('findByTypeAndMethod()', () => {
    it('should call andWhere with pmId when paymentMethodsId is provided', async () => {
      await service.findByTypeAndMethod('bank_name', 'pam_test_id');
      expect(mockQb.andWhere).toHaveBeenCalledWith('l.payment_methods_id = :pmId', { pmId: 'pam_test_id' });
    });

    it('should NOT call andWhere when paymentMethodsId is not provided', async () => {
      await service.findByTypeAndMethod('bank_name');
      expect(mockQb.andWhere).not.toHaveBeenCalled();
    });

    it('should use where clause with the provided type', async () => {
      await service.findByTypeAndMethod('bank_name');
      expect(mockQb.where).toHaveBeenCalledWith('l.type = :type', { type: 'bank_name' });
    });

    it('should map entity fields correctly', async () => {
      const entity: Partial<LookupEntity> = {
        id: 'loo_absa',
        parent_lookups_id: null,
        title: 'ABSA Bank',
        enum: 'ABSA_BANK_LIMITED',
        type: 'bank_name',
      };
      mockQb.getMany.mockResolvedValue([entity]);

      const results = await service.findByTypeAndMethod('bank_name') as Record<string, unknown>[];

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 'loo_absa',
        parent_lookups_id: null,
        title: 'ABSA Bank',
        enum: 'ABSA_BANK_LIMITED',
        type: 'bank_name',
      });
    });

    it('should map parent_lookups_id as null when entity field is null', async () => {
      const entity: Partial<LookupEntity> = {
        id: 'loo_fnb',
        parent_lookups_id: null,
        title: 'FNB',
        enum: 'FNB',
        type: 'bank_name',
      };
      mockQb.getMany.mockResolvedValue([entity]);

      const [result] = await service.findByTypeAndMethod('bank_name') as Record<string, unknown>[];

      expect(result.parent_lookups_id).toBeNull();
    });

    it('should return empty array when query returns nothing', async () => {
      mockQb.getMany.mockResolvedValue([]);
      const results = await service.findByTypeAndMethod('unknown_type');
      expect(results).toEqual([]);
    });

    it('should return multiple mapped entries', async () => {
      const entities: Partial<LookupEntity>[] = [
        { id: 'loo_1', parent_lookups_id: null, title: 'Bank A', enum: 'BANK_A', type: 'bank_name' },
        { id: 'loo_2', parent_lookups_id: null, title: 'Bank B', enum: 'BANK_B', type: 'bank_name' },
      ];
      mockQb.getMany.mockResolvedValue(entities);

      const results = await service.findByTypeAndMethod('bank_name') as Record<string, unknown>[];

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('loo_1');
      expect(results[1].id).toBe('loo_2');
    });
  });
});
