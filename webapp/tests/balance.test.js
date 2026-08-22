import { initBalanceTracker } from '../js/ui/balance.js';
import { state } from '../js/core/state.js';
import * as storage from '../js/services/storage.js';
import * as helpers from '../js/utils/helpers.js';

// Mock dependencies
jest.mock('../js/services/storage.js', () => ({
    saveBalanceCSV: jest.fn().mockResolvedValue(),
    amountToStr: (amt) => String(amt)
}));
jest.mock('../js/utils/helpers.js', () => ({
    toast: jest.fn(),
    getLocalDateString: jest.fn(() => '2026-07-19'),
    getDisplaySource: (s) => s || '',
    escHtml: (str) => str
}));
jest.mock('../js/ui/form.js', () => ({
    evaluateExpression: jest.fn((expr) => {
        try { return Function(`"use strict";return (${expr})`)(); } catch(e) { return NaN; }
    })
}));

describe('Balance Tracker UI', () => {
    let form;
    
    beforeEach(() => {
        // Setup dummy DOM
        document.body.innerHTML = `
            <form id="form-balance">
                <input id="input-balance-date" />
                <input id="input-balance-account" />
                <input id="input-balance-type" />
                <input id="input-balance-amount" />
                <input id="edit-balance-id" />
                <button id="btn-balance-submit"></button>
            </form>
            <div id="balance-content"></div>
            <div id="balance-chart-container"><canvas id="balance-chart"></canvas></div>
        `;
        
        // Reset state
        state.balanceData = [];
        
        // Clear mocks
        jest.clearAllMocks();
        
        // Initialize
        initBalanceTracker();
        form = document.getElementById('form-balance');
    });

    describe('Form Validations', () => {
        it('should show error if amount is invalid', () => {
            document.getElementById('input-balance-date').value = '2026-07-19';
            document.getElementById('input-balance-account').value = 'HDFC';
            document.getElementById('input-balance-amount').value = 'abc';
            
            form.dispatchEvent(new Event('submit'));
            
            expect(helpers.toast).toHaveBeenCalledWith(
                expect.stringContaining('Please enter a valid amount'),
                'error'
            );
            expect(state.balanceData.length).toBe(0);
        });

        it('should show error if missing required fields', () => {
            // Valid amount, but missing date and account
            document.getElementById('input-balance-amount').value = '1000';
            document.getElementById('input-balance-date').value = '';
            document.getElementById('input-balance-account').value = '';
            
            form.dispatchEvent(new Event('submit'));
            
            expect(helpers.toast).toHaveBeenCalledWith("Please fill in all fields correctly.", "error");
            expect(state.balanceData.length).toBe(0);
        });
    });

    describe('State Mutation', () => {
        it('should add new balance entry and save to cloud', async () => {
            document.getElementById('input-balance-date').value = '2026-07-19';
            document.getElementById('input-balance-account').value = 'SBI';
            document.getElementById('input-balance-type').value = 'Savings';
            document.getElementById('input-balance-amount').value = '5000';
            
            form.dispatchEvent(new Event('submit'));
            
            expect(state.balanceData.length).toBe(1);
            expect(state.balanceData[0]).toMatchObject({
                date: '2026-07-19',
                account: 'SBI',
                type: 'Savings',
                amount: 5000
            });
            
            // Allow promises to resolve
            await Promise.resolve();
            expect(storage.saveBalanceCSV).toHaveBeenCalled();
            expect(helpers.toast).toHaveBeenCalledWith("Balance saved.", "success");
        });

        it('should evaluate mathematical expressions and store them', async () => {
            document.getElementById('input-balance-date').value = '2026-07-19';
            document.getElementById('input-balance-account').value = 'Cash';
            document.getElementById('input-balance-amount').value = '1000+500';
            
            form.dispatchEvent(new Event('submit'));
            
            expect(state.balanceData.length).toBe(1);
            expect(state.balanceData[0].amount).toBe(1500);
            expect(state.balanceData[0].amountExpression).toBe('1000+500');
        });
    });
});
