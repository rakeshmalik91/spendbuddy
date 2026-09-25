import { state } from '../js/core/state.js';
import {
    findMatchingKeywordRule,
    getCategoryForMerchant,
    getTxnTypeForMerchant,
    getTxnModeForMerchant,
    mapTxnMode,
    stripEmojiPrefix,
    normalizeTxnType,
    resolveCategoryName,
    resolveTxnModeName
} from '../js/utils/category_helpers.js';
import { isRefundTxn } from '../js/utils/txn_id_helpers.js';

import { applyUserSettings, updateUserSettings } from '../js/services/user_settings.js';
import { executeRulesOnExpenses, syncKeywordMappingsOnEntityChange } from '../js/ui/keyword_mappings.js';
import { saveYearCSV } from '../js/ui/form.js';

jest.mock('../js/ui/form.js', () => ({
    saveYearCSV: jest.fn().mockResolvedValue(true)
}));
jest.mock('../js/ui/render_all.js', () => ({
    renderAll: jest.fn()
}));
jest.mock('../js/core/init.js', () => ({
    $: jest.fn(() => null),
    $$: jest.fn(() => []),
    showLoader: jest.fn(),
    hideLoader: jest.fn()
}));

jest.mock('../js/services/auth.js', () => ({
    getRequiredEmail: jest.fn(() => 'testuser@gmail.com')
}));

let mockCsvContent = null;
jest.mock('../js/services/storage.js', () => ({
    getCsvContent: jest.fn(async (filename) => {
        if (filename === 'user_settings.json') {
            return mockCsvContent;
        }
        return null;
    })
}));

