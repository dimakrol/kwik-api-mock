import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('payment_methods')
export class PaymentMethodEntity {
  @PrimaryColumn() id: string;
  @Column() payment_method_type: string;
  @Column() payment_industry: string;
  @Column() provider_bank: string;
  @Column() abbreviated_name: string;
  @Column({ type: 'text', default: '20000.00' }) item_limit: string;
  @Column({ type: 'text', default: '200000.00' }) monthly_limit: string;

  @Column({ type: 'text', nullable: true }) debicheck_allow_date_adjustment: string;
  @Column({ type: 'text', nullable: true }) debicheck_allow_variable_amount: string;
  @Column({ type: 'text', nullable: true }) debicheck_allow_payment_tracking: string;
  @Column({ nullable: true }) debicheck_payment_tracking_max_days: number;
  @Column({ type: 'text', nullable: true }) debicheck_adjustment_category: string;
  @Column({ type: 'text', nullable: true }) debicheck_adjustment_type: string;
  @Column({ type: 'text', nullable: true }) debicheck_adjustment_rate: string;
  @Column({ type: 'text', nullable: true }) debicheck_adjustment_amount: string;
  @Column({ type: 'text', nullable: true }) debicheck_approval_window: string;

  @Column({ type: 'text', nullable: true }) payments_bank_name: string;
  @Column({ nullable: true }) payments_bank_branch_code: number;
  @Column({ type: 'text', nullable: true }) payments_bank_account_number: string;
  @Column({ type: 'text', nullable: true }) payments_bank_account_type: string;
  @Column({ type: 'text', nullable: true }) payments_bank_account_holder_name: string;
}
