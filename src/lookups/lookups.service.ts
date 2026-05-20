import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LookupEntity } from '../database/entities/lookup.entity';

@Injectable()
export class LookupsService {
  constructor(
    @InjectRepository(LookupEntity)
    private readonly repo: Repository<LookupEntity>,
  ) {}

  async findByTypeAndMethod(
    type: string,
    paymentMethodsId?: string,
  ): Promise<object[]> {
    const query = this.repo.createQueryBuilder('l').where('l.type = :type', { type });

    if (paymentMethodsId) {
      query.andWhere('l.payment_methods_id = :pmId', { pmId: paymentMethodsId });
    }

    const entities = await query.getMany();

    return entities.map((e) => ({
      id: e.id,
      parent_lookups_id: e.parent_lookups_id ?? null,
      title: e.title,
      enum: e.enum,
      type: e.type,
    }));
  }
}
