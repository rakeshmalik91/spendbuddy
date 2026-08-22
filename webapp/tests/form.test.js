import { state } from '../js/core/state.js';
import * as helpers from '../js/utils/helpers.js';
import { evaluateExpression } from '../js/ui/form.js';

// Mock dependencies
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
    syncChips: jest.fn(),
    getDisplayTxnId: jest.fn(() => ''),
    getDisplayTxnIdList: jest.fn(() => []),
    getDisplaySource: (s) => s || '',
    getDisplaySourceList: (s) => s ? [s] : [],
    escHtml: (str) => str || '',
    amountClass: () => 'amt-expense',
    txnTypeBadgeHTML: () => '',
    formatDate: (d) => d || '',
    renderAmountHTML: (e) => e ? String(e.amount) : '',
    isRefundTxn: (e) => e && (e.txnType === 'Refund' || e.amount < 0)
}));

// Provide a minimalistic mock for the form initialization
function initFormDummy() {
    const form = document.getElementById('form-add');
    if (!form) return;
    
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        if (state.cloudSyncInProgress) {
            helpers.toast('Please wait for cloud sync to complete...', 'error');
            return;
        }

        if (!document.getElementById('input-date').value) {
            helpers.toast('Please select a Date', 'error');
            return;
        }
        if (!document.getElementById('input-category').value) {
            helpers.toast('Please select a Category', 'error');
            return;
        }
        if (!document.getElementById('input-transaction-type').value) {
            helpers.toast('Please select a Transaction Type', 'error');
            return;
        }
        const rawAmount = document.getElementById('input-amount').value;
        if (!rawAmount) {
            helpers.toast('Please enter an amount', 'error');
            return;
        }
        const parsedAmt = evaluateExpression(rawAmount);
        if (isNaN(parsedAmt) || parsedAmt === 0) {
            helpers.toast('Please enter a valid amount', 'error');
            return;
        }

        // Dummy save logic to verify state mutation
        state.expenses.push({
            date: document.getElementById('input-date').value,
            amount: parsedAmt,
            category: document.getElementById('input-category').value,
            txnType: document.getElementById('input-transaction-type').value,
            note: document.getElementById('input-note').value
        });
        
        helpers.toast('Saved', 'success');
    });
}

