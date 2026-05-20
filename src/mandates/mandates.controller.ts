import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBasicAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BasicAuthGuard } from '../common/basic-auth.guard';
import { MandatesService } from './mandates.service';

const unauthorizedSchema = { example: { status: false, error_code: '001', error_message: 'Invalid API key provided.' } };
const validationErrorSchema = { example: { status: false, error_code: '002', error_message: 'Readable validation message' } };

@ApiTags('mandates')
@ApiBasicAuth()
@UseGuards(BasicAuthGuard)
@Controller('mandates')
export class MandatesController {
  constructor(private readonly service: MandatesService) {}

  @Post('debicheck/update/cancel')
  @ApiOperation({ summary: 'Cancel a DebiCheck mandate and send MANDATE_UPDATED webhook' })
  @ApiBody({
    schema: {
      example: {
        mandate_id: 'man_xxx',
        cancel_reason: 'CONTRACT_EXPIRED',
      },
    },
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        mandate: { id: 'man_xxx', status: 'CANCELLED', cancel_reason: 'CONTRACT_EXPIRED' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error', schema: validationErrorSchema })
  @ApiResponse({ status: 401, description: 'Invalid API key', schema: unauthorizedSchema })
  @ApiResponse({ status: 404, description: 'Mandate not found' })
  async cancelDebicheck(
    @Body() body: { records?: Array<{ id: string; cancel_reason: string }>; mandate_id?: string; cancel_reason?: string },
  ): Promise<{ status: boolean; results: object[] }> {
    const records = Array.isArray(body?.records) && body.records.length > 0
      ? body.records
      : [{ id: body?.mandate_id ?? '', cancel_reason: body?.cancel_reason ?? '' }];
    const results: object[] = [];
    for (const record of records) {
      if (!record.id) {
        throw new BadRequestException({ status: false, error_code: '002', error_message: 'id is required' });
      }
      if (!record.cancel_reason) {
        throw new BadRequestException({ status: false, error_code: '002', error_message: 'cancel_reason is required' });
      }
      results.push(await this.service.cancelDebicheck(record.id, record.cancel_reason));
    }
    return { status: true, results };
  }
}
