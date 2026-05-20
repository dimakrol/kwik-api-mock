import { Injectable } from '@nestjs/common';
import { mockConfig } from '../common/mock-config';

interface CdvRecord {
  bank_branch_code: number | string;
  bank_account_number: string;
  bank_account_type: string;
}

interface CdvResult {
  passed: boolean;
  bank_branch_code: string;
  bank_account_number: string;
  bank_account_type: string;
  modified_bank_account_number: string | null;
  warning: string | null;
  error: string | null;
}

const KNOWN_PASSING: Array<{ branch_code: number; account_number?: string }> = [
  { branch_code: 632005 },
  { branch_code: 51001, account_number: '10004301100' },
  { branch_code: 250655, account_number: '62001872440' },
];

@Injectable()
export class CdvService {
  validate(records: CdvRecord[]): CdvResult[] {
    const failUnknown = mockConfig.cdvFailUnknown;

    return records.map((record) => {
      // Preserve the original string representation (including leading zeros).
      // Use numeric form only for comparison against known-passing list.
      const branchCodeStr =
        typeof record.bank_branch_code === 'string'
          ? record.bank_branch_code
          : String(record.bank_branch_code);
      const branchCodeNum = parseInt(branchCodeStr, 10);

      const passed = failUnknown ? this.isKnownPassing(branchCodeNum, record.bank_account_number) : true;

      return {
        passed,
        bank_branch_code: branchCodeStr,
        bank_account_number: record.bank_account_number,
        bank_account_type: record.bank_account_type,
        modified_bank_account_number: null,
        warning: null,
        error: passed ? null : 'Account validation failed',
      };
    });
  }

  private isKnownPassing(branchCode: number, accountNumber: string): boolean {
    for (const known of KNOWN_PASSING) {
      if (known.branch_code !== branchCode) continue;
      if (known.account_number === undefined) return true;
      if (known.account_number === accountNumber) return true;
    }
    return false;
  }
}
