import { state } from '../js/core/state.js';
import { getCategoryForMerchant, getTxnTypeForMerchant } from '../js/utils/helpers.js';

describe('Category Prediction', () => {
    beforeEach(() => {
        // Setup initial state before each test
        state.categories = [
            '🍔 Food & Dining',
            '✈️ Travel',
            '🛒 Shopping',
            '🍿 Entertainment',
            '🥦 Groceries',
            '💊 Medical',
            '🤷 Others',
            '📱 Mobile & Internet',
            '🛠️ Upkeep'
        ];
        
        state.expenses = [
            { note: 'Amazon AWS', category: '🤷 Others' },
            { note: 'Unknown Shop', category: '🛒 Shopping' },
            { note: 'Unknown Shop', category: '🛒 Shopping' },
            { note: 'Unknown Shop', category: '🤷 Others' } // Shopping has majority
        ];
    });

    test('Fuzzy match from masterCategory', () => {
        expect(getCategoryForMerchant('Some Merchant', 'Food')).toBe('🍔 Food & Dining');
    });

    test('Historical match priority', () => {
        expect(getCategoryForMerchant('Unknown Shop', null)).toBe('🛒 Shopping');
    });

    test('Keyword match: swiggy -> Food & Dining', () => {
        expect(getCategoryForMerchant('swiggy order', null)).toBe('🍔 Food & Dining');
    });

    test('Keyword match: lunch -> Food & Dining', () => {
        expect(getCategoryForMerchant('lunch with team', null)).toBe('🍔 Food & Dining');
    });

    test('Keyword match: uber -> Travel', () => {
        expect(getCategoryForMerchant('uber ride', null)).toBe('✈️ Travel');
    });

    test('Keyword match: netflix -> Entertainment', () => {
        expect(getCategoryForMerchant('netflix sub', null)).toBe('🍿 Entertainment');
    });

    test('Keyword match: zepto -> Groceries', () => {
        expect(getCategoryForMerchant('zepto groceries', null)).toBe('🥦 Groceries');
    });

    test('Keyword match: apollo -> Medical', () => {
        expect(getCategoryForMerchant('apollo pharmacy', null)).toBe('💊 Medical');
    });

    test('Keyword match: wifi -> Mobile & Internet', () => {
        expect(getCategoryForMerchant('wifi bill', null)).toBe('📱 Mobile & Internet');
    });

    test('Keyword match: jio -> Mobile & Internet', () => {
        expect(getCategoryForMerchant('jio recharge', null)).toBe('📱 Mobile & Internet');
    });

    test('Keyword match: repair -> Upkeep', () => {
        expect(getCategoryForMerchant('bike repair', null)).toBe('🛠️ Upkeep');
    });

    test('Fallback to Others', () => {
        expect(getCategoryForMerchant('random string', null)).toBe('🤷 Others');
    });
});

describe('Transaction Type Prediction', () => {
    beforeEach(() => {
        state.expenses = [
            { note: 'Historical Expense', txnType: 'Expense' },
            { note: 'Historical Refund', txnType: 'Refund' }
        ];
    });

    test('Historical match priority', () => {
        expect(getTxnTypeForMerchant('Historical Refund', 'Expense')).toBe('Refund');
    });

    test('Keyword match: salary -> Income', () => {
        expect(getTxnTypeForMerchant('march salary', 'Expense')).toBe('Income');
    });

    test('Keyword match: cashback -> Refund', () => {
        expect(getTxnTypeForMerchant('amazon cashback', 'Expense')).toBe('Refund');
    });

    test('Keyword match: sip -> Investment', () => {
        expect(getTxnTypeForMerchant('monthly sip', 'Expense')).toBe('Investment');
    });

    test('Fallback to defaultType', () => {
        expect(getTxnTypeForMerchant('random string', 'Expense')).toBe('Expense');
    });
});