describe('Add Page Form UI', () => {
    let form;
    
    beforeEach(() => {
        document.body.innerHTML = `
            <form id="form-add">
                <input id="input-date" />
                <input id="input-category" />
                <input id="input-transaction-type" />
                <input id="input-amount" />
                <input id="input-note" />
                <button type="submit" id="btn-submit">Save</button>
            </form>
        `;
        
        state.expenses = [];
        state.cloudSyncInProgress = false;
        jest.clearAllMocks();
        
        initFormDummy();
        form = document.getElementById('form-add');
    });

    describe('Form Validations', () => {
        it('should block submission if cloud sync is in progress', () => {
            state.cloudSyncInProgress = true;
            form.dispatchEvent(new Event('submit'));
            
            expect(helpers.toast).toHaveBeenCalledWith(
                'Please wait for cloud sync to complete...',
                'error'
            );
            expect(state.expenses.length).toBe(0);
        });

        it('should block submission if required fields are missing', () => {
            // Missing date
            document.getElementById('input-date').value = '';
            document.getElementById('input-category').value = 'Food';
            document.getElementById('input-transaction-type').value = 'Expense';
            document.getElementById('input-amount').value = '100';
            
            form.dispatchEvent(new Event('submit'));
            expect(helpers.toast).toHaveBeenCalledWith('Please select a Date', 'error');
            
            // Missing category
            document.getElementById('input-date').value = '2026-07-19';
            document.getElementById('input-category').value = '';
            form.dispatchEvent(new Event('submit'));
            expect(helpers.toast).toHaveBeenCalledWith('Please select a Category', 'error');
            
            expect(state.expenses.length).toBe(0);
        });

        it('should validate mathematical expressions in amount field', () => {
            document.getElementById('input-date').value = '2026-07-19';
            document.getElementById('input-category').value = 'Food';
            document.getElementById('input-transaction-type').value = 'Expense';
            
            // Invalid amount
            document.getElementById('input-amount').value = 'abc';
            form.dispatchEvent(new Event('submit'));
            expect(helpers.toast).toHaveBeenCalledWith('Please enter a valid amount', 'error');
            expect(state.expenses.length).toBe(0);
        });
    });

    describe('State Mutation', () => {
        it('should evaluate expression and store correct expense on valid submit', () => {
            document.getElementById('input-date').value = '2026-07-19';
            document.getElementById('input-category').value = 'Shopping';
            document.getElementById('input-transaction-type').value = 'Expense';
            document.getElementById('input-amount').value = '100+50*2'; // 200
            document.getElementById('input-note').value = 'Groceries';
            
            form.dispatchEvent(new Event('submit'));
            
            expect(state.expenses.length).toBe(1);
            expect(state.expenses[0]).toMatchObject({
                date: '2026-07-19',
                category: 'Shopping',
                txnType: 'Expense',
                amount: 200,
                note: 'Groceries'
            });
            expect(helpers.toast).toHaveBeenCalledWith('Saved', 'success');
        });
    });

    describe('Race Condition & Submission Lock', () => {
        it('should toggle form submitting state and apply form-submitting lock classes', () => {
            const { getIsFormSubmitting, setFormSubmittingState } = require('../js/ui/form.js');
            expect(getIsFormSubmitting()).toBe(false);

            setFormSubmittingState(true);
            expect(getIsFormSubmitting()).toBe(true);

            const submitBtn = document.getElementById('btn-submit');
            if (submitBtn) {
                expect(submitBtn.disabled).toBe(true);
            }

            setFormSubmittingState(false);
            expect(getIsFormSubmitting()).toBe(false);
            if (submitBtn) {
                expect(submitBtn.disabled).toBe(false);
            }
        });

        it('should skip resetForm if form fill occurred after submit start timestamp', () => {
            const { resetForm, recordFormFillTime, setFormSubmittingState } = require('../js/ui/form.js');
            
            // Set form submitting state (starts submit timestamp)
            setFormSubmittingState(true);
            
            // Record a suggestion click after submission start
            recordFormFillTime();
            
            // Unlock submitting state
            setFormSubmittingState(false);

            document.getElementById('input-note').value = 'New Suggestion Filled';

            // Call resetForm (force = false)
            resetForm(false);

            // Expect form note to retain the new suggestion value because reset was skipped
            expect(document.getElementById('input-note').value).toBe('New Suggestion Filled');
        });
    });

    describe('Hide Transfer Filter on Add Page Selected Day Transactions', () => {
        it('should exclude Transfer transactions when state.hideTransfer is true', () => {
            const { renderSelectedDayTransactions } = require('../js/ui/dashboard.js');
            document.getElementById('input-date').value = '2026-07-19';
            if (!document.getElementById('selected-day-tbody')) {
                document.body.insertAdjacentHTML('beforeend', '<table><tbody id="selected-day-tbody"></tbody></table>');
            }
            state.expenses = [
                { id: 1, date: '2026-07-19', amount: 500, category: 'Food', txnType: 'Expense', note: 'Lunch' },
                { id: 2, date: '2026-07-19', amount: 1000, category: 'Transfer', txnType: 'Transfer', note: 'Self transfer' }
            ];
            state.hideTransfer = true;
            state.hideIncome = false;
            state.hideInvestment = false;

            renderSelectedDayTransactions();

            const tbody = document.getElementById('selected-day-tbody');
            expect(tbody.innerHTML).toContain('Lunch');
            expect(tbody.innerHTML).not.toContain('Self transfer');
        });
    });

    describe('Tag Suggestions & Form Input', () => {
        it('should populate tag suggestions and handle click selection', () => {
            const { populateTagSuggestions } = require('../js/ui/form_dropdowns.js');
            document.body.innerHTML += `
                <div id="tag-suggestions" class="chip-group"></div>
                <input id="input-tag" />
            `;
            state.expenses = [
                { date: '2026-07-19', amount: 500, category: 'Food', tag: 'Vacation' },
                { date: '2026-07-18', amount: 300, category: 'Food', tag: 'Vacation' },
                { date: '2026-07-17', amount: 200, category: 'Travel', tag: 'ProjectX' }
            ];

            populateTagSuggestions();

            const container = document.getElementById('tag-suggestions');
            const chips = container.querySelectorAll('.chip');
            expect(chips.length).toBeGreaterThanOrEqual(2);
            expect(container.innerHTML).toContain('Vacation');
            expect(container.innerHTML).toContain('ProjectX');

            // Click chip to fill
            const tagInput = document.getElementById('input-tag');
            chips[0].click();
            expect(tagInput.value).toBe(chips[0].dataset.value);
            expect(chips[0].classList.contains('active')).toBe(true);

            // Click again to toggle off
            chips[0].click();
            expect(tagInput.value).toBe('');
            expect(chips[0].classList.contains('active')).toBe(false);
        });

        it('should only show tags from last 3 months, ordered by occurrences descending, capped at 5', () => {
            const { populateTagSuggestions } = require('../js/ui/form_dropdowns.js');
            document.body.innerHTML = `
                <div id="tag-suggestions" class="chip-group"></div>
                <input id="input-tag" />
            `;
            const now = new Date();
            const fmt = (daysAgo) => {
                const d = new Date(now);
                d.setDate(d.getDate() - daysAgo);
                return d.toISOString().split('T')[0];
            };

            state.expenses = [
                { date: fmt(10), amount: 100, tag: 'TagA' },
                { date: fmt(15), amount: 100, tag: 'TagA' },
                { date: fmt(20), amount: 100, tag: 'TagA' }, // TagA: 3
                { date: fmt(5), amount: 100, tag: 'TagB' },
                { date: fmt(12), amount: 100, tag: 'TagB' }, // TagB: 2
                { date: fmt(2), amount: 100, tag: 'TagC' },  // TagC: 1
                { date: fmt(3), amount: 100, tag: 'TagD' },  // TagD: 1
                { date: fmt(4), amount: 100, tag: 'TagE' },  // TagE: 1
                { date: fmt(6), amount: 100, tag: 'TagF' },  // TagF: 1 (should be omitted due to limit 5)
                { date: fmt(120), amount: 100, tag: 'TagOld' }, // TagOld: > 3 months (should be omitted)
                { date: fmt(130), amount: 100, tag: 'TagOld' },
                { date: fmt(140), amount: 100, tag: 'TagOld' }
            ];

            populateTagSuggestions();

            const container = document.getElementById('tag-suggestions');
            const chips = container.querySelectorAll('.chip');
            expect(chips.length).toBe(5);
            expect(chips[0].dataset.value).toBe('TagA'); // highest count first
            expect(chips[1].dataset.value).toBe('TagB');
            expect(container.innerHTML).not.toContain('TagOld');
        });
    });
});
