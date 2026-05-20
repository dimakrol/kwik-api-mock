import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BankAccountEntity } from '../database/entities/bank-account.entity';
import { genId } from '../common/gen-id.util';

interface CreateBankAccountDto {
  customer_id: string;
  bank_account_holder_name: string;
  bank_account_number: string;
  bank_account_type: string;
  bank_name: string;
  bank_branch_code: string;
  reference?: string;
  bank_account_status?: string;
}

interface UpdateBankAccountDto {
  id: string;
  bank_account_holder_name?: string;
  bank_account_number?: string;
  bank_account_type?: string;
  bank_name?: string;
  bank_branch_code?: string;
  reference?: string;
  status?: string;
}

export interface BankAccountFilters {
  id?: string;
  customer_id?: string;
  bank_account_number?: string;
  bank_name?: string;
  bank_branch_code?: string;
  bank_account_status?: string;
}

@Injectable()
export class BankAccountsService {
  constructor(
    @InjectRepository(BankAccountEntity)
    private readonly repo: Repository<BankAccountEntity>,
  ) {}

  async findAll(filters: BankAccountFilters = {}): Promise<BankAccountEntity[]> {
    const where: Partial<BankAccountEntity> = {};
    if (filters.id) where.id = filters.id;
    if (filters.customer_id) where.customers_id = filters.customer_id;
    if (filters.bank_account_number) where.bank_account_number = filters.bank_account_number;
    if (filters.bank_name) where.bank_name = filters.bank_name;
    if (filters.bank_branch_code) where.bank_branch_code = String(filters.bank_branch_code);
    if (filters.bank_account_status) where.status = filters.bank_account_status;
    return this.repo.find({ where });
  }

  async createMany(records: CreateBankAccountDto[]): Promise<BankAccountEntity[]> {
    const created: BankAccountEntity[] = [];
    for (const dto of records) {
      const entity = this.repo.create({
        id: genId('ban'),
        customers_id: dto.customer_id,
        bank_account_holder_name: dto.bank_account_holder_name,
        bank_account_number: dto.bank_account_number,
        bank_account_type: dto.bank_account_type,
        bank_name: dto.bank_name,
        bank_branch_code: String(dto.bank_branch_code),
        reference: dto.reference ?? '',
        status: dto.bank_account_status ?? 'ACTIVE',
      });
      await this.repo.save(entity);
      created.push(entity);
    }
    return created;
  }

  async updateMany(records: UpdateBankAccountDto[]): Promise<BankAccountEntity[]> {
    const updated: BankAccountEntity[] = [];
    for (const dto of records) {
      const { id, ...fields } = dto;
      const existing = await this.repo.findOne({ where: { id } });
      if (!existing) {
        throw new NotFoundException({ status: false, error_code: '007', error_message: `Bank account "${id}" not found` });
      }
      if (Object.keys(fields).length > 0) {
        await this.repo.update(id, fields);
      }
      const refreshed = await this.repo.findOne({ where: { id } });
      if (refreshed) updated.push(refreshed);
    }
    return updated;
  }
}
