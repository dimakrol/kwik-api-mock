import { Injectable } from '@nestjs/common';
import { mockConfig } from '../common/mock-config';

interface AvsPayload {
  customer?: {
    id_number?: string;
    person_name?: string;
    person_surname?: string;
  };
  bank_account?: {
    bank_account_number?: string;
    bank_branch_code?: number | string;
    bank_name?: string;
  };
  bank_account_number?: string;
  bank_branch_code?: number | string;
  bank_name?: string;
  bank_account_holder_name?: string;
  id_number?: string;
  initials?: string;
  surname?: string;
}

@Injectable()
export class AvsService {
  verify(payload: AvsPayload = {}): object {
    const failUnknown = mockConfig.avsFailUnknown;

    if (failUnknown) {
      const bankAccount = payload.bank_account ?? {};
      const branchCode =
        typeof (bankAccount.bank_branch_code ?? payload.bank_branch_code) === 'string'
          ? parseInt(String(bankAccount.bank_branch_code ?? payload.bank_branch_code), 10)
          : bankAccount.bank_branch_code ?? payload.bank_branch_code;
      const passed = branchCode === 632005;
      return {
        passed,
        id_number_match: passed,
        initials_match: passed,
        surname_match: passed,
      };
    }

    return {
      passed: true,
      id_number_match: true,
      initials_match: true,
      surname_match: true,
    };
  }
}
