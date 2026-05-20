import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBasicAuth, ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BasicAuthGuard } from '../common/basic-auth.guard';
import { CustomersService } from './customers.service';

const REQUIRED_CUSTOMER_FIELDS = [
  'reference', 'person_name', 'person_surname', 'client_type', 'id_type', 'id_number', 'email', 'contact_number',
];

const customerExample = {
  id: 'cus_xxx',
  reference: 'REF-001',
  person_name: 'John',
  person_surname: 'Doe',
  client_type: 'RESIDENT_INDIVIDUAL',
  id_type: 'SOUTH_AFRICAN_ID',
  id_number: '8001015009087',
  email: 'john@example.com',
  contact_number: '+27821234567',
  customer_status: 'ACTIVE',
  created_at: '2026-01-01T00:00:00.000Z',
};

const unauthorizedSchema = { example: { status: false, error_code: '001', error_message: 'Invalid API key provided.' } };
const validationErrorSchema = { example: { status: false, error_code: '002', error_message: 'Readable validation message' } };

@ApiTags('customers')
@ApiBasicAuth()
@UseGuards(BasicAuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get('list')
  @ApiOperation({ summary: 'List customers with optional exact-match filters' })
  @ApiQuery({ name: 'id', required: false })
  @ApiQuery({ name: 'reference', required: false })
  @ApiQuery({ name: 'email', required: false })
  @ApiQuery({ name: 'customer_email', required: false })
  @ApiQuery({ name: 'id_number', required: false })
  @ApiQuery({ name: 'customer_id_number', required: false })
  @ApiQuery({ name: 'contact_number', required: false })
  @ApiQuery({ name: 'customer_status', required: false })
  @ApiResponse({ status: 200, schema: { example: { status: true, customers: [customerExample] } } })
  @ApiResponse({ status: 401, description: 'Invalid API key', schema: unauthorizedSchema })
  async list(
    @Query('id') id?: string,
    @Query('reference') reference?: string,
    @Query('email') email?: string,
    @Query('customer_email') customer_email?: string,
    @Query('id_number') id_number?: string,
    @Query('customer_id_number') customer_id_number?: string,
    @Query('contact_number') contact_number?: string,
    @Query('customer_status') customer_status?: string,
  ): Promise<{ status: boolean; customers: object[] }> {
    const customers = await this.service.findAll({
      id, reference, email, customer_email, id_number, customer_id_number, contact_number, customer_status,
    });
    return { status: true, customers };
  }

  @Post('create')
  @ApiOperation({ summary: 'Create one or more customers' })
  @ApiBody({
    schema: {
      example: {
        records: [{
          reference: 'REF-001',
          person_name: 'John',
          person_surname: 'Doe',
          client_type: 'RESIDENT_INDIVIDUAL',
          id_type: 'SOUTH_AFRICAN_ID',
          id_number: '8001015009087',
          email: 'john@example.com',
          contact_number: '+27821234567',
        }],
      },
    },
  })
  @ApiResponse({ status: 200, schema: { example: { status: true, customers: [customerExample] } } })
  @ApiResponse({ status: 400, description: 'Validation error', schema: validationErrorSchema })
  @ApiResponse({ status: 401, description: 'Invalid API key', schema: unauthorizedSchema })
  async create(@Body() body: { records: Record<string, string>[] }): Promise<{ status: boolean; customers: object[] }> {
    if (!body?.records || !Array.isArray(body.records) || body.records.length === 0) {
      throw new BadRequestException({ status: false, error_code: '002', error_message: 'records must be a non-empty array' });
    }
    for (const record of body.records) {
      for (const field of REQUIRED_CUSTOMER_FIELDS) {
        if (!record[field]) {
          throw new BadRequestException({ status: false, error_code: '002', error_message: `Field "${field}" is required` });
        }
      }
    }
    const customers = await this.service.createMany(body.records as never);
    return { status: true, customers };
  }
}
