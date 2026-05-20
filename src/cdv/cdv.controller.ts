import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBasicAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BasicAuthGuard } from '../common/basic-auth.guard';
import { CdvService } from './cdv.service';

@ApiTags('cdv')
@ApiBasicAuth()
@UseGuards(BasicAuthGuard)
@Controller('cdv')
export class CdvController {
  constructor(private readonly service: CdvService) {}

  @Post()
  @ApiOperation({ summary: 'Validate bank account numbers (CDV check). Set CDV_FAIL_UNKNOWN=true to fail unknown accounts.' })
  @ApiBody({
    schema: {
      example: {
        records: [
          { bank_branch_code: '632005', bank_account_number: '10004291601', bank_account_type: 'CHEQUE_OR_CURRENT' },
        ],
      },
    },
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        results: [{
          passed: true,
          bank_branch_code: '632005',
          bank_account_number: '10004291601',
          bank_account_type: 'CHEQUE_OR_CURRENT',
          modified_bank_account_number: null,
          warning: null,
          error: null,
        }],
      },
    },
  })
  @ApiResponse({ status: 400, schema: { example: { status: false, error_code: '002', error_message: 'records must be a non-empty array' } } })
  @ApiResponse({ status: 401, schema: { example: { status: false, error_code: '001', error_message: 'Invalid API key provided.' } } })
  validate(
    @Body() body: { records?: Array<{ bank_branch_code: number | string; bank_account_number: string; bank_account_type: string }> },
  ): { status: boolean; results: object[] } {
    if (!body?.records || !Array.isArray(body.records) || body.records.length === 0) {
      throw new BadRequestException({ status: false, error_code: '002', error_message: 'records must be a non-empty array' });
    }
    const results = this.service.validate(body.records);
    return { status: true, results };
  }
}
