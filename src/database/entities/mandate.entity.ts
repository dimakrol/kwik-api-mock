import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('mandates')
export class MandateEntity {
  @PrimaryColumn() id: string;
  @Column({ nullable: true }) payments_id: string;
  @Column() customers_id: string;
  @Column() bank_accounts_id: string;
  @Column({ default: 'PENDING' }) status: string;
  @Column({ nullable: true }) cancel_reason: string;
  @CreateDateColumn() created_at: Date;
}
