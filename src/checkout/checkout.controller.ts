import { BadRequestException, Body, Controller, Get, Header, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBasicAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { BasicAuthGuard } from '../common/basic-auth.guard';
import { CheckoutService } from './checkout.service';
import type { CheckoutSessionEntity } from '../database/entities/checkout-session.entity';

function buildCheckoutHtml(session: CheckoutSessionEntity): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Kwik Mock Checkout</title>
  <style>
    body{font-family:sans-serif;max-width:580px;margin:40px auto;padding:20px;color:#111}
    h1{color:#2563eb}
    .info{background:#f0f9ff;padding:16px;border-radius:8px;margin:16px 0;line-height:1.8}
    .actions{display:flex;gap:12px;margin-top:24px;flex-wrap:wrap}
    button{padding:10px 20px;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600}
    .btn-complete{background:#16a34a;color:#fff}
    .btn-fail{background:#dc2626;color:#fff}
    .btn-save{background:#2563eb;color:#fff}
    button:hover{opacity:.85}
    #result{margin-top:20px;padding:14px;background:#f5f5f5;border-radius:6px;white-space:pre-wrap;font-family:monospace;display:none}
    .badge{display:inline-block;padding:2px 10px;border-radius:99px;font-size:12px;font-weight:700}
    .PENDING{background:#fef9c3;color:#854d0e}
    .COMPLETED{background:#dcfce7;color:#14532d}
    .FAILED{background:#fee2e2;color:#7f1d1d}
    .CARD_SAVED{background:#dbeafe;color:#1e3a8a}
  </style>
</head>
<body>
  <h1>Kwik Mock Checkout</h1>
  <div class="info">
    <strong>Session&nbsp;ID:</strong> ${session.id}<br>
    <strong>Customer:</strong> ${session.customers_id ?? 'N/A'}<br>
    <strong>Amount:</strong> R${session.amount}<br>
    <strong>Mode:</strong> ${session.mode}<br>
    <strong>Status:</strong> <span id="status-badge" class="badge ${session.status}">${session.status}</span>
  </div>
  <p>This is a <strong>mock</strong> checkout page. Select an action to simulate the payment outcome:</p>
  <div class="actions">
    <button class="btn-complete" onclick="doAction('complete')">✓ Complete Payment</button>
    <button class="btn-fail" onclick="doAction('fail')">✗ Fail Payment</button>
    <button class="btn-save" onclick="doAction('save-card')">💳 Save Card Only</button>
  </div>
  <div id="result"></div>
  <script>
    async function doAction(action) {
      const el = document.getElementById('result');
      el.style.display = 'block';
      el.textContent = 'Processing...';
      try {
        const r = await fetch('/checkout/${session.id}/' + action, {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
        const d = await r.json();
        el.textContent = JSON.stringify(d, null, 2);
        if (d.status) {
          const b = document.getElementById('status-badge');
          if (b) { b.textContent = d.status; b.className = 'badge ' + d.status; }
        }
      } catch(e) { el.textContent = 'Error: ' + e.message; }
    }
  </script>
</body>
</html>`;
}

@ApiTags('checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly service: CheckoutService) {}

  @Post('page')
  @ApiBasicAuth()
  @UseGuards(BasicAuthGuard)
  @ApiOperation({ summary: 'Create a hosted checkout page session' })
  @ApiBody({
    schema: {
      example: {
        customers_id: 'cus_xxx',
        amount: '150.00',
        mode: 'ONE_TIME',
        notify_url: 'http://localhost:3001/webhook/kwik/company-uuid',
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Checkout session created',
    schema: {
      example: {
        status: true,
        checkout: { id: 'cho_xxx', page_url: 'http://localhost:3099/checkout/cho_xxx', mode: 'ONE_TIME', amount: '150.00', status: 'PENDING' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error', schema: { example: { status: false, error_code: '002', error_message: 'amount is required' } } })
  @ApiResponse({ status: 401, description: 'Invalid API key', schema: { example: { status: false, error_code: '001', error_message: 'Invalid API key provided.' } } })
  async createPage(
    @Body() body: { customers_id?: string; amount: string; mode: string; notify_url?: string },
  ): Promise<{ status: boolean; checkout: object }> {
    if (!body?.amount) {
      throw new BadRequestException({ status: false, error_code: '002', error_message: 'amount is required' });
    }
    if (!body?.mode) {
      throw new BadRequestException({ status: false, error_code: '002', error_message: 'mode is required' });
    }
    const checkout = await this.service.createPage(body);
    return { status: true, checkout };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Checkout page UI — HTML test interface', tags: ['checkout-ui'] } as never)
  @ApiParam({ name: 'id', description: 'Checkout session ID' })
  async getPage(@Param('id') id: string, @Res() res: Response): Promise<void> {
    try {
      const session = await this.service.getSession(id);
      res.type('html').send(buildCheckoutHtml(session));
    } catch {
      res.status(404).type('html').send('<h1>Checkout session not found</h1><p>The session ID does not exist or has expired.</p>');
    }
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Complete a checkout session and fire CHECKOUT_COMPLETED webhook', tags: ['checkout-ui'] } as never)
  @ApiParam({ name: 'id', description: 'Checkout session ID' })
  @ApiResponse({ status: 200, schema: { example: { id: 'cho_xxx', status: 'COMPLETED', card_id: 'card_xxx' } } })
  async completeSession(
    @Param('id') id: string,
    @Body() body?: { card_id?: string },
  ): Promise<object> {
    return this.service.completeSession(id, body?.card_id);
  }

  @Post(':id/fail')
  @ApiOperation({ summary: 'Fail a checkout session and fire CHECKOUT_COMPLETED webhook with FAILED status', tags: ['checkout-ui'] } as never)
  @ApiParam({ name: 'id', description: 'Checkout session ID' })
  @ApiResponse({ status: 200, schema: { example: { id: 'cho_xxx', status: 'FAILED' } } })
  async failSession(@Param('id') id: string): Promise<object> {
    return this.service.failSession(id);
  }

  @Post(':id/save-card')
  @ApiOperation({ summary: 'Save card for a checkout session and fire CHECKOUT_COMPLETED webhook', tags: ['checkout-ui'] } as never)
  @ApiParam({ name: 'id', description: 'Checkout session ID' })
  @ApiResponse({ status: 200, schema: { example: { id: 'cho_xxx', status: 'CARD_SAVED', card_id: 'card_xxx' } } })
  async saveCardSession(@Param('id') id: string): Promise<object> {
    return this.service.saveCardSession(id);
  }
}
