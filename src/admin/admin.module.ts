import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentMethodEntity } from '../database/entities/payment-method.entity';
import { LookupEntity } from '../database/entities/lookup.entity';
import { CustomerEntity } from '../database/entities/customer.entity';
import { BankAccountEntity } from '../database/entities/bank-account.entity';
import { PaymentEntity } from '../database/entities/payment.entity';
import { MandateEntity } from '../database/entities/mandate.entity';
import { CheckoutSessionEntity } from '../database/entities/checkout-session.entity';
import { WebhookDeliveryModule } from '../webhook-delivery/webhook-delivery.module';
import { PaymentsModule } from '../payments/payments.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    PaymentsModule,
    TypeOrmModule.forFeature([
      PaymentMethodEntity,
      LookupEntity,
      CustomerEntity,
      BankAccountEntity,
      PaymentEntity,
      MandateEntity,
      CheckoutSessionEntity,
    ]),
    WebhookDeliveryModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
