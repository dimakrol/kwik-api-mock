import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentEntity } from '../database/entities/payment.entity';
import { MandateEntity } from '../database/entities/mandate.entity';
import { WebhookDeliveryModule } from '../webhook-delivery/webhook-delivery.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentEntity, MandateEntity]), WebhookDeliveryModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
