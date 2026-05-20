import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBasicAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BasicAuthGuard } from '../common/basic-auth.guard';
import { AvsService } from './avs.service';

@ApiTags('avs')
@ApiBasicAuth()
@UseGuards(BasicAuthGuard)
@Controller('avs-r')
export class AvsController {
  constructor(private readonly service: AvsService) {}

  @Post()
  @ApiOperation({ summary: 'AVS owner verification. Set AVS_FAIL_UNKNOWN=true to fail non-ABSA accounts.' })
  @ApiBody({
    schema: {
      example: {
        bank_account_number: '10004291601',
        bank_branch_code: '632005',
        bank_name: 'ABSA_BANK_LIMITED',
        bank_account_holder_name: 'JOHN DOE',
        id_number: '8001015009087',
        initials: 'J',
        surname: 'DOE',
      },
    },
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        results: [{ passed: true, id_number_match: true, initials_match: true, surname_match: true }],
      },
    },
  })
  @ApiResponse({ status: 401, schema: { example: { status: false, error_code: '001', error_message: 'Invalid API key provided.' } } })
  verify(@Body() body: {
    bank_account_number?: string;
    bank_branch_code?: number | string;
    bank_name?: string;
    bank_account_holder_name?: string;
    id_number?: string;
    initials?: string;
    surname?: string;
  }): { status: boolean; results: object[] } {
    return { status: true, results: [this.service.verify(body)] };
  }
}
