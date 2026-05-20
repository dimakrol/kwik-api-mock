import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('checkout_sessions')
export class CheckoutSessionEntity {
  @PrimaryColumn() id: string;
  @Column({ nullable: true }) customers_id: string;
  @Column({ type: 'text' }) amount: string;
  @Column() mode: string;
  @Column() page_url: string;
  @Column({ nullable: true }) notify_url: string;
  @Column({ nullable: true }) card_id: string;
  @Column({ default: 'PENDING' }) status: string;
  @CreateDateColumn() created_at: Date;
}
