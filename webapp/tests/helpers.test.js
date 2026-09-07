import * as helpers from '../js/utils/helpers.js';
import { state } from '../js/core/state.js';

describe('Helpers', () => {
    beforeEach(() => {
        // Reset state for each test
        state.categories = ['Food', 'Travel', 'Shopping', 'Others', 'Groceries', 'Medical', 'Bills', 'Maintenance', 'Transfer'];
        state.expenses = [];
        state.txnModes = ['UPI', 'Credit Card', 'Debit Card', 'Cash'];
    });

    describe('getCategoryForMerchant', () => {
        it('should use historical transactions for category mapping (STRONGEST signal)', () => {
            state.expenses = [
                { note: 'Zomato', category: 'Food' },
                { note: 'Amazon', category: 'Shopping' },
                { note: 'Zomato', category: 'Food' },
                { note: 'Zomato', category: 'Others' }
            ];
            // Even though "Zomato" has a mapping to Food in KEYWORD_MAPPINGS,
            // historical data takes precedence and confirms 'Food' is the most frequent.
            expect(helpers.getCategoryForMerchant('Zomato', null)).toBe('Food');
        });

        it('should fall back to masterCategory fuzzy matching if no history', () => {
            // "DineOut" has no history and no keyword mapping.
            // But if SMS parsed masterCategory as "Food & Dining", it should fuzzy match "Food".
            expect(helpers.getCategoryForMerchant('DineOut', 'Food & Dining')).toBe('Food');
        });

        it('should use KEYWORD_MAPPINGS as third fallback', () => {
            // "Uber" is in keyword mappings -> Travel
            expect(helpers.getCategoryForMerchant('Uber', null)).toBe('Travel');
            
            // "Apollo" is in keyword mappings -> Medical
            expect(helpers.getCategoryForMerchant('Apollo', null)).toBe('Medical');
            // "Uber through Amazon Pay" should map to Travel, not Shopping
            expect(helpers.getCategoryForMerchant('Uber through Amazon Pay', null)).toBe('Travel');
            
            // Even if Android parsed masterCategory as "Shopping", Web App keyword matching takes precedence
            expect(helpers.getCategoryForMerchant('Uber through Amazon Pay', 'Shopping')).toBe('Travel');
        });

        it('should return Others if nothing matches', () => {
            expect(helpers.getCategoryForMerchant('UnknownMerchant123', null)).toBe('Others');
        });
        
        it('should handle merchant prefixes properly', () => {
            state.expenses = [
                { note: 'Mr. Rakesh', category: 'Transfer' }
            ];
            expect(helpers.getCategoryForMerchant('Rakesh', null)).toBe('Transfer');
        });
    });

    describe('mapTxnMode', () => {
        it('should map string values to valid transaction modes', () => {
            expect(helpers.mapTxnMode('UPI', state.txnModes)).toBe('UPI');
            expect(helpers.mapTxnMode('credit card', state.txnModes)).toBe('Credit Card');
            expect(helpers.mapTxnMode('debit card', state.txnModes)).toBe('Debit Card');
        });

        it('should map Wallet, Apay Wallet, and Amazon Pay Balance to Wallet mode', () => {
            state.txnModes = ['📱 UPI', '💳 Credit Card', '👛 Wallet'];
            expect(helpers.mapTxnMode('Wallet', state.txnModes)).toBe('👛 Wallet');
            expect(helpers.mapTxnMode('Apay Wallet', state.txnModes)).toBe('👛 Wallet');
            expect(helpers.mapTxnMode('Amazon Pay Balance', state.txnModes)).toBe('👛 Wallet');
            expect(helpers.mapTxnMode('apay balance', state.txnModes)).toBe('👛 Wallet');
        });

        it('should ignore emojis during matching', () => {
            expect(helpers.mapTxnMode('💳 Credit Card', state.txnModes)).toBe('Credit Card');
            expect(helpers.mapTxnMode('📱 UPI', state.txnModes)).toBe('UPI');
        });

        it('should return undefined if no match found', () => {
            expect(helpers.mapTxnMode('UnknownMode', state.txnModes)).toBe('UPI'); // Falls back to first mode or UPI
        });
    });

    describe('parseLocalDate & getLocalDateString', () => {
        it('should correctly parse YYYY-MM-DD string into a local Date object', () => {
            const date = helpers.parseLocalDate('2026-07-19');
            expect(date.getFullYear()).toBe(2026);
            expect(date.getMonth()).toBe(6); // 0-indexed
            expect(date.getDate()).toBe(19);
        });

        it('should correctly format local Date object to YYYY-MM-DD string', () => {
            const date = new Date(2026, 6, 19); // July 19, 2026
            expect(helpers.getLocalDateString(date)).toBe('2026-07-19');
        });
    });

    describe('calculateNextRunDate', () => {
        it('should advance date correctly for daily frequency', () => {
            const next = helpers.calculateNextRunDate('daily', {}, '2026-07-19', false);
            expect(next).toBe('2026-07-20');
        });

        it('should advance date correctly for weekly frequency', () => {
            const next = helpers.calculateNextRunDate('weekly', {}, '2026-07-19', false);
            expect(next).toBe('2026-07-26');
        });

        it('should advance date correctly for monthly frequency', () => {
            const next = helpers.calculateNextRunDate('monthly', {}, '2026-07-19', false);
            expect(next).toBe('2026-08-19');
        });

        it('should handle end-of-month correctly for monthly frequency', () => {
            const next = helpers.calculateNextRunDate('monthly', {}, '2026-01-31', false);
            // JS Date auto advances to March 3rd if Feb doesn't have 31 days (2026 is non leap)
            // 31 - 28 = 3 days into March
            expect(next).toBe('2026-03-03');
        });
    });

    describe('mergeRefundTransactions', () => {
        it('should group expenses and refunds with exact matching absolute amounts', () => {
            const transactions = [
                { txnId: '1', date: '2026-07-19', amount: -500, txnType: 'Expense' },
                { txnId: '2', date: '2026-07-19', amount: 500, txnType: 'Refund' }
            ];
            const merged = helpers.mergeRefundTransactions(transactions);
            expect(merged.length).toBe(1);
            expect(merged[0].main.amount).toBe(500); // Expense is positive
            expect(merged[0].merged.amount).toBe(-500); // Refund is negative
        });

        it('should not group if dates are more than 8 days apart', () => {
            const transactions = [
                { txnId: '1', date: '2026-07-01', amount: -500, txnType: 'Expense' },
                { txnId: '2', date: '2026-07-19', amount: 500, txnType: 'Refund' }
            ];
            const merged = helpers.mergeRefundTransactions(transactions);
            expect(merged.length).toBe(2);
            expect(merged[0].merged).toBeNull();
            expect(merged[1].merged).toBeNull();
        });
    });

    describe('Transaction ID Utilities (getTxnIdList, getDisplayTxnId, hasMatchingTxnId)', () => {
        it('should extract transaction IDs from both txnId and transactionId fields', () => {
            expect(helpers.getTxnIdList({ txnId: 'TXN1|TXN2' })).toEqual(['TXN1', 'TXN2']);
            expect(helpers.getTxnIdList({ transactionId: '621235352225' })).toEqual(['621235352225']);
            expect(helpers.getTxnIdList({ txnId: '', transactionId: '406-0211555-9155556' })).toEqual(['406-0211555-9155556']);
            expect(helpers.getTxnIdList(null)).toEqual([]);
            expect(helpers.getTxnIdList({})).toEqual([]);
        });

        it('should format display transaction IDs suppressing auto-generated __TXN_, __SCHEDULER_, __QUICKADD_, __TXN_ prefixes', () => {
            expect(helpers.getDisplayTxnId({ txnId: '__TXN_1785210000000|621235352225' })).toBe('621235352225');
            expect(helpers.getDisplayTxnId({ txnId: '__SCHEDULER_1780842179402_2026-08-01|621235352225' })).toBe('621235352225');
            expect(helpers.getDisplayTxnId({ txnId: '__QUICKADD_123|621235352225' })).toBe('621235352225');
            expect(helpers.getDisplayTxnId({ txnId: '__TXN_1785210000000|621235352225' })).toBe('621235352225');
            expect(helpers.getDisplayTxnId({ transactionId: '406-0211555-9155556' })).toBe('406-0211555-9155556');
            expect(helpers.getDisplayTxnId({ txnId: '621235352225', source: 'Quick Add' })).toBe('');
        });

        it('should accurately detect matching transaction IDs across different field names', () => {
            const savedExpense = { txnId: '621235352225', date: '2026-07-31', amount: 5598 };
            const rawSms = { transactionId: '621235352225', date: '2026-07-31', amount: 5598 };
            const diffSms = { transactionId: '999999999999', date: '2026-07-31', amount: 5598 };

            expect(helpers.hasMatchingTxnId(savedExpense, rawSms)).toBe(true);
            expect(helpers.hasMatchingTxnId(savedExpense, diffSms)).toBe(false);
            expect(helpers.hasMatchingTxnId(savedExpense, {})).toBe(false);
        });

        it('should correctly format and shorten SMS/Email source strings into compact badge labels', () => {
            expect(helpers.getDisplaySource('SMS: AD-HDFCBK Debited INR 500')).toBe('SMS');
            expect(helpers.getDisplaySource('Email: HDFC Bank Alert: Refund processed')).toBe('Email');
            expect(helpers.getDisplaySource('SMS: AD-HDFCBK & Email: HDFC Bank Alert')).toBe('SMS & Email');
            expect(helpers.getDisplaySource('SMS: AD-HDFCBK & SMS: VP-ICICI')).toBe('SMS');
            expect(helpers.getDisplaySource('Quick Add')).toBe('Quick Add');
            expect(helpers.getDisplaySource('Schedule')).toBe('Schedule');
            expect(helpers.getDisplaySource('')).toBe('');
            expect(helpers.getDisplaySource(null)).toBe('');
        });
    });

    describe('invertExpression', () => {
        it('should invert negative mathematical expressions for positive refund display', () => {
            expect(helpers.invertExpression('-55204-149')).toBe('55204+149');
            expect(helpers.invertExpression('-100+20')).toBe('100-20');
            expect(helpers.invertExpression('55204+149')).toBe('55204+149');
        });
    });

    describe('renderAmountHTML', () => {
        it('should render amount-cell-wrap with inverted expression for refund transactions', () => {
            const html = helpers.renderAmountHTML({ amount: -55353, txnType: 'Refund', amountExpression: '-55204-149' });
            expect(html).toContain('class="amount-cell-wrap"');
            expect(html).toContain('<span class="amount-sign">+</span>');
            expect(html).toContain('<span class="amount-symbol">₹</span>');
            expect(html).toContain('<span class="amount-val">55,353.00</span>');
            expect(html).toContain('<span class="amount-expr">(55204+149)</span>');
        });

        it('should render simple amounts without amountExpression span', () => {
            const html = helpers.renderAmountHTML({ amount: 320, txnType: 'Expense' });
            expect(html).toContain('<span class="amount-symbol">₹</span>');
            expect(html).toContain('<span class="amount-val">320.00</span>');
            expect(html).not.toContain('amount-expr');
        });
    });

    describe('isMobileView', () => {
        const originalInnerWidth = window.innerWidth;
        const originalAndroid = window.Android;

        afterEach(() => {
            window.innerWidth = originalInnerWidth;
            window.Android = originalAndroid;
        });

        it('should return true when window.innerWidth <= 768', () => {
            window.innerWidth = 500;
            delete window.Android;
            expect(helpers.isMobileView()).toBe(true);
        });

        it('should return true when window.Android is defined even if window.innerWidth > 768', () => {
            window.innerWidth = 1024;
            window.Android = {};
            expect(helpers.isMobileView()).toBe(true);
        });

        it('should return false for desktop width without window.Android', () => {
            window.innerWidth = 1024;
            delete window.Android;
            expect(helpers.isMobileView()).toBe(false);
        });
    });
});

