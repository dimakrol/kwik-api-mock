import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBasicAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BasicAuthGuard } from '../common/basic-auth.guard';
import { PaymentMethodsService } from './payment-methods.service';

@ApiTags('payment-methods')
@ApiBasicAuth()
@UseGuards(BasicAuthGuard)
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly service: PaymentMethodsService) {}

  @Get()
  @ApiOperation({ summary: 'List all available payment methods' })
  @ApiResponse({
    status: 200,
    description: 'List of configured payment methods',
    schema: {
      example: {
        status: true,
        payment_methods: [
          {
            id: 'pam_debicheck_absa',
            payment_method_type: 'DEBICHECK',
            payment_industry: 'ACCOUNT_REPAYMENT',
            provider_bank: 'ABSA_BANK_LIMITED',
            abbreviated_name: 'KWIK PAY',
            item_limit: '20000.00',
            monthly_limit: '200000.00',
            debicheck: {
              allow_date_adjustment: true,
              allow_variable_amount: false,
              allow_payment_tracking: true,
              payment_tracking_max_days: 2,
              adjustment_category: 'ANNUALLY',
              adjustment_type: 'RATE',
              adjustment_rate: '5.12345',
              adjustment_amount: '0.00',
              approval_window: 'BATCH_TT2_APPROVE_BY_19H00_ON_DAY_2',
            },
            payments: {
              bank_name: 'ABSA_BANK_LIMITED',
              bank_branch_code: 632005,
              bank_account_number: '1201303338',
              bank_account_type: 'CHEQUE_OR_CURRENT',
              bank_account_holder_name: 'J DOE',
            },
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid API key',
    schema: {
      example: { status: false, error_code: '001', error_message: 'Invalid API key provided.' },
    },
  })
  async findAll(): Promise<{ status: boolean; payment_methods: object[] }> {
    const payment_methods = await this.service.findAll();
    return { status: true, payment_methods };
  }
}
