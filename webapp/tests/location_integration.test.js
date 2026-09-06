import { state } from '../js/core/state.js';
import { processScheduledTransactions } from '../js/services/storage.js';

// Mock helpers for integration testing
jest.mock('../js/utils/helpers.js', () => {
    return {
        ...jest.requireActual('../js/utils/helpers.js'),
        getCurrentLocationTag: jest.fn(() => Promise.resolve('IntegrationTestTag')),
        getLocalDateString: jest.fn(() => '2026-07-19'),
        toast: jest.fn()
    };
});

describe('Location Tag Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        state.expenses = [];
        state.scheduledTransactions = [];
        state.fileHashes = {};
        // Mock get/setItem
        Storage.prototype.setItem = jest.fn();
    });

    it('assigns location from getCurrentLocationTag during processScheduledTransactions (Recurring)', async () => {
        state.scheduledTransactions = [
            {
                id: '__SCHEDULER_recurring_1',
                disabled: false,
                amount: 500,
                category: 'Food',
                currency: 'INR',
                txnType: 'Expense',
                txnMode: 'Card',
                note: 'Lunch',
                frequency: 'daily',
                next_run_date: '2026-07-19',
                end_condition: 'never'
            }
        ];

        await processScheduledTransactions();

        expect(state.expenses.length).toBe(1);
        expect(state.expenses[0].location).toBe('IntegrationTestTag');
    });

    it('assigns location from getCurrentLocationTag during processScheduledTransactions (One-off)', async () => {
        state.scheduledTransactions = [
            {
                id: '__SCHEDULER_oneoff_1',
                disabled: false,
                amount: 1000,
                category: 'Utilities',
                currency: 'INR',
                txnType: 'Expense',
                txnMode: 'Card',
                note: 'Bill',
                frequency: 'one-off',
                next_run_date: '2026-07-19'
            }
        ];

        await processScheduledTransactions();

        expect(state.expenses.length).toBe(1);
        expect(state.expenses[0].location).toBe('IntegrationTestTag');
    });

    it('assigns location from getCurrentLocationTag during generateRefund when original has no location', async () => {
        const formModule = require('../js/ui/form.js');
        state.expenses = [{
            date: '2026-07-19',
            amount: 500,
            category: 'Shopping',
            txnType: 'Expense',
            txnMode: 'UPI',
            note: 'Shirt',
            txnId: 'TXN123',
            location: ''
        }];
        const origSave = formModule.saveYearCSV;
        formModule.saveYearCSV = jest.fn().mockResolvedValue();

        try {
            await formModule.generateRefund(0);
            expect(state.expenses.length).toBe(2);
            expect(state.expenses[1].location).toBe('IntegrationTestTag');
            expect(state.expenses[1].txnType).toBe('Refund');
        } finally {
            formModule.saveYearCSV = origSave;
        }
    });
});
