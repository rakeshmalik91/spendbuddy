import { isWithinLast3Days, showScheduledApprovalModal, setupScheduledApproval, closeScheduledModal, isScheduledModalOpen, executeScheduledCommit } from '../js/ui/scheduled_approval.js';
import { processScheduledTransactions } from '../js/services/storage.js';
import { state } from '../js/core/state.js';
import { getLocalDateString, parseLocalDate } from '../js/utils/date_helpers.js';

// Helper to get date shifted by N days
function shiftDays(baseDateStr, days) {
    const d = parseLocalDate(baseDateStr);
    d.setDate(d.getDate() + days);
    return getLocalDateString(d);
}

describe('Scheduled Approval Feature', () => {
    const today = getLocalDateString();

    beforeEach(() => {
        state.expenses = [];
        state.scheduledTransactions = [];
        state.categories = ['Food', 'Bills', 'Shopping', 'Others'];
        state.pendingScheduledTransactions = [];
        state.fileHashes = {};

        document.body.innerHTML = `
            <div class="modal-overlay" id="scheduled-modal-overlay" style="display: none;">
                <div class="modal card">
                    <button type="button" id="scheduled-modal-close-btn" class="close-btn">&times;</button>
                    <input type="checkbox" id="scheduled-select-all" checked>
                    <span id="scheduled-count">0 transactions</span>
                    <div id="scheduled-approval-list"></div>
                    <button id="scheduled-modal-discard">Discard All</button>
                    <button id="scheduled-modal-approve">Approve Selected</button>
                </div>
            </div>
            <div id="dashboard-quick-add" style="display: none;"></div>
        `;
        setupScheduledApproval();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('isWithinLast3Days', () => {
        it('returns true for today (0 days ago)', () => {
            expect(isWithinLast3Days('2026-09-17', '2026-09-17')).toBe(true);
        });

        it('returns true for yesterday (1 day ago)', () => {
            expect(isWithinLast3Days('2026-09-16', '2026-09-17')).toBe(true);
        });

        it('returns true for 2 days ago', () => {
            expect(isWithinLast3Days('2026-09-15', '2026-09-17')).toBe(true);
        });

        it('returns true for exactly 3 days ago', () => {
            expect(isWithinLast3Days('2026-09-14', '2026-09-17')).toBe(true);
        });

        it('returns false for 4 days ago', () => {
            expect(isWithinLast3Days('2026-09-13', '2026-09-17')).toBe(false);
        });

        it('returns false for 10 days ago', () => {
            expect(isWithinLast3Days('2026-09-07', '2026-09-17')).toBe(false);
        });

        it('returns false for a future date', () => {
            expect(isWithinLast3Days('2026-09-18', '2026-09-17')).toBe(false);
        });

        it('returns false for empty or null date', () => {
            expect(isWithinLast3Days('', '2026-09-17')).toBe(false);
            expect(isWithinLast3Days(null, '2026-09-17')).toBe(false);
        });
    });

    describe('processScheduledTransactions conditional behavior', () => {
        it('silently adds when there is just a single transaction within the last 3 days', async () => {
            const formModule = require('../js/ui/form.js');
            const storageModule = require('../js/services/storage.js');

            const spySaveYear = jest.spyOn(formModule, 'saveYearCSV').mockResolvedValue();
            const spySaveSched = jest.spyOn(storageModule, 'saveScheduledCSV').mockResolvedValue();

            const yesterday = shiftDays(today, -1);

            // Single transaction due yesterday (1 day ago <= 3 days)
            state.scheduledTransactions = [{
                id: 'sched_single_recent',
                frequency: 'monthly',
                amount: 350,
                category: 'Bills',
                txnType: 'Expense',
                txnMode: 'UPI',
                note: 'Electricity',
                start_date: yesterday,
                next_run_date: yesterday,
                run_count: 0,
                disabled: false
            }];

            const result = await storageModule.processScheduledTransactions();

            // Silently added
            expect(result).toBe(true);
            expect(state.expenses.length).toBe(1);
            expect(state.expenses[0].amount).toBe(350);
            expect(state.expenses[0].note).toBe('Electricity');
            expect(state.expenses[0].date).toBe(yesterday);
            expect(spySaveYear).toHaveBeenCalledWith(yesterday.slice(0, 4));
            expect(spySaveSched).toHaveBeenCalled();

            // Modal must NOT be open
            const overlay = document.getElementById('scheduled-modal-overlay');
            expect(overlay.style.display).toBe('none');
        });

        it('shows approval modal when single transaction is older than 3 days', async () => {
            const formModule = require('../js/ui/form.js');
            const storageModule = require('../js/services/storage.js');

            const spySaveYear = jest.spyOn(formModule, 'saveYearCSV').mockResolvedValue();
            const spySaveSched = jest.spyOn(storageModule, 'saveScheduledCSV').mockResolvedValue();

            const fiveDaysAgo = shiftDays(today, -5);

            // Single transaction due 5 days ago (> 3 days)
            state.scheduledTransactions = [{
                id: 'sched_single_overdue',
                frequency: 'monthly',
                amount: 1200,
                category: 'Food',
                txnType: 'Expense',
                txnMode: 'Card',
                note: 'Groceries',
                start_date: fiveDaysAgo,
                next_run_date: fiveDaysAgo,
                run_count: 0,
                disabled: false
            }];

            const result = await storageModule.processScheduledTransactions();

            // Must NOT add to expenses yet
            expect(result).toBe(false);
            expect(state.expenses.length).toBe(0);
            expect(spySaveYear).not.toHaveBeenCalled();

            // Modal must be open with the 1 transaction listed
            const overlay = document.getElementById('scheduled-modal-overlay');
            expect(overlay.style.display).toBe('flex');
            const items = document.querySelectorAll('.scheduled-card');
            expect(items.length).toBe(1);
            expect(document.getElementById('scheduled-count').textContent).toContain('1 transaction');
        });

        it('shows approval modal when multiple transactions are due (even if within 3 days)', async () => {
            const formModule = require('../js/ui/form.js');
            const storageModule = require('../js/services/storage.js');

            const spySaveYear = jest.spyOn(formModule, 'saveYearCSV').mockResolvedValue();

            // 2 transactions both due today
            state.scheduledTransactions = [
                {
                    id: 'sched_1',
                    frequency: 'monthly',
                    amount: 500,
                    category: 'Bills',
                    txnType: 'Expense',
                    txnMode: 'UPI',
                    note: 'Internet',
                    start_date: today,
                    next_run_date: today,
                    run_count: 0,
                    disabled: false
                },
                {
                    id: 'sched_2',
                    frequency: 'monthly',
                    amount: 200,
                    category: 'Food',
                    txnType: 'Expense',
                    txnMode: 'UPI',
                    note: 'Coffee',
                    start_date: today,
                    next_run_date: today,
                    run_count: 0,
                    disabled: false
                }
            ];

            const result = await storageModule.processScheduledTransactions();

            // Must NOT add to expenses yet
            expect(result).toBe(false);
            expect(state.expenses.length).toBe(0);
            expect(spySaveYear).not.toHaveBeenCalled();

            // Modal must be open with 2 transactions listed
            const overlay = document.getElementById('scheduled-modal-overlay');
            expect(overlay.style.display).toBe('flex');
            const items = document.querySelectorAll('.scheduled-card');
            expect(items.length).toBe(2);
            expect(document.getElementById('scheduled-count').textContent).toContain('2 transactions');
        });
    });

    describe('Modal User Actions', () => {
        it('approves only selected transactions and advances schedules', async () => {
            const formModule = require('../js/ui/form.js');
            const storageModule = require('../js/services/storage.js');

            const spySaveYear = jest.spyOn(formModule, 'saveYearCSV').mockResolvedValue();
            const spySaveSched = jest.spyOn(storageModule, 'saveScheduledCSV').mockResolvedValue();

            const pastDate = shiftDays(today, -7);

            state.scheduledTransactions = [
                {
                    id: 'sched_a',
                    frequency: 'monthly',
                    amount: 1000,
                    category: 'Bills',
                    txnType: 'Expense',
                    txnMode: 'UPI',
                    note: 'Rent',
                    start_date: pastDate,
                    next_run_date: pastDate,
                    run_count: 0,
                    disabled: false
                },
                {
                    id: 'sched_b',
                    frequency: 'monthly',
                    amount: 50,
                    category: 'Food',
                    txnType: 'Expense',
                    txnMode: 'UPI',
                    note: 'Tea',
                    start_date: pastDate,
                    next_run_date: pastDate,
                    run_count: 0,
                    disabled: false
                }
            ];

            await storageModule.processScheduledTransactions();

            const checkboxes = document.querySelectorAll('.scheduled-checkbox');
            expect(checkboxes.length).toBe(2);

            // Uncheck the second transaction
            checkboxes[1].checked = false;
            checkboxes[1].dispatchEvent(new Event('change', { bubbles: true }));

            // Click Approve Selected
            document.getElementById('scheduled-modal-approve').click();

            // Wait for async handler
            await new Promise(r => setTimeout(r, 10));

            // Only the first transaction should be in state.expenses
            expect(state.expenses.length).toBe(1);
            expect(state.expenses[0].note).toBe('Rent');
            expect(state.expenses[0].amount).toBe(1000);

            // Both schedules should be advanced past pastDate
            expect(state.scheduledTransactions[0].next_run_date).not.toBe(pastDate);
            expect(state.scheduledTransactions[1].next_run_date).not.toBe(pastDate);

            expect(spySaveYear).toHaveBeenCalledWith(pastDate.slice(0, 4));
            expect(spySaveSched).toHaveBeenCalled();

            // Modal should be closed
            expect(document.getElementById('scheduled-modal-overlay').style.display).toBe('none');
        });

        it('discards all transactions without adding to expenses and advances schedules', async () => {
            const formModule = require('../js/ui/form.js');
            const storageModule = require('../js/services/storage.js');

            const spySaveYear = jest.spyOn(formModule, 'saveYearCSV').mockResolvedValue();
            const spySaveSched = jest.spyOn(storageModule, 'saveScheduledCSV').mockResolvedValue();

            const pastDate = shiftDays(today, -10);

            state.scheduledTransactions = [
                {
                    id: 'sched_discard_test',
                    frequency: 'monthly',
                    amount: 500,
                    category: 'Bills',
                    txnType: 'Expense',
                    txnMode: 'UPI',
                    note: 'Subscription',
                    start_date: pastDate,
                    next_run_date: pastDate,
                    run_count: 0,
                    disabled: false
                }
            ];

            await storageModule.processScheduledTransactions();

            // Click Discard All
            document.getElementById('scheduled-modal-discard').click();

            // Wait for async handler
            await new Promise(r => setTimeout(r, 10));

            // Expenses must be empty
            expect(state.expenses.length).toBe(0);
            expect(spySaveYear).not.toHaveBeenCalled();

            // Schedule advanced past pastDate
            expect(state.scheduledTransactions[0].next_run_date).not.toBe(pastDate);
            expect(spySaveSched).toHaveBeenCalled();

            // Modal closed
            expect(document.getElementById('scheduled-modal-overlay').style.display).toBe('none');
        });

        it('closes modal without adding or advancing when close button is clicked', async () => {
            const storageModule = require('../js/services/storage.js');
            const pastDate = shiftDays(today, -8);

            state.scheduledTransactions = [
                {
                    id: 'sched_close_test',
                    frequency: 'monthly',
                    amount: 700,
                    category: 'Shopping',
                    txnType: 'Expense',
                    txnMode: 'Card',
                    note: 'Shoes',
                    start_date: pastDate,
                    next_run_date: pastDate,
                    run_count: 0,
                    disabled: false
                }
            ];

            await storageModule.processScheduledTransactions();
            expect(document.getElementById('scheduled-modal-overlay').style.display).toBe('flex');

            // Click close button
            document.getElementById('scheduled-modal-close-btn').click();

            expect(document.getElementById('scheduled-modal-overlay').style.display).toBe('none');
            // Schedule still has original date
            expect(state.scheduledTransactions[0].next_run_date).toBe(pastDate);
            expect(state.expenses.length).toBe(0);
        });

        it('select-all toggles all checkboxes and updates approve button state', async () => {
            const storageModule = require('../js/services/storage.js');
            const pastDate = shiftDays(today, -6);

            state.scheduledTransactions = [
                {
                    id: 'sched_x',
                    frequency: 'monthly',
                    amount: 100,
                    category: 'Food',
                    txnType: 'Expense',
                    txnMode: 'UPI',
                    start_date: pastDate,
                    next_run_date: pastDate
                },
                {
                    id: 'sched_y',
                    frequency: 'monthly',
                    amount: 200,
                    category: 'Food',
                    txnType: 'Expense',
                    txnMode: 'UPI',
                    start_date: pastDate,
                    next_run_date: pastDate
                }
            ];

            await storageModule.processScheduledTransactions();

            const selectAll = document.getElementById('scheduled-select-all');
            const approveBtn = document.getElementById('scheduled-modal-approve');
            expect(approveBtn.textContent).toContain('(2)');

            // Uncheck select all
            selectAll.checked = false;
            selectAll.dispatchEvent(new Event('change'));

            const checkboxes = document.querySelectorAll('.scheduled-checkbox');
            expect(checkboxes[0].checked).toBe(false);
            expect(checkboxes[1].checked).toBe(false);
            expect(approveBtn.disabled).toBe(true);

            // Re-check select all
            selectAll.checked = true;
            selectAll.dispatchEvent(new Event('change'));

            expect(checkboxes[0].checked).toBe(true);
            expect(checkboxes[1].checked).toBe(true);
            expect(approveBtn.disabled).toBe(false);
            expect(approveBtn.textContent).toContain('(2)');
        });
    });
});
