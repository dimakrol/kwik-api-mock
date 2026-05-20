import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('customers')
export class CustomerEntity {
  @PrimaryColumn() id: string;
  @Column() reference: string;
  @Column() person_name: string;
  @Column() person_surname: string;
  @Column() client_type: string;
  @Column() id_type: string;
  @Column() id_number: string;
  @Column() email: string;
  @Column() contact_number: string;
  @Column({ default: 'ACTIVE' }) customer_status: string;
  @CreateDateColumn() created_at: Date;
}
