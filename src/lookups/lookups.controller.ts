import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBasicAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BasicAuthGuard } from '../common/basic-auth.guard';
import { LookupsService } from './lookups.service';

const lookupsResponseSchema = {
  example: {
    status: true,
    lookups: [
      {
        id: 'loo_abc',
        parent_lookups_id: null,
        title: 'ABSA BANK LIMITED',
        enum: 'ABSA_BANK_LIMITED',
        type: 'bank_name',
      },
    ],
  },
};

@ApiTags('lookups')
@ApiBasicAuth()
@UseGuards(BasicAuthGuard)
@Controller('lookups')
export class LookupsController {
  constructor(private readonly service: LookupsService) {}

  @Get(':type/:payment_methods_id')
  @ApiOperation({ summary: 'Get lookups by type and payment method' })
  @ApiParam({ name: 'type', example: 'bank_name' })
  @ApiParam({ name: 'payment_methods_id', example: 'pam_debicheck_absa' })
  @ApiResponse({
    status: 200,
    description: 'Lookups filtered by type and payment method',
    schema: lookupsResponseSchema,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid API key',
    schema: {
      example: { status: false, error_code: '001', error_message: 'Invalid API key provided.' },
    },
  })
  async findByTypeAndMethod(
    @Param('type') type: string,
    @Param('payment_methods_id') paymentMethodsId: string,
  ): Promise<{ status: boolean; lookups: object[] }> {
    const lookups = await this.service.findByTypeAndMethod(type, paymentMethodsId);
    return { status: true, lookups };
  }

  @Get(':type')
  @ApiOperation({ summary: 'Get all lookups by type' })
  @ApiParam({ name: 'type', example: 'bank_name' })
  @ApiResponse({
    status: 200,
    description: 'Lookups filtered by type',
    schema: lookupsResponseSchema,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid API key',
    schema: {
      example: { status: false, error_code: '001', error_message: 'Invalid API key provided.' },
    },
  })
  async findByType(
    @Param('type') type: string,
  ): Promise<{ status: boolean; lookups: object[] }> {
    const lookups = await this.service.findByTypeAndMethod(type);
    return { status: true, lookups };
  }
}
