import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethodEntity } from '../database/entities/payment-method.entity';
import { LookupEntity } from '../database/entities/lookup.entity';
import { CustomerEntity } from '../database/entities/customer.entity';

const PAYMENT_METHODS: Partial<PaymentMethodEntity>[] = [
  {
    id: 'pam_debicheck_absa',
    payment_method_type: 'DEBICHECK',
    payment_industry: 'ACCOUNT_REPAYMENT',
    provider_bank: 'ABSA_BANK_LIMITED',
    abbreviated_name: 'KWIK PAY',
    item_limit: '20000.00',
    monthly_limit: '200000.00',
    debicheck_allow_date_adjustment: 'true',
    debicheck_allow_variable_amount: 'false',
    debicheck_allow_payment_tracking: 'true',
    debicheck_payment_tracking_max_days: 2,
    debicheck_adjustment_category: 'ANNUALLY',
    debicheck_adjustment_type: 'RATE',
    debicheck_adjustment_rate: '5.12345',
    debicheck_adjustment_amount: '0.00',
    debicheck_approval_window: 'BATCH_TT2_APPROVE_BY_19H00_ON_DAY_2',
    payments_bank_name: 'ABSA_BANK_LIMITED',
    payments_bank_branch_code: 632005,
    payments_bank_account_number: '1201303338',
    payments_bank_account_type: 'CHEQUE_OR_CURRENT',
    payments_bank_account_holder_name: 'J DOE',
  },
  {
    id: 'pam_eft_absa',
    payment_method_type: 'DEBIT_ORDER',
    payment_industry: 'ACCOUNT_REPAYMENT',
    provider_bank: 'ABSA_BANK_LIMITED',
    abbreviated_name: 'KWIK EFT',
    item_limit: '20000.00',
    monthly_limit: '200000.00',
  },
];

interface BankDef {
  enum: string;
  title: string;
  branch_code: number;
}

const BANKS: BankDef[] = [
  { enum: 'ABSA_BANK_LIMITED', title: 'ABSA Bank Limited', branch_code: 632005 },
  { enum: 'STANDARD_BANK', title: 'Standard Bank', branch_code: 51001 },
  { enum: 'FNB', title: 'First National Bank (FNB)', branch_code: 250655 },
  { enum: 'NEDBANK', title: 'Nedbank', branch_code: 198765 },
];

const PAM_IDS = ['pam_debicheck_absa', 'pam_eft_absa'];

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(PaymentMethodEntity)
    private readonly paymentMethodRepo: Repository<PaymentMethodEntity>,
    @InjectRepository(LookupEntity)
    private readonly lookupRepo: Repository<LookupEntity>,
    @InjectRepository(CustomerEntity)
    private readonly customerRepo: Repository<CustomerEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seed();
  }

  async seed(): Promise<void> {
    await this.seedPaymentMethods();
    await this.seedLookups();
    await this.seedTestCustomer();
    this.logger.log('Seed complete');
  }

  private async seedPaymentMethods(): Promise<void> {
    for (const pm of PAYMENT_METHODS) {
      const exists = await this.paymentMethodRepo.findOne({ where: { id: pm.id } });
      if (!exists) {
        await this.paymentMethodRepo.save(this.paymentMethodRepo.create(pm));
        this.logger.log(`Seeded payment method: ${pm.id}`);
      }
    }
  }

  private async seedLookups(): Promise<void> {
    for (const pamId of PAM_IDS) {
      for (const bank of BANKS) {
        const id = `loo_${bank.enum.toLowerCase()}_${pamId}`;
        const exists = await this.lookupRepo.findOne({ where: { id } });
        if (!exists) {
          await this.lookupRepo.save(
            this.lookupRepo.create({
              id,
              payment_methods_id: pamId,
              parent_lookups_id: null,
              title: bank.title,
              enum: bank.enum,
              type: 'bank_name',
            }),
          );
          this.logger.log(`Seeded lookup: ${id}`);
        }
      }
    }
  }

  private async seedTestCustomer(): Promise<void> {
    const exists = await this.customerRepo.findOne({ where: { id: 'cus_test_001' } });
    if (!exists) {
      await this.customerRepo.save(
        this.customerRepo.create({
          id: 'cus_test_001',
          reference: 'TEST-001',
          person_name: 'MRS YANDI',
          person_surname: 'DEED',
          client_type: 'RESIDENT_INDIVIDUAL',
          id_type: 'SOUTH_AFRICAN_ID',
          id_number: '8411180614084',
          email: 'NAREN.AKHRU@TEST.COM',
          contact_number: '+27627489042',
          customer_status: 'ACTIVE',
        }),
      );
      this.logger.log('Seeded test customer: cus_test_001');
    }
  }
}
