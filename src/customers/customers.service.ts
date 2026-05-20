import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerEntity } from '../database/entities/customer.entity';
import { genId } from '../common/gen-id.util';

interface CreateCustomerDto {
  reference: string;
  person_name: string;
  person_surname: string;
  client_type: string;
  id_type: string;
  id_number: string;
  email: string;
  contact_number: string;
  customer_status?: string;
}

export interface CustomerFilters {
  id?: string;
  reference?: string;
  email?: string;
  customer_email?: string;
  id_number?: string;
  customer_id_number?: string;
  contact_number?: string;
  customer_status?: string;
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(CustomerEntity)
    private readonly repo: Repository<CustomerEntity>,
  ) {}

  async findAll(filters: CustomerFilters = {}): Promise<CustomerEntity[]> {
    const where: Partial<CustomerEntity> = {};
    if (filters.id) where.id = filters.id;
    if (filters.reference) where.reference = filters.reference;
    if (filters.email || filters.customer_email) where.email = filters.email ?? filters.customer_email;
    if (filters.id_number || filters.customer_id_number) where.id_number = filters.id_number ?? filters.customer_id_number;
    if (filters.contact_number) where.contact_number = filters.contact_number;
    if (filters.customer_status) where.customer_status = filters.customer_status;
    return this.repo.find({ where });
  }

  async createMany(records: CreateCustomerDto[]): Promise<CustomerEntity[]> {
    const created: CustomerEntity[] = [];
    for (const dto of records) {
      const entity = this.repo.create({
        id: genId('cus'),
        reference: dto.reference,
        person_name: dto.person_name,
        person_surname: dto.person_surname,
        client_type: dto.client_type,
        id_type: dto.id_type,
        id_number: dto.id_number,
        email: dto.email,
        contact_number: dto.contact_number,
        customer_status: dto.customer_status ?? 'ACTIVE',
      });
      await this.repo.save(entity);
      created.push(entity);
    }
    return created;
  }
}
