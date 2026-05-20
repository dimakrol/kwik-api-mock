import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethodEntity } from '../database/entities/payment-method.entity';

@Injectable()
export class PaymentMethodsService {
  constructor(
    @InjectRepository(PaymentMethodEntity)
    private readonly repo: Repository<PaymentMethodEntity>,
  ) {}

  async findAll(): Promise<object[]> {
    const entities = await this.repo.find();
    return entities.map((e) => this.toResponse(e));
  }

  private toResponse(e: PaymentMethodEntity): object {
    const result: Record<string, unknown> = {
      id: e.id,
      payment_method_type: e.payment_method_type,
      payment_industry: e.payment_industry,
      provider_bank: e.provider_bank,
      abbreviated_name: e.abbreviated_name,
      item_limit: e.item_limit,
      monthly_limit: e.monthly_limit,
    };

    const hasDebicheck =
      e.debicheck_allow_date_adjustment != null ||
      e.debicheck_allow_variable_amount != null ||
      e.debicheck_allow_payment_tracking != null;

    if (hasDebicheck) {
      result.debicheck = {
        allow_date_adjustment: e.debicheck_allow_date_adjustment === 'true',
        allow_variable_amount: e.debicheck_allow_variable_amount === 'true',
        allow_payment_tracking: e.debicheck_allow_payment_tracking === 'true',
        payment_tracking_max_days: e.debicheck_payment_tracking_max_days ?? null,
        adjustment_category: e.debicheck_adjustment_category ?? null,
        adjustment_type: e.debicheck_adjustment_type ?? null,
        adjustment_rate: e.debicheck_adjustment_rate ?? null,
        adjustment_amount: e.debicheck_adjustment_amount ?? null,
        approval_window: e.debicheck_approval_window ?? null,
      };
    }

    const hasPayments =
      e.payments_bank_name != null ||
      e.payments_bank_account_number != null;

    if (hasPayments) {
      result.payments = {
        bank_name: e.payments_bank_name ?? null,
        bank_branch_code: e.payments_bank_branch_code ?? null,
        bank_account_number: e.payments_bank_account_number ?? null,
        bank_account_type: e.payments_bank_account_type ?? null,
        bank_account_holder_name: e.payments_bank_account_holder_name ?? null,
      };
    }

    return result;
  }
}
