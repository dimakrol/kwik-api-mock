import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('payments')
export class PaymentEntity {
  @PrimaryColumn() id: string;
  @Column({ nullable: true }) mandate_id: string;
  @Column() customers_id: string;
  @Column() bank_accounts_id: string;
  @Column() payment_methods_id: string;
  @Column({ type: 'text' }) amount: string;
  @Column({ nullable: true }) process_day: number;
  @Column({ nullable: true }) payment_interval: string;
  @Column({ nullable: true }) date_start: string;
  @Column({ nullable: true }) date_end: string;
  @Column({ nullable: true }) notify_url: string;
  @Column({ default: 'RUNNING' }) status: string;
  @CreateDateColumn() created_at: Date;
}
