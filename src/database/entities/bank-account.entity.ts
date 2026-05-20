import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('bank_accounts')
export class BankAccountEntity {
  @PrimaryColumn() id: string;
  @Column() customers_id: string;
  @Column() bank_account_holder_name: string;
  @Column() bank_account_number: string;
  @Column() bank_account_type: string;
  @Column() bank_name: string;
  @Column() bank_branch_code: string;
  @Column() reference: string;
  @Column({ default: 'ACTIVE' }) status: string;
  @CreateDateColumn() created_at: Date;
}
