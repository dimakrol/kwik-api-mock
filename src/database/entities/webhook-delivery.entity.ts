import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('webhook_deliveries')
export class WebhookDeliveryEntity {
  @PrimaryColumn() id: string;
  @Column({ nullable: true }) event_id: string;
  @Column() event_type: string;
  @Column() target_url: string;
  @Column({ type: 'text' }) request_body: string;
  @Column({ type: 'text', nullable: true }) request_headers: string;
  @Column({ default: 0 }) response_status: number;
  @Column({ type: 'text', nullable: true }) response_body: string;
  @Column({ default: false }) success: boolean;
  @Column({ nullable: true }) error: string;
  @CreateDateColumn() created_at: Date;
}
