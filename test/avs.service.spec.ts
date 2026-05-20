import { Test, TestingModule } from '@nestjs/testing';
import { AvsService } from '../src/avs/avs.service';

describe('AvsService', () => {
  let service: AvsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AvsService],
    }).compile();

    service = module.get<AvsService>(AvsService);
  });

  describe('verify()', () => {
    it('should return passed: true', () => {
      const result = service.verify() as Record<string, unknown>;
      expect(result.passed).toBe(true);
    });

    it('should return id_number_match: true', () => {
      const result = service.verify() as Record<string, unknown>;
      expect(result.id_number_match).toBe(true);
    });

    it('should return initials_match: true', () => {
      const result = service.verify() as Record<string, unknown>;
      expect(result.initials_match).toBe(true);
    });

    it('should return surname_match: true', () => {
      const result = service.verify() as Record<string, unknown>;
      expect(result.surname_match).toBe(true);
    });

    it('should return an object with all four match fields', () => {
      const result = service.verify() as Record<string, unknown>;
      expect(result).toMatchObject({
        passed: true,
        id_number_match: true,
        initials_match: true,
        surname_match: true,
      });
    });
  });
});