describe('Keyword Mappings & Inference Overrides', () => {
    beforeEach(() => {
        localStorage.clear();
        mockCsvContent = null;
        state.categories = ['🍜 Food', '🎬 Entertainment', '🛒 Groceries', '💼 Income', 'Others'];
        state.txnModes = ['UPI', '💳 Credit Card', '🍽️ Meal Card', '👛 Wallet', '🏦 Net Banking'];
        state.keywordMappings = [];
        state.expenses = [];
        jest.clearAllMocks();
    });

    describe('findMatchingKeywordRule', () => {
        it('returns null when no mappings exist or text is empty', () => {
            expect(findMatchingKeywordRule('')).toBeNull();
            expect(findMatchingKeywordRule(null)).toBeNull();
            expect(findMatchingKeywordRule('swiggy')).toBeNull();
        });

        it('matches keyword case-insensitively and as substring', () => {
            state.keywordMappings = [
                { id: '1', keyword: 'Swiggy', category: '🍜 Food', txnType: 'Expense', txnMode: '🍽️ Meal Card' }
            ];

            expect(findMatchingKeywordRule('swiggy')).toEqual(state.keywordMappings[0]);
            expect(findMatchingKeywordRule('Paid to SWIGGY BANGALORE IN')).toEqual(state.keywordMappings[0]);
            expect(findMatchingKeywordRule('Swiggy Instamart')).toEqual(state.keywordMappings[0]);
            expect(findMatchingKeywordRule('Zomato')).toBeNull();
        });

        it('prioritizes longer / more specific keywords first', () => {
            state.keywordMappings = [
                { id: '1', keyword: 'Amazon', category: '🛒 Groceries', txnType: 'Expense', txnMode: '💳 Credit Card' },
                { id: '2', keyword: 'Amazon Pay', category: '🎬 Entertainment', txnType: 'Expense', txnMode: '👛 Wallet' }
            ];

            const matched = findMatchingKeywordRule('Payment to Amazon Pay India');
            expect(matched.id).toBe('2');
            expect(matched.txnMode).toBe('👛 Wallet');

            const matchedGeneric = findMatchingKeywordRule('Amazon Retail Goods');
            expect(matchedGeneric.id).toBe('1');
            expect(matchedGeneric.txnMode).toBe('💳 Credit Card');
        });

        it('supports comma-separated keyword aliases and matches any token', () => {
            state.keywordMappings = [
                { id: 'kw-nps', keyword: 'NPS, Protean', category: 'Pension', txnType: 'Investment' },
                { id: 'kw-ins', keyword: 'HDFCLife, HDFC Life, LIC', category: 'Insurance', txnType: 'Investment' }
            ];

            // Test first rule tokens
            expect(findMatchingKeywordRule('NPS contribution for tier 1').id).toBe('kw-nps');
            expect(findMatchingKeywordRule('Payment to Protean eGov Services').id).toBe('kw-nps');

            // Test second rule tokens
            expect(findMatchingKeywordRule('HDFCLife renewal').id).toBe('kw-ins');
            expect(findMatchingKeywordRule('Premium for HDFC Life policy').id).toBe('kw-ins');
            expect(findMatchingKeywordRule('Direct debit LIC of India').id).toBe('kw-ins');
        });

        it('prioritizes the longest matching individual token across multi-keyword rules', () => {
            state.keywordMappings = [
                { id: 'kw-generic', keyword: 'Life, LIC', category: 'General Life' },
                { id: 'kw-specific', keyword: 'HDFCLife, HDFC Life', category: 'HDFC Life Spec' }
            ];

            // "HDFC Life" has length 9, which is longer than "Life" length 4
            const match = findMatchingKeywordRule('HDFC Life monthly investment');
            expect(match.id).toBe('kw-specific');

            // "LIC" matches kw-generic
            const matchLic = findMatchingKeywordRule('LIC premium');
            expect(matchLic.id).toBe('kw-generic');
        });
    });

    describe('getCategoryForMerchant override precedence', () => {
        it('falls back to extraText / source when merchantName is missing or lacks matching rule', () => {
            state.keywordMappings = [
                { id: 'kw-src', keyword: 'Protean', category: 'Pension', txnType: 'Investment', txnMode: '🏦 Net Banking' }
            ];
            state.categories = ['Pension', 'Others'];

            // merchantName is null/empty, source contains "SMS: Protean"
            expect(getCategoryForMerchant(null, null, 'SMS: Protean eGov')).toBe('Pension');
            expect(getTxnTypeForMerchant(null, 'Expense', 'SMS: Protean eGov')).toBe('Investment');
            expect(getTxnModeForMerchant(null, null, state.txnModes, 'SMS: Protean eGov')).toBe('🏦 Net Banking');
        });
        it('overrides historical transaction frequencies when custom keyword mapping exists', () => {
            // Suppose historical transactions for "Swiggy" were all labeled "Others"
            state.expenses = [
                { note: 'Swiggy', category: 'Others' },
                { note: 'Swiggy', category: 'Others' },
                { note: 'Swiggy', category: 'Others' }
            ];

            // Without custom mapping, it defaults to historical best: "Others"
            expect(getCategoryForMerchant('Swiggy', null)).toBe('Others');

            // With custom mapping, it MUST override to "🍜 Food"
            state.keywordMappings = [
                { id: 'kw1', keyword: 'swiggy', category: '🍜 Food' }
            ];
            expect(getCategoryForMerchant('Swiggy', null)).toBe('🍜 Food');
        });

        it('overrides default KEYWORD_MAPPINGS when custom mapping exists', () => {
            // "netflix" normally maps to Entertainment in default KEYWORD_MAPPINGS
            // But user wants "netflix" to map to "Others" or custom category
            state.keywordMappings = [
                { id: 'kw2', keyword: 'netflix', category: 'Others' }
            ];
            expect(getCategoryForMerchant('Netflix Subscription', null)).toBe('Others');
        });

        it('overrides SMS masterCategory parameter', () => {
            state.keywordMappings = [
                { id: 'kw3', keyword: 'starbucks', category: '🍜 Food' }
            ];
            // Even if SMS parsed masterCategory is "Travel"
            expect(getCategoryForMerchant('Starbucks Coffee', 'Travel')).toBe('🍜 Food');
        });
    });

    describe('getTxnTypeForMerchant override precedence', () => {
        it('overrides historical transaction type when custom mapping exists', () => {
            state.expenses = [
                { note: 'Salary from Company', txnType: 'Expense' },
                { note: 'Salary from Company', txnType: 'Expense' }
            ];

            expect(getTxnTypeForMerchant('Salary from Company', 'Expense')).toBe('Expense');

            state.keywordMappings = [
                { id: 'kw4', keyword: 'salary', txnType: 'Income' }
            ];

            expect(getTxnTypeForMerchant('Salary from Company', 'Expense')).toBe('Income');
        });

        it('returns defaultTxnType when custom rule does not specify txnType', () => {
            state.keywordMappings = [
                { id: 'kw5', keyword: 'uber', category: 'Others' } // no txnType override
            ];

            expect(getTxnTypeForMerchant('Uber Ride', 'Expense')).toBe('Expense');
        });
    });

    describe('getTxnModeForMerchant override precedence', () => {
        it('overrides default transaction mode based on merchant keyword', () => {
            state.keywordMappings = [
                { id: 'kw6', keyword: 'swiggy', txnMode: '🍽️ Meal Card' }
            ];

            // Even if rawMode was UPI
            const mode = getTxnModeForMerchant('Swiggy', 'UPI', state.txnModes);
            expect(mode).toBe('🍽️ Meal Card');
        });

        it('overrides transaction mode when keyword matches rawMode text', () => {
            state.keywordMappings = [
                { id: 'kw7', keyword: 'gpay', txnMode: 'UPI' }
            ];

            const mode = getTxnModeForMerchant('Vendor', 'GPay Transfer', state.txnModes);
            expect(mode).toBe('UPI');
        });

        it('mapTxnMode also respects custom keyword mappings for rawMode', () => {
            state.keywordMappings = [
                { id: 'kw8', keyword: 'customcard', txnMode: '💳 Credit Card' }
            ];

            const mode = mapTxnMode('customcard ending 1234', state.txnModes);
            expect(mode).toBe('💳 Credit Card');
        });

        it('falls back to standard mapTxnMode when no custom rule matches', () => {
            const mode = getTxnModeForMerchant('Unknown', 'Credit Card', state.txnModes);
            expect(mode).toBe('💳 Credit Card');
        });
    });

    describe('Settings persistence & synchronization', () => {
        it('applyUserSettings normalizes keywordMappings (stripping emojis) and applies to state and localStorage', () => {
            const settings = {
                keywordMappings: [
                    { id: '1', keyword: 'zomato', category: '🍜 Food', txnType: 'Expense', txnMode: '💳 Credit Card' }
                ]
            };

            const changed = applyUserSettings(settings);
            expect(changed).toBe(true);
            // Emojis should be stripped in settings
            expect(state.keywordMappings[0].category).toBe('Food');
            expect(state.keywordMappings[0].txnMode).toBe('Credit Card');
            expect(state.keywordMappings[0].txnType).toBe('Expense');
            expect(JSON.parse(localStorage.getItem('expman_keyword_mappings'))).toEqual(state.keywordMappings);
        });

        it('updateUserSettings saves normalized keywordMappings into merged settings', async () => {
            mockCsvContent = JSON.stringify({
                ui: { hideIncome: false },
                keywordMappings: [
                    { id: 'old', keyword: 'old', category: 'Others' }
                ]
            });

            const newMappings = [
                { id: 'new', keyword: 'new', category: '🍜 Food', txnMode: '🏦 Bank Transfer' }
            ];

            const result = await updateUserSettings({ keywordMappings: newMappings });
            expect(result.keywordMappings[0].category).toBe('Food');
            expect(result.keywordMappings[0].txnMode).toBe('Bank Transfer');
            expect(result.ui.hideIncome).toBe(false);
        });
    });

    describe('Entity Normalization & State Resolution', () => {
        it('stripEmojiPrefix removes various emojis and whitespace', () => {
            expect(stripEmojiPrefix('💰 Salary')).toBe('Salary');
            expect(stripEmojiPrefix('🏦 Bank Transfer')).toBe('Bank Transfer');
            expect(stripEmojiPrefix('🍽️ Meal Card')).toBe('Meal Card');
            expect(stripEmojiPrefix('💳 Credit Card')).toBe('Credit Card');
            expect(stripEmojiPrefix('👛 Wallet')).toBe('Wallet');
            expect(stripEmojiPrefix('Salary')).toBe('Salary');
        });

        it('resolveCategoryName resolves normalized names to state.categories with emojis', () => {
            state.categories = ['💰 Salary', '🍜 Food', 'Others'];
            expect(resolveCategoryName('Salary')).toBe('💰 Salary');
            expect(resolveCategoryName('Food')).toBe('🍜 Food');
            expect(resolveCategoryName('Others')).toBe('Others');
            expect(resolveCategoryName('Unknown')).toBe('Unknown');
        });

        it('resolveTxnModeName resolves normalized names to state.txnModes with emojis', () => {
            state.txnModes = ['🏦 Bank Transfer', '💳 Credit Card', 'UPI'];
            expect(resolveTxnModeName('Bank Transfer')).toBe('🏦 Bank Transfer');
            expect(resolveTxnModeName('Credit Card')).toBe('💳 Credit Card');
            expect(resolveTxnModeName('UPI')).toBe('UPI');
            expect(resolveTxnModeName('Cash')).toBe('Cash');
        });

        it('normalizeTxnType ensures standard casing', () => {
            expect(normalizeTxnType('income')).toBe('Income');
            expect(normalizeTxnType('EXPENSE')).toBe('Expense');
            expect(normalizeTxnType('Refund')).toBe('Refund');
        });

        it('getCategoryForMerchant and getTxnModeForMerchant resolve correctly with normalized keyword rules', () => {
            state.categories = ['💰 Salary', '🍜 Food'];
            state.txnModes = ['🏦 Bank Transfer', 'UPI'];
            state.keywordMappings = [
                { id: 'k1', keyword: 'nab', category: 'Salary', txnType: 'Income', txnMode: 'Bank Transfer' }
            ];

            expect(getCategoryForMerchant('NAB Payroll')).toBe('💰 Salary');
            expect(getTxnTypeForMerchant('NAB Payroll')).toBe('Income');
            expect(getTxnModeForMerchant('NAB Payroll', 'UPI', state.txnModes)).toBe('🏦 Bank Transfer');
        });
    });

    describe('executeRulesOnExpenses', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('updates category, txnType, and txnMode for matching transactions and adjusts amount sign', async () => {
            state.expenses = [
                {
                    id: '1',
                    date: '2026-03-01',
                    amount: 50000,
                    note: 'Salary from Acme Corp',
                    category: 'Others',
                    txnType: 'Expense',
                    txnMode: 'UPI'
                },
                {
                    id: '2',
                    date: '2025-11-15',
                    amount: -250,
                    note: 'Refund from Amazon',
                    category: 'Shopping',
                    txnType: 'Refund',
                    txnMode: 'UPI'
                },
                {
                    id: '3',
                    date: '2026-05-10',
                    amount: 350,
                    note: 'Uber ride',
                    category: 'Travel',
                    txnType: 'Expense',
                    txnMode: 'UPI'
                }
            ];

            const rules = [
                { keyword: 'salary', category: '💼 Income', txnType: 'Income', txnMode: '🏦 Net Banking' }
            ];

            await executeRulesOnExpenses(rules);

            // Expense 1 should be updated
            expect(state.expenses[0].category).toBe('💼 Income');
            expect(state.expenses[0].txnType).toBe('Income');
            expect(state.expenses[0].txnMode).toBe('🏦 Net Banking');
            expect(state.expenses[0].amount).toBe(-50000); // Income amounts are negative

            // Other expenses should be untouched
            expect(state.expenses[1].category).toBe('Shopping');
            expect(state.expenses[2].category).toBe('Travel');

            // saveYearCSV should be called for 2026
            expect(saveYearCSV).toHaveBeenCalledWith('2026');
            expect(saveYearCSV).not.toHaveBeenCalledWith('2025');
        });

        it('handles flipping from Income to Expense by making amount positive', async () => {
            state.expenses = [
                {
                    id: '4',
                    date: '2026-01-10',
                    amount: -1200,
                    note: 'Swiggy refund mistake',
                    category: 'Others',
                    txnType: 'Income',
                    txnMode: 'UPI'
                }
            ];

            const rules = [
                { keyword: 'swiggy', category: '🍜 Food', txnType: 'Expense', txnMode: '🍽️ Meal Card' }
            ];

            await executeRulesOnExpenses(rules);

            expect(state.expenses[0].category).toBe('🍜 Food');
            expect(state.expenses[0].txnType).toBe('Expense');
            expect(state.expenses[0].txnMode).toBe('🍽️ Meal Card');
            expect(state.expenses[0].amount).toBe(1200); // Expense amounts are positive
            expect(saveYearCSV).toHaveBeenCalledWith('2026');
        });

        it('does not call saveYearCSV if transactions already match rule values', async () => {
            state.expenses = [
                {
                    id: '5',
                    date: '2026-02-14',
                    amount: 500,
                    note: 'Zomato order',
                    category: '🍜 Food',
                    txnType: 'Expense',
                    txnMode: 'UPI'
                }
            ];

            const rules = [
                { keyword: 'zomato', category: '🍜 Food', txnType: 'Expense', txnMode: 'UPI' }
            ];

            await executeRulesOnExpenses(rules);

            expect(saveYearCSV).not.toHaveBeenCalled();
        });

        it('applies comma-separated keyword rules to historical transactions across note, merchant, and source', async () => {
            state.categories = ['Pension', 'Insurance', 'Others'];
            state.expenses = [
                {
                    id: 'e1',
                    date: '2026-03-01',
                    amount: 5000,
                    note: 'NPS contribution tier 1',
                    category: 'Others',
                    txnType: 'Expense',
                    txnMode: 'UPI'
                },
                {
                    id: 'e2',
                    date: '2026-03-02',
                    amount: 12000,
                    note: 'HDFCLife annual renewal',
                    category: 'Others',
                    txnType: 'Expense',
                    txnMode: 'UPI'
                },
                {
                    id: 'e3',
                    date: '2026-03-03',
                    amount: 8000,
                    note: 'Monthly savings',
                    merchant: 'Protean eGov',
                    category: 'Others',
                    txnType: 'Expense',
                    txnMode: 'UPI'
                }
            ];

            const rules = [
                { keyword: 'NPS, Protean', category: 'Pension', txnType: 'Investment' },
                { keyword: 'HDFCLife, HDFC Life, LIC', category: 'Insurance', txnType: 'Investment' }
            ];

            await executeRulesOnExpenses(rules);

            expect(state.expenses[0].category).toBe('Pension');
            expect(state.expenses[0].txnType).toBe('Investment');

            expect(state.expenses[1].category).toBe('Insurance');
            expect(state.expenses[1].txnType).toBe('Investment');

            expect(state.expenses[2].category).toBe('Pension');
            expect(state.expenses[2].txnType).toBe('Investment');

            expect(saveYearCSV).toHaveBeenCalledWith('2026');
        });
    });

    describe('syncKeywordMappingsOnEntityChange (Reflect category/txnMode rename & delete)', () => {
        beforeEach(() => {
            state.keywordMappings = [
                { id: '1', keyword: 'swiggy', category: 'Old Dining', txnType: 'Expense', txnMode: 'Old Wallet' },
                { id: '2', keyword: 'zomato', category: 'Old Dining', txnType: null, txnMode: null },
                { id: '3', keyword: 'uber', category: 'Travel', txnType: 'Expense', txnMode: 'Old Wallet' },
                { id: '4', keyword: 'paytm', category: null, txnType: null, txnMode: 'Old Wallet' }
            ];
        });

        it('renames category across all matching keyword rules and updates localStorage', async () => {
            const changed = await syncKeywordMappingsOnEntityChange('category', 'rename', 'Old Dining', '🍜 Fine Dining');

            expect(changed).toBe(true);
            expect(state.keywordMappings[0].category).toBe('Fine Dining');
            expect(state.keywordMappings[1].category).toBe('Fine Dining');
            // Unrelated category untouched
            expect(state.keywordMappings[2].category).toBe('Travel');

            const stored = JSON.parse(localStorage.getItem('expman_keyword_mappings'));
            expect(stored[0].category).toBe('Fine Dining');
        });

        it('deletes category with fallback by replacing category on matching rules', async () => {
            const changed = await syncKeywordMappingsOnEntityChange('category', 'delete', 'Old Dining', 'Others');

            expect(changed).toBe(true);
            expect(state.keywordMappings[0].category).toBe('Others');
            expect(state.keywordMappings[1].category).toBe('Others');
            // Rule 1 still has other overrides
            expect(state.keywordMappings[0].txnMode).toBe('Old Wallet');
        });

        it('deletes category without fallback: nulls category on multi-override rules and removes single-override rules', async () => {
            const changed = await syncKeywordMappingsOnEntityChange('category', 'delete', 'Old Dining', null);

            expect(changed).toBe(true);
            // Rule 1 had txnType and txnMode, so it is kept with category: null
            expect(state.keywordMappings.find(r => r.id === '1')).toBeDefined();
            expect(state.keywordMappings.find(r => r.id === '1').category).toBeNull();
            expect(state.keywordMappings.find(r => r.id === '1').txnType).toBe('Expense');

            // Rule 2 ONLY had category: 'Old Dining', so with no other overrides it should be pruned
            expect(state.keywordMappings.find(r => r.id === '2')).toBeUndefined();
        });

        it('renames transaction mode across all matching keyword rules', async () => {
            const changed = await syncKeywordMappingsOnEntityChange('txnmode', 'rename', 'Old Wallet', '👛 Digital Wallet');

            expect(changed).toBe(true);
            expect(state.keywordMappings[0].txnMode).toBe('Digital Wallet');
            expect(state.keywordMappings[2].txnMode).toBe('Digital Wallet');
            expect(state.keywordMappings[3].txnMode).toBe('Digital Wallet');
        });

        it('deletes transaction mode with fallback by replacing txnMode', async () => {
            const changed = await syncKeywordMappingsOnEntityChange('txnmode', 'delete', 'Old Wallet', 'Cash');

            expect(changed).toBe(true);
            expect(state.keywordMappings[0].txnMode).toBe('Cash');
            expect(state.keywordMappings[2].txnMode).toBe('Cash');
            expect(state.keywordMappings[3].txnMode).toBe('Cash');
        });

        it('deletes transaction mode without fallback: nulls txnMode on multi-override rules and removes single-override rules', async () => {
            const changed = await syncKeywordMappingsOnEntityChange('txnmode', 'delete', 'Old Wallet', null);

            expect(changed).toBe(true);
            // Rule 0 and 2 have category/txnType, so they are kept with txnMode: null
            expect(state.keywordMappings.find(r => r.id === '1').txnMode).toBeNull();
            expect(state.keywordMappings.find(r => r.id === '3').txnMode).toBeNull();

            // Rule 4 ONLY had txnMode: 'Old Wallet', so it should be pruned
            expect(state.keywordMappings.find(r => r.id === '4')).toBeUndefined();
        });

        it('returns false if no rules matched the renamed or deleted entity', async () => {
            const changed = await syncKeywordMappingsOnEntityChange('category', 'rename', 'NonExistent', 'NewCat');
            expect(changed).toBe(false);
        });
    });

    describe('User settings verification for NEFT salary transaction', () => {
        const userKeywordMappings = [
            {
                id: 'kw_1788851812753',
                keyword: 'NAB, Global Innovation Centre',
                category: 'Salary',
                txnType: 'Income',
                txnMode: 'Bank Transfer'
            },
            {
                id: 'kw_1788853082716',
                keyword: 'NPS, Protean',
                category: 'Pension',
                txnType: 'Investment',
                txnMode: null
            },
            {
                id: 'kw_1788853107126',
                keyword: 'HDFCLife, HDFC Life, LIC',
                category: 'Insurance',
                txnType: 'Investment',
                txnMode: null
            }
        ];
        const txnNote = 'Neft Cr-scbl0036001-nab Global Innovation Centre India-rakesh Malik-scblh26800601816';

        beforeEach(() => {
            state.keywordMappings = [...userKeywordMappings];
            state.categories = ['🍜 Food', '💰 Salary', '🪬 Insurance', '🐷 Pension', 'Others'];
            state.txnModes = ['📱 UPI', '🏦 Bank Transfer', '💳 Card', '👛 Wallet'];
            state.expenses = [];
        });

        it('correctly matches NAB Global Innovation Centre rule for NEFT salary note', () => {
            const rule = findMatchingKeywordRule(txnNote);
            expect(rule).toBeDefined();
            expect(rule.id).toBe('kw_1788851812753');
            expect(rule.keyword).toBe('NAB, Global Innovation Centre');
            expect(rule.category).toBe('Salary');
            expect(rule.txnType).toBe('Income');
            expect(rule.txnMode).toBe('Bank Transfer');
        });

        it('maps merchant/note to Category: 💰 Salary, TxnType: Income, and TxnMode: 🏦 Bank Transfer (with emoji resolution)', () => {
            expect(getCategoryForMerchant(txnNote)).toBe('💰 Salary');
            expect(getTxnTypeForMerchant(txnNote, 'Expense')).toBe('Income');
            expect(getTxnModeForMerchant(txnNote, 'UPI', state.txnModes)).toBe('🏦 Bank Transfer');
        });

        it('maps correctly even when categories and txn modes do not use emoji prefixes', () => {
            const plainCategories = ['Food', 'Salary', 'Insurance', 'Pension', 'Others'];
            const plainTxnModes = ['UPI', 'Bank Transfer', 'Card', 'Wallet'];
            state.categories = plainCategories;
            state.txnModes = plainTxnModes;

            expect(getCategoryForMerchant(txnNote)).toBe('Salary');
            expect(getTxnTypeForMerchant(txnNote, 'Expense')).toBe('Income');
            expect(getTxnModeForMerchant(txnNote, 'UPI', plainTxnModes)).toBe('Bank Transfer');
        });

        it('applies the mapping to transactions during executeRulesOnExpenses and sets amount sign to negative', async () => {
            state.expenses = [
                {
                    id: 'txn-salary-1',
                    date: '2026-09-25',
                    amount: 221070,
                    note: txnNote,
                    category: 'Others',
                    txnType: 'Expense',
                    txnMode: 'UPI'
                }
            ];

            await executeRulesOnExpenses(state.keywordMappings);

            expect(state.expenses[0].category).toBe('💰 Salary');
            expect(state.expenses[0].txnType).toBe('Income');
            expect(state.expenses[0].txnMode).toBe('🏦 Bank Transfer');
            expect(state.expenses[0].amount).toBe(-221070);
            expect(saveYearCSV).toHaveBeenCalledWith('2026');
        });

        it('isRefundTxn respects Priority-0 custom keyword mapping and does not classify negative income as Refund', () => {
            const pendingTxnWithoutType = {
                merchant: txnNote,
                amount: -221070,
                source: 'SMS: BP-HDFCBK-S'
            };

            // Without custom mapping, a negative amount with no type would default to Refund in isRefundTxn
            state.keywordMappings = [];
            expect(isRefundTxn(pendingTxnWithoutType)).toBe(true);

            // With the custom rule providing txnType: 'Income', isRefundTxn MUST return false
            state.keywordMappings = [...userKeywordMappings];
            expect(isRefundTxn(pendingTxnWithoutType)).toBe(false);
        });
    });
});


