import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MandateEntity } from '../database/entities/mandate.entity';
import { PaymentEntity } from '../database/entities/payment.entity';
import { WebhookDeliveryModule } from '../webhook-delivery/webhook-delivery.module';
import { MandatesController } from './mandates.controller';
import { MandatesService } from './mandates.service';

@Module({
  imports: [TypeOrmModule.forFeature([MandateEntity, PaymentEntity]), WebhookDeliveryModule],
  controllers: [MandatesController],
  providers: [MandatesService],
})
export class MandatesModule {}
