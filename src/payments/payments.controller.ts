import { BadRequestException, Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBasicAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BasicAuthGuard } from '../common/basic-auth.guard';
import { PaymentsService } from './payments.service';

const VALID_STATUSES = ['RUNNING', 'STOPPED', 'PAUSED', 'CANCELLED', 'PAID', 'FAILED', 'REVERSED'];
const unauthorizedSchema = { example: { status: false, error_code: '001', error_message: 'Invalid API key provided.' } };
const validationErrorSchema = { example: { status: false, error_code: '002', error_message: 'Readable validation message' } };

@ApiTags('payments')
@ApiBasicAuth()
@UseGuards(BasicAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Post('submit')
  @ApiOperation({ summary: 'Submit a new payment and create a mandate' })
  @ApiBody({
    schema: {
      example: {
        customers_id: 'cus_test_001',
        bank_accounts_id: 'bac_xxx',
        payment_methods_id: 'pam_debicheck_absa',
        amount: '500.00',
        process_day: 1,
        payment_interval: 'MONTHLY',
        date_start: '2026-01-01',
        date_end: '2027-01-01',
        notify_url: 'http://localhost:3001/webhook/kwik/company-uuid',
      },
    },
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        payments: {
          id: 'pay_xxx', mandate_id: 'man_xxx', customers_id: 'cus_xxx',
          bank_accounts_id: 'bac_xxx', payment_methods_id: 'pam_debicheck_absa',
          amount: '500.00', process_day: 1, payment_interval: 'MONTHLY',
          date_start: '2026-01-01', date_end: '2027-01-01', status: 'RUNNING',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error', schema: validationErrorSchema })
  @ApiResponse({ status: 401, description: 'Invalid API key', schema: unauthorizedSchema })
  async submit(
    @Body()
    body: {
      customers_id: string;
      bank_accounts_id: string;
      payment_methods_id: string;
      amount: string;
      process_day?: number;
      payment_interval?: string;
      date_start?: string;
      date_end?: string;
      notify_url?: string;
      webhook_url?: string;
      callback_url?: string;
    },
  ): Promise<{ status: boolean; payments: object }> {
    const payments = await this.service.submit(body);
    return { status: true, payments };
  }

  @Post('status/:paymentsId/:status')
  @ApiOperation({ summary: 'Update the status of a payment' })
  @ApiParam({ name: 'paymentsId', description: 'Payment ID (pay_xxx)' })
  @ApiParam({ name: 'status', enum: VALID_STATUSES, description: 'New payment status' })
  @ApiResponse({
    status: 200,
    schema: { example: { status: true, payments: { id: 'pay_xxx', status: 'PAID' } } },
  })
  @ApiResponse({ status: 400, description: 'Invalid status', schema: validationErrorSchema })
  @ApiResponse({ status: 401, description: 'Invalid API key', schema: unauthorizedSchema })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async updateStatus(
    @Param('paymentsId') paymentsId: string,
    @Param('status') status: string,
  ): Promise<{ status: boolean; payments: object }> {
    if (!VALID_STATUSES.includes(status)) {
      throw new BadRequestException({
        status: false,
        error_code: '002',
        error_message: `Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }
    const payments = await this.service.updateStatus(paymentsId, status);
    return { status: true, payments };
  }
}
