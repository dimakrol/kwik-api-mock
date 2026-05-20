import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppLoggingModule } from './common/logging/logging.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentMethodEntity } from './database/entities/payment-method.entity';
import { LookupEntity } from './database/entities/lookup.entity';
import { CustomerEntity } from './database/entities/customer.entity';
import { BankAccountEntity } from './database/entities/bank-account.entity';
import { PaymentEntity } from './database/entities/payment.entity';
import { MandateEntity } from './database/entities/mandate.entity';
import { CheckoutSessionEntity } from './database/entities/checkout-session.entity';
import { WebhookDeliveryEntity } from './database/entities/webhook-delivery.entity';
import { SeedModule } from './seed/seed.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { LookupsModule } from './lookups/lookups.module';
import { CdvModule } from './cdv/cdv.module';
import { AvsModule } from './avs/avs.module';
import { CustomersModule } from './customers/customers.module';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module';
import { PaymentsModule } from './payments/payments.module';
import { CheckoutModule } from './checkout/checkout.module';
import { MandatesModule } from './mandates/mandates.module';
import { AdminModule } from './admin/admin.module';
import { InterfaceModule } from './interface/interface.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AppLoggingModule,
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'kwik-mock.sqlite',
      synchronize: true,
      entities: [
        PaymentMethodEntity,
        LookupEntity,
        CustomerEntity,
        BankAccountEntity,
        PaymentEntity,
        MandateEntity,
        CheckoutSessionEntity,
        WebhookDeliveryEntity,
      ],
    }),
    SeedModule,
    PaymentMethodsModule,
    LookupsModule,
    CdvModule,
    AvsModule,
    CustomersModule,
    BankAccountsModule,
    PaymentsModule,
    CheckoutModule,
    MandatesModule,
    AdminModule,
    InterfaceModule,
  ],
})
export class AppModule {}
