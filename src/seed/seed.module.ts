import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentMethodEntity } from '../database/entities/payment-method.entity';
import { LookupEntity } from '../database/entities/lookup.entity';
import { CustomerEntity } from '../database/entities/customer.entity';
import { SeedService } from './seed.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PaymentMethodEntity, LookupEntity, CustomerEntity])],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
