import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBasicAuth, ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BasicAuthGuard } from '../common/basic-auth.guard';
import { BankAccountsService } from './bank-accounts.service';

const REQUIRED_BANK_ACCOUNT_FIELDS = [
  'customers_id', 'bank_account_holder_name', 'bank_account_number', 'bank_account_type',
  'bank_name', 'bank_branch_code', 'reference',
];

const bankAccountExample = {
  id: 'bac_xxx',
  customers_id: 'cus_xxx',
  bank_account_holder_name: 'John Doe',
  bank_account_number: '10004291601',
  bank_account_type: 'CHEQUE_OR_CURRENT',
  bank_name: 'ABSA_BANK_LIMITED',
  bank_branch_code: '632005',
  reference: 'REF-001',
  status: 'ACTIVE',
  created_at: '2026-01-01T00:00:00.000Z',
};

const unauthorizedSchema = { example: { status: false, error_code: '001', error_message: 'Invalid API key provided.' } };
const validationErrorSchema = { example: { status: false, error_code: '002', error_message: 'Readable validation message' } };

@ApiTags('bank-accounts')
@ApiBasicAuth()
@UseGuards(BasicAuthGuard)
@Controller('bank-accounts')
export class BankAccountsController {
  constructor(private readonly service: BankAccountsService) {}

  @Get('list')
  @ApiOperation({ summary: 'List bank accounts with optional exact-match filters' })
  @ApiQuery({ name: 'id', required: false })
  @ApiQuery({ name: 'customers_id', required: false })
  @ApiQuery({ name: 'bank_account_number', required: false })
  @ApiQuery({ name: 'bank_name', required: false })
  @ApiQuery({ name: 'bank_branch_code', required: false })
  @ApiQuery({ name: 'reference', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiResponse({ status: 200, schema: { example: { status: true, bank_accounts: [bankAccountExample] } } })
  @ApiResponse({ status: 401, description: 'Invalid API key', schema: unauthorizedSchema })
  async list(
    @Query('id') id?: string,
    @Query('customers_id') customers_id?: string,
    @Query('bank_account_number') bank_account_number?: string,
    @Query('bank_name') bank_name?: string,
    @Query('bank_branch_code') bank_branch_code?: string,
    @Query('reference') reference?: string,
    @Query('status') status?: string,
  ): Promise<{ status: boolean; bank_accounts: object[] }> {
    const bank_accounts = await this.service.findAll({
      id, customers_id, bank_account_number, bank_name, bank_branch_code, reference, status,
    });
    return { status: true, bank_accounts };
  }

  @Post('create')
  @ApiOperation({ summary: 'Create one or more bank accounts' })
  @ApiBody({
    schema: {
      example: {
        records: [{
          customers_id: 'cus_xxx',
          bank_account_holder_name: 'John Doe',
          bank_account_number: '10004291601',
          bank_account_type: 'CHEQUE_OR_CURRENT',
          bank_name: 'ABSA_BANK_LIMITED',
          bank_branch_code: '632005',
          reference: 'REF-001',
        }],
      },
    },
  })
  @ApiResponse({ status: 200, schema: { example: { status: true, bank_accounts: [bankAccountExample] } } })
  @ApiResponse({ status: 400, description: 'Validation error', schema: validationErrorSchema })
  @ApiResponse({ status: 401, description: 'Invalid API key', schema: unauthorizedSchema })
  async create(@Body() body: { records: Record<string, string>[] }): Promise<{ status: boolean; bank_accounts: object[] }> {
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
    const bank_accounts = await this.service.createMany(body.records as never);
    return { status: true, bank_accounts };
  }

  @Post('update')
  @ApiOperation({ summary: 'Update one or more bank accounts' })
  @ApiBody({
    schema: {
      example: { records: [{ id: 'bac_xxx', status: 'DISABLED' }] },
    },
  })
  @ApiResponse({ status: 200, schema: { example: { status: true, bank_accounts: [bankAccountExample] } } })
  @ApiResponse({ status: 400, description: 'Validation error', schema: validationErrorSchema })
  @ApiResponse({ status: 401, description: 'Invalid API key', schema: unauthorizedSchema })
  @ApiResponse({ status: 404, description: 'Bank account not found' })
  async update(
    @Body() body: { records: Array<{ id: string; [key: string]: unknown }> },
  ): Promise<{ status: boolean; bank_accounts: object[] }> {
    if (!body?.records || !Array.isArray(body.records) || body.records.length === 0) {
      throw new BadRequestException({ status: false, error_code: '002', error_message: 'records must be a non-empty array' });
    }
    for (const record of body.records) {
      if (!record.id) {
        throw new BadRequestException({ status: false, error_code: '002', error_message: 'Each record must include "id"' });
      }
    }
    const bank_accounts = await this.service.updateMany(body.records as never);
    return { status: true, bank_accounts };
  }
}
