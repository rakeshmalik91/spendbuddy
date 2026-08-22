import { getTxnTypeFromMapping, TXN_TYPE_MAPPINGS } from '../js/utils/txn_mode_mapping.js';
import { updateTxnTypeAuto } from '../js/ui/form.js';

// Mock dependencies for form.js
jest.mock('../js/services/storage.js', () => ({
    uploadFile: jest.fn().mockResolvedValue(),
    amountToStr: (amt) => String(amt),
    roundAmount: (amt) => Math.round(amt * 100) / 100
}));

jest.mock('../js/utils/helpers.js', () => ({
    toast: jest.fn(),
    getLocalDateString: jest.fn(() => '2026-07-19'),
    parseLocalDate: jest.fn((d) => new Date(d)),
    getCategoryForMerchant: jest.fn(),
    getTxnTypeForMerchant: jest.fn(),
    syncChips: jest.fn()
}));

describe('Transaction Mode & Type Mapping', () => {
    describe('getTxnTypeFromMapping', () => {
        it('should return Investment for LIC and NPS categories', () => {
            expect(getTxnTypeFromMapping('lic')).toBe('Investment');
            expect(getTxnTypeFromMapping('LIC Premium')).toBe('Investment');
            expect(getTxnTypeFromMapping('nps')).toBe('Investment');
            expect(getTxnTypeFromMapping('NPS Tier 1')).toBe('Investment');
            expect(getTxnTypeFromMapping('Mutual Funds')).toBe('Investment');
            expect(getTxnTypeFromMapping('SIP Contribution')).toBe('Investment');
        });

        it('should return Income for salary, bonus, dividend, etc.', () => {
            expect(getTxnTypeFromMapping('Salary')).toBe('Income');
            expect(getTxnTypeFromMapping('Annual Bonus')).toBe('Income');
            expect(getTxnTypeFromMapping('Dividend Income')).toBe('Income');
        });

        it('should return Refund for refund, cashback, reversal', () => {
            expect(getTxnTypeFromMapping('Refund')).toBe('Refund');
            expect(getTxnTypeFromMapping('Cashback reward')).toBe('Refund');
        });

        it('should return Transfer for transfer, sent, atm withdrawal', () => {
            expect(getTxnTypeFromMapping('Bank Transfer')).toBe('Transfer');
            expect(getTxnTypeFromMapping('Money Sent')).toBe('Transfer');
            expect(getTxnTypeFromMapping('ATM Withdrawal')).toBe('Transfer');
            expect(getTxnTypeFromMapping('Cash Withdrawal')).toBe('Transfer');
        });

        it('should return null for unmatched categories', () => {
            expect(getTxnTypeFromMapping('Food')).toBeNull();
            expect(getTxnTypeFromMapping('Groceries')).toBeNull();
            expect(getTxnTypeFromMapping('')).toBeNull();
            expect(getTxnTypeFromMapping(null)).toBeNull();
        });
    });

    describe('updateTxnTypeAuto', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <input id="input-category" value="" />
                <input id="input-amount" value="500" />
                <input id="input-transaction-type" value="Expense" />
                <div id="txntype-chips"></div>
            `;
        });

        it('should auto select Investment type when category is LIC or NPS', () => {
            document.getElementById('input-category').value = 'LIC';
            updateTxnTypeAuto();
            expect(document.getElementById('input-transaction-type').value).toBe('Investment');

            document.getElementById('input-category').value = 'NPS Scheme';
            updateTxnTypeAuto();
            expect(document.getElementById('input-transaction-type').value).toBe('Investment');
        });

        it('should auto select Income type when category is Salary', () => {
            document.getElementById('input-category').value = 'Monthly Salary';
            updateTxnTypeAuto();
            expect(document.getElementById('input-transaction-type').value).toBe('Income');
        });

        it('should handle negative amounts for non-mapped categories as Refund', () => {
            document.getElementById('input-category').value = 'Food';
            document.getElementById('input-amount').value = '-150';
            updateTxnTypeAuto();
            expect(document.getElementById('input-transaction-type').value).toBe('Refund');
        });
    });
});
