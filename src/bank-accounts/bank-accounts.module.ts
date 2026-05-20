import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankAccountEntity } from '../database/entities/bank-account.entity';
import { BankAccountsController } from './bank-accounts.controller';
import { BankAccountsService } from './bank-accounts.service';

@Module({
  imports: [TypeOrmModule.forFeature([BankAccountEntity])],
  controllers: [BankAccountsController],
  providers: [BankAccountsService],
})
export class BankAccountsModule {}
