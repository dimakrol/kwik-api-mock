import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBasicAuth, ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BasicAuthGuard } from '../common/basic-auth.guard';
import { BankAccountsService } from './bank-accounts.service';

const REQUIRED_BANK_ACCOUNT_FIELDS = [
  'customer_id', 'bank_account_holder_name', 'bank_account_number', 'bank_account_type',
  'bank_name', 'bank_branch_code',
];

const bankAccountExample = {
  id: 'ban_xxx',
  customer_id: 'cus_xxx',
  bank_account_holder_name: 'John Doe',
  bank_account_number: '10004291601',
  bank_account_type: 'CHEQUE_OR_CURRENT',
  bank_name: 'ABSA_BANK_LIMITED',
  bank_branch_code: '632005',
  bank_account_status: 'ACTIVE',
  created_at: '2026-01-01T00:00:00.000Z',
};

const unauthorizedSchema = { example: { status: false, error_code: '001', error_message: 'Invalid API key provided.' } };
const validationErrorSchema = { example: { status: false, error_code: '002', error_message: 'Readable validation message' } };

function serializeBankAccount(record: Record<string, unknown>): Record<string, unknown> {
  const { customers_id, reference: _reference, status, ...rest } = record;
  return {
    ...rest,
    customer_id: customers_id,
    bank_account_status: status,
  };
}

@ApiTags('bank-accounts')
@ApiBasicAuth()
@UseGuards(BasicAuthGuard)
@Controller('bank-accounts')
export class BankAccountsController {
  constructor(private readonly service: BankAccountsService) {}

  @Get('list')
  @ApiOperation({ summary: 'List bank accounts with optional exact-match filters' })
  @ApiQuery({ name: 'id', required: false })
  @ApiQuery({ name: 'customer_id', required: false })
  @ApiQuery({ name: 'bank_account_number', required: false })
  @ApiQuery({ name: 'bank_name', required: false })
  @ApiQuery({ name: 'bank_branch_code', required: false })
  @ApiQuery({ name: 'bank_account_status', required: false })
  @ApiResponse({ status: 200, schema: { example: { status: true, results: [bankAccountExample] } } })
  @ApiResponse({ status: 401, description: 'Invalid API key', schema: unauthorizedSchema })
  async list(
    @Query('id') id?: string,
    @Query('customer_id') customer_id?: string,
    @Query('bank_account_number') bank_account_number?: string,
    @Query('bank_name') bank_name?: string,
    @Query('bank_branch_code') bank_branch_code?: string,
    @Query('bank_account_status') bank_account_status?: string,
  ): Promise<{ status: boolean; results: object[] }> {
    const bankAccounts = await this.service.findAll({
      id, customer_id, bank_account_number, bank_name, bank_branch_code, bank_account_status,
    });
    return { status: true, results: bankAccounts.map((record) => serializeBankAccount(record as never)) };
  }

  @Post('create')
  @ApiOperation({ summary: 'Create one or more bank accounts' })
  @ApiBody({
    schema: {
      example: {
        records: [{
          customer_id: 'cus_xxx',
          bank_account_holder_name: 'John Doe',
          bank_account_number: '10004291601',
          bank_account_type: 'CHEQUE_OR_CURRENT',
          bank_name: 'ABSA_BANK_LIMITED',
          bank_branch_code: '632005',
        }],
      },
    },
  })
  @ApiResponse({ status: 200, schema: { example: { status: true, results: [bankAccountExample] } } })
  @ApiResponse({ status: 400, description: 'Validation error', schema: validationErrorSchema })
  @ApiResponse({ status: 401, description: 'Invalid API key', schema: unauthorizedSchema })
  async create(@Body() body: { records: Record<string, string>[] }): Promise<{ status: boolean; results: object[] }> {
    if (!body?.records || !Array.isArray(body.records) || body.records.length === 0) {
      throw new BadRequestException({ status: false, error_code: '002', error_message: 'records must be a non-empty array' });
    }
    for (const record of body.records) {
      for (const field of REQUIRED_BANK_ACCOUNT_FIELDS) {
        if (!record[field]) {
          throw new BadRequestException({ status: false, error_code: '002', error_message: `Field "${field}" is required` });
        }
      }
    }
    const bankAccounts = await this.service.createMany(body.records as never);
    return { status: true, results: bankAccounts.map((record) => serializeBankAccount(record as never)) };
  }

  @Post('update')
  @ApiOperation({ summary: 'Update one or more bank accounts' })
  @ApiBody({
    schema: {
      example: { records: [{ id: 'ban_xxx', bank_account_status: 'DISABLED' }] },
    },
  })
  @ApiResponse({ status: 200, schema: { example: { status: true, results: [bankAccountExample] } } })
  @ApiResponse({ status: 400, description: 'Validation error', schema: validationErrorSchema })
  @ApiResponse({ status: 401, description: 'Invalid API key', schema: unauthorizedSchema })
  @ApiResponse({ status: 404, description: 'Bank account not found' })
  async update(
    @Body() body: { records: Array<{ id: string; [key: string]: unknown }> },
  ): Promise<{ status: boolean; results: object[] }> {
    if (!body?.records || !Array.isArray(body.records) || body.records.length === 0) {
      throw new BadRequestException({ status: false, error_code: '002', error_message: 'records must be a non-empty array' });
    }
    for (const record of body.records) {
      if (!record.id) {
        throw new BadRequestException({ status: false, error_code: '002', error_message: 'Each record must include "id"' });
      }
    }
    const bankAccounts = await this.service.updateMany(
      body.records.map(({ bank_account_status, ...record }) => ({
        ...record,
        ...(bank_account_status ? { status: bank_account_status } : {}),
      })) as never,
    );
    return { status: true, results: bankAccounts.map((record) => serializeBankAccount(record as never)) };
  }
}
