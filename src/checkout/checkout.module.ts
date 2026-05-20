import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CheckoutSessionEntity } from '../database/entities/checkout-session.entity';
import { WebhookDeliveryModule } from '../webhook-delivery/webhook-delivery.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

@Module({
  imports: [TypeOrmModule.forFeature([CheckoutSessionEntity]), WebhookDeliveryModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
