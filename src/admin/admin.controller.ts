import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Post('webhook/fire')
  @ApiOperation({ summary: 'Fire a webhook to a target URL (no auth required)' })
  @ApiBody({
    schema: {
      examples: {
        mandate_updated: {
          value: {
            target_url: 'http://localhost:3001/webhook/kwik/company-uuid',
            event_type: 'MANDATE_UPDATED',
            payload: { kwik_mandate_id: 'man_xxx', kwik_customer_id: 'cus_xxx', status: 'ACCEPTED', amount: '500.00' },
            auth: { access_key: 'test_key', access_secret: 'test_secret' },
          },
        },
        payment_status: {
          value: {
            target_url: 'http://localhost:3001/webhook/kwik/company-uuid',
            event_type: 'PAYMENT_STATUS',
            payload: { kwik_payment_id: 'pay_xxx', kwik_customer_id: 'cus_xxx', payment_status: 'PAID', amount: '500.00' },
            auth: { access_key: 'test_key', access_secret: 'test_secret' },
          },
        },
        checkout_completed: {
          value: {
            target_url: 'http://localhost:3001/webhook/kwik/company-uuid',
            event_type: 'CHECKOUT_COMPLETED',
            payload: { checkout_id: 'cho_xxx', kwik_customer_id: 'cus_xxx', card_id: 'card_xxx', payment_status: 'PAID' },
            auth: { access_key: 'test_key', access_secret: 'test_secret' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook fired and delivery recorded',
    schema: { example: { ok: true, delivery_id: 'wdl_xxx', status: 200, body: {} } },
  })
  async fireWebhook(
    @Body()
    body: {
      target_url: string;
      event_type: string;
      payload: Record<string, unknown>;
      auth?: {
        access_key?: string;
        access_secret?: string;
        auth_mode?: string;
        hmac_secret?: string;
      };
    },
  ): Promise<object> {
    return this.service.fireWebhook(body);
  }

  @Post('webhook/replay/:deliveryId')
  @ApiOperation({ summary: 'Replay a previously stored webhook delivery' })
  @ApiParam({ name: 'deliveryId', description: 'Webhook delivery ID (wdl_xxx)' })
  @ApiResponse({ status: 200, description: 'Webhook replayed', schema: { example: { ok: true, delivery_id: 'wdl_xxx', status: 200 } } })
  async replayWebhook(@Param('deliveryId') deliveryId: string): Promise<object> {
    return this.service.replayWebhook(deliveryId);
  }

  @Post('payments/:paymentsId/complete')
  @ApiOperation({ summary: 'Finish a payment (PAID) and deliver PAYMENT_STATUS webhook (no Basic auth)' })
  @ApiParam({ name: 'paymentsId', description: 'Payment ID (pay_xxx)' })
  @ApiResponse({ status: 200, schema: { example: { ok: true, payments: { id: 'pay_xxx', status: 'PAID' } } } })
  async completePayment(
    @Param('paymentsId') paymentsId: string,
    @Body() body: { company_uuid?: string } = {},
  ): Promise<object> {
    return this.service.completePayment(paymentsId, body);
  }

  @Delete('records/:resource')
  @ApiOperation({ summary: 'Delete multiple records from the mock database' })
  @ApiParam({ name: 'resource', description: 'Table key: payment_methods, lookups, customers, …' })
  @ApiBody({
    schema: {
      example: { ids: ['pay_abc', 'pay_def'] },
      required: ['ids'],
      properties: { ids: { type: 'array', items: { type: 'string' } } },
    },
  })
  @ApiResponse({
    status: 200,
    schema: { example: { ok: true, resource: 'payments', deleted: ['pay_abc'], notFound: [] } },
  })
  async deleteRecords(
    @Param('resource') resource: string,
    @Body() body: { ids: string[] },
  ): Promise<object> {
    return this.service.deleteRecords(resource, body?.ids ?? []);
  }

  @Delete('records/:resource/:id')
  @ApiOperation({ summary: 'Delete a single record from the mock database' })
  @ApiParam({ name: 'resource', description: 'Table key: payment_methods, lookups, customers, …' })
  @ApiParam({ name: 'id', description: 'Primary key (e.g. pay_xxx, cus_xxx)' })
  @ApiResponse({ status: 200, schema: { example: { ok: true, resource: 'payments', id: 'pay_xxx' } } })
  @ApiResponse({ status: 404, description: 'Record not found' })
  async deleteRecord(
    @Param('resource') resource: string,
    @Param('id') id: string,
  ): Promise<object> {
    return this.service.deleteRecord(resource, id);
  }

  @Get('data')
  @ApiOperation({ summary: 'Dump all database data and scenario config' })
  @ApiResponse({
    status: 200,
    description: 'All data including webhook delivery history and scenario',
    schema: {
      example: {
        payment_methods: [], lookups: [], customers: [], bank_accounts: [],
        payments: [], mandates: [], checkout_sessions: [], webhook_deliveries: [],
        scenario: { authMode: 'loose', cdvFailUnknown: false },
      },
    },
  })
  async getData(): Promise<object> {
    return this.service.getAllData();
  }

  @Get('interface-data')
  @ApiOperation({ summary: 'Aggregate dashboard payload: { data, summary } for the web interface' })
  @ApiResponse({
    status: 200,
    description: 'All data plus summary counts for the dashboard',
    schema: {
      example: {
        data: {
          payment_methods: [], lookups: [], customers: [], bank_accounts: [],
          payments: [], mandates: [], checkout_sessions: [], webhook_deliveries: [],
          scenario: {},
        },
        summary: {
          payment_methods: 0, lookups: 0, customers: 0, bank_accounts: 0,
          payments: 0, mandates: 0, checkout_sessions: 0,
          webhook_deliveries: 0, webhook_success: 0, webhook_failed: 0,
        },
      },
    },
  })
  async getInterfaceData(): Promise<object> {
    return this.service.getInterfaceData();
  }

  @Delete('reset')
  @ApiOperation({ summary: 'Reset transactional data. Use ?all=true to clear everything and re-seed.' })
  @ApiQuery({ name: 'all', required: false, type: Boolean, description: 'If true, clears all data including seed and re-runs seed' })
  @ApiResponse({ status: 200, schema: { example: { ok: true, message: 'Data reset. Seed data preserved.' } } })
  async reset(@Query('all') all?: string): Promise<{ ok: boolean; message: string }> {
    const clearAll = all === 'true' || all === '1';
    await this.service.resetData(clearAll);
    const message = clearAll ? 'All data cleared and re-seeded.' : 'Data reset. Seed data preserved.';
    return { ok: true, message };
  }

  @Post('seed')
  @ApiOperation({ summary: 'Re-run seed data' })
  @ApiResponse({ status: 200, schema: { example: { ok: true } } })
  async seed(): Promise<{ ok: boolean }> {
    await this.service.runSeed();
    return { ok: true };
  }

  @Get('scenario')
  @ApiOperation({ summary: 'Get current runtime scenario flags' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        authMode: 'loose',
        cdvFailUnknown: false,
        avsFailUnknown: false,
        defaultNotifyUrl: null,
        webhookAuthMode: 'basic',
        webhookAccessKey: 'test_key',
        webhookAccessSecret: 'test_secret',
      },
    },
  })
  getScenario(): object {
    return this.service.getScenario();
  }

  @Post('scenario')
  @ApiOperation({ summary: 'Update runtime scenario flags without restart' })
  @ApiBody({
    schema: {
      example: {
        authMode: 'strict',
        cdvFailUnknown: true,
        avsFailUnknown: false,
        defaultNotifyUrl: 'http://localhost:3005/v1/webhook/kwik/{companyUuid}',
        webhookAuthMode: 'basic',
        webhookAccessKey: 'test_key',
        webhookAccessSecret: 'test_secret',
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Updated scenario flags' })
  updateScenario(@Body() body: Record<string, unknown>): object {
    return this.service.updateScenario(body);
  }
}
