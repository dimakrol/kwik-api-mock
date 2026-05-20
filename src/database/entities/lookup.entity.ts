import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('lookups')
export class LookupEntity {
  @PrimaryColumn() id: string;
  @Column({ nullable: true }) payment_methods_id: string;
  @Column({ nullable: true }) parent_lookups_id: string;
  @Column() title: string;
  @Column() enum: string;
  @Column() type: string;
}
