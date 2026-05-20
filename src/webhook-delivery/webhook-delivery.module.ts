import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookDeliveryEntity } from '../database/entities/webhook-delivery.entity';
import { WebhookDeliveryService } from './webhook-delivery.service';

@Module({
  imports: [TypeOrmModule.forFeature([WebhookDeliveryEntity])],
  providers: [WebhookDeliveryService],
  exports: [WebhookDeliveryService],
})
export class WebhookDeliveryModule {}
