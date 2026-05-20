import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CustomersService } from '../src/customers/customers.service';
import { CustomerEntity } from '../src/database/entities/customer.entity';

const mockRepo = {
  find: jest.fn(),
  create: jest.fn().mockImplementation((dto) => dto),
  save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
};

describe('CustomersService', () => {
  let service: CustomersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepo.create.mockImplementation((dto) => dto);
    mockRepo.save.mockImplementation((e) => Promise.resolve(e));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: getRepositoryToken(CustomerEntity), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
  });

  describe('findAll()', () => {
    it('should return all entities from repo', async () => {
      const entities = [
        { id: 'cus_1', reference: 'REF1', person_name: 'Alice' },
        { id: 'cus_2', reference: 'REF2', person_name: 'Bob' },
      ] as CustomerEntity[];
      mockRepo.find.mockResolvedValue(entities);

      const result = await service.findAll();

      expect(result).toBe(entities);
      expect(mockRepo.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('createMany()', () => {
    const baseDto = {
      reference: 'REF-001',
      person_name: 'John',
      person_surname: 'Doe',
      client_type: 'RESIDENT_INDIVIDUAL',
      id_type: 'SOUTH_AFRICAN_ID',
      id_number: '8411180614084',
      email: 'john@test.com',
      contact_number: '+27627489042',
    };

    it('should call repo.create for each record', async () => {
      await service.createMany([baseDto]);
      expect(mockRepo.create).toHaveBeenCalledTimes(1);
    });

    it('should call repo.save for each record', async () => {
      await service.createMany([baseDto]);
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
    });

    it('should generate IDs starting with "cus_"', async () => {
      await service.createMany([baseDto]);
      const createdArg = mockRepo.create.mock.calls[0][0];
      expect(createdArg.id).toMatch(/^cus_/);
    });

    it('should default customer_status to "ACTIVE" when not provided', async () => {
      await service.createMany([baseDto]);
      const createdArg = mockRepo.create.mock.calls[0][0];
      expect(createdArg.customer_status).toBe('ACTIVE');
    });

    it('should use provided customer_status when given', async () => {
      await service.createMany([{ ...baseDto, customer_status: 'INACTIVE' }]);
      const createdArg = mockRepo.create.mock.calls[0][0];
      expect(createdArg.customer_status).toBe('INACTIVE');
    });

    it('should create all records when multiple are provided', async () => {
      await service.createMany([baseDto, { ...baseDto, reference: 'REF-002' }]);
      expect(mockRepo.create).toHaveBeenCalledTimes(2);
      expect(mockRepo.save).toHaveBeenCalledTimes(2);
    });

    it('should return created entities', async () => {
      const savedEntity = { ...baseDto, id: 'cus_abc123', customer_status: 'ACTIVE' };
      mockRepo.create.mockReturnValue(savedEntity);
      mockRepo.save.mockResolvedValue(savedEntity);

      const result = await service.createMany([baseDto]);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(savedEntity);
    });

    it('should generate unique IDs for multiple records', async () => {
      await service.createMany([baseDto, { ...baseDto, reference: 'REF-002' }]);
      const id1 = mockRepo.create.mock.calls[0][0].id;
      const id2 = mockRepo.create.mock.calls[1][0].id;
      expect(id1).not.toBe(id2);
    });
  });
});
