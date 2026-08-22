import { state } from '../js/core/state.js';
import {
    renderScheduledTransactions,
    startScheduledInlineEdit,
    cancelScheduledInlineEdit,
    saveScheduledInlineEdit,
    isScheduledInlineEditModified
} from '../js/ui/chart_builders.js';
import * as storage from '../js/services/storage.js';
import * as helpers from '../js/utils/helpers.js';

jest.mock('../js/services/storage.js', () => {
    const actual = jest.requireActual('../js/services/storage.js');
    return {
        ...actual,
        saveScheduledCSV: jest.fn().mockResolvedValue(true)
    };
});

jest.mock('../js/utils/helpers.js', () => {
    const actual = jest.requireActual('../js/utils/helpers.js');
    return {
        ...actual,
        editScheduledTransaction: jest.fn(),
        toast: jest.fn()
    };
});

function setupScheduledDOM() {
    document.body.innerHTML = `
        <table id="scheduled-table">
            <thead>
                <tr>
                    <th>Category</th>
                    <th>Type</th>
                    <th>Mode</th>
                    <th>Note</th>
                    <th>Amount</th>
                    <th>Freq</th>
                    <th>Next Run</th>
                    <th>Last Run</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody id="scheduled-tbody"></tbody>
        </table>
    `;
}

describe('Scheduled Transactions - Type/Mode Display and Desktop Inline Edit', () => {
    let originalInnerWidth;

    beforeEach(() => {
        originalInnerWidth = window.innerWidth;
        window.innerWidth = 1024; // Desktop by default
        setupScheduledDOM();
        jest.clearAllMocks();

        state.categories = ['Food', 'Utilities', 'Salary', 'Investment'];
        state.txnTypes = ['Expense', 'Refund', 'Income', 'Investment', 'Transfer'];
        state.txnModes = ['UPI', 'Credit Card', 'Cash', 'Net Banking'];
        state.inlineEditSchedIdx = null;
        state.cloudSyncInProgress = false;

        state.scheduledTransactions = [
            {
                id: 'sched-1',
                disabled: false,
                amount: 1500,
                amountExpression: '1000+500',
                currency: 'INR',
                category: 'Utilities',
                txnType: 'Expense',
                txnMode: 'Credit Card',
                note: 'Monthly Electricity Bill',
                frequency: 'monthly',
                recur_day: 15,
                next_run_date: '2026-10-15',
                last_run_date: '2026-09-15'
            },
            {
                id: 'sched-2',
                disabled: false,
                amount: -50000,
                amountExpression: '',
                currency: 'INR',
                category: 'Salary',
                txnType: 'Income',
                txnMode: 'Net Banking',
                note: 'Monthly Paycheck',
                frequency: 'monthly',
                recur_day: 1,
                next_run_date: '2026-10-01',
                last_run_date: '2026-09-01'
            }
        ];
    });

    afterEach(() => {
        window.innerWidth = originalInnerWidth;
    });

    test('renders Category, Type, Mode, Note, Amount columns in normal view', () => {
        renderScheduledTransactions();

        const rows = document.querySelectorAll('#scheduled-tbody tr');
        expect(rows.length).toBe(2);

        const firstRow = rows[0];
        expect(firstRow.querySelector('td[data-label="Category"]').textContent).toBe('Utilities');
        expect(firstRow.querySelector('td[data-label="Type"]').textContent).toContain('Expense');
        expect(firstRow.querySelector('td[data-label="Mode"]').textContent).toContain('Credit Card');
        expect(firstRow.querySelector('td[data-label="Note"]').textContent).toContain('Monthly Electricity Bill');
        expect(firstRow.querySelector('td[data-label="Amount"]').textContent).toContain('1,500.00');

        const secondRow = rows[1];
        expect(secondRow.querySelector('td[data-label="Type"]').textContent).toContain('Income');
        expect(secondRow.querySelector('td[data-label="Mode"]').textContent).toContain('Net Banking');
    });

    test('startScheduledInlineEdit enters inline edit on desktop (> 860px)', () => {
        window.innerWidth = 1024;
        startScheduledInlineEdit(0);

        expect(state.inlineEditSchedIdx).toBe(0);
        const amtInput = document.getElementById('sched-inline-amount-0');
        const catSelect = document.getElementById('sched-inline-category-0');
        const typeSelect = document.getElementById('sched-inline-type-0');
        const modeSelect = document.getElementById('sched-inline-mode-0');
        const noteInput = document.getElementById('sched-inline-note-0');

        expect(amtInput).toBeTruthy();
        expect(amtInput.value).toBe('1000+500');
        expect(catSelect.value).toBe('Utilities');
        expect(typeSelect.value).toBe('Expense');
        expect(modeSelect.value).toBe('Credit Card');
        expect(noteInput.value).toBe('Monthly Electricity Bill');
    });

    test('startScheduledInlineEdit falls back to editScheduledTransaction on mobile (<= 860px)', () => {
        window.innerWidth = 400;
        startScheduledInlineEdit(0);

        expect(state.inlineEditSchedIdx).toBeNull();
        expect(helpers.editScheduledTransaction).toHaveBeenCalledWith(0);
        expect(document.getElementById('sched-inline-amount-0')).toBeNull();
    });

    test('cancelScheduledInlineEdit resets state and re-renders table', () => {
        startScheduledInlineEdit(0);
        expect(state.inlineEditSchedIdx).toBe(0);

        cancelScheduledInlineEdit();
        expect(state.inlineEditSchedIdx).toBeNull();
        expect(document.getElementById('sched-inline-amount-0')).toBeNull();
    });

    test('live math expression evaluation updates preview pill', () => {
        startScheduledInlineEdit(0);
        const amtInput = document.getElementById('sched-inline-amount-0');
        const previewPill = document.getElementById('sched-inline-preview-0');

        expect(previewPill.style.display).toBe('inline-block');
        expect(previewPill.textContent).toContain('1,500.00');

        amtInput.value = '2000 + 500';
        amtInput.dispatchEvent(new Event('input'));
        expect(previewPill.textContent).toContain('2,500.00');

        amtInput.value = 'invalid@@';
        amtInput.dispatchEvent(new Event('input'));
        expect(previewPill.textContent).toBe('Invalid expression');
    });

    test('live preview adjusts sign when txnType changes', () => {
        startScheduledInlineEdit(0);
        const amtInput = document.getElementById('sched-inline-amount-0');
        const typeSelect = document.getElementById('sched-inline-type-0');
        const previewPill = document.getElementById('sched-inline-preview-0');

        amtInput.value = '100 + 50';
        amtInput.dispatchEvent(new Event('input'));
        expect(previewPill.textContent).toContain('₹150.00');

        typeSelect.value = 'Income';
        typeSelect.dispatchEvent(new Event('change'));
        expect(previewPill.textContent).toContain('-₹150.00');
    });

    test('isScheduledInlineEditModified detects changes', () => {
        startScheduledInlineEdit(0);
        expect(isScheduledInlineEditModified(0)).toBe(false);

        const noteInput = document.getElementById('sched-inline-note-0');
        noteInput.value = 'Updated Bill';
        expect(isScheduledInlineEditModified(0)).toBe(true);

        noteInput.value = 'Monthly Electricity Bill';
        expect(isScheduledInlineEditModified(0)).toBe(false);

        const catSelect = document.getElementById('sched-inline-category-0');
        catSelect.value = 'Food';
        expect(isScheduledInlineEditModified(0)).toBe(true);
    });

    test('saveScheduledInlineEdit validates empty or invalid amount', async () => {
        startScheduledInlineEdit(0);
        const amtInput = document.getElementById('sched-inline-amount-0');

        amtInput.value = '   ';
        await saveScheduledInlineEdit(0);
        expect(helpers.toast).toHaveBeenCalledWith('Please enter an amount', 'error');
        expect(storage.saveScheduledCSV).not.toHaveBeenCalled();

        amtInput.value = 'abc!';
        await saveScheduledInlineEdit(0);
        expect(helpers.toast).toHaveBeenCalledWith('Invalid characters in amount expression', 'error');
        expect(storage.saveScheduledCSV).not.toHaveBeenCalled();
    });

    test('saveScheduledInlineEdit saves valid changes and updates cloud storage', async () => {
        startScheduledInlineEdit(0);
        const amtInput = document.getElementById('sched-inline-amount-0');
        const catSelect = document.getElementById('sched-inline-category-0');
        const typeSelect = document.getElementById('sched-inline-type-0');
        const modeSelect = document.getElementById('sched-inline-mode-0');
        const noteInput = document.getElementById('sched-inline-note-0');

        amtInput.value = '2000 + 300';
        catSelect.value = 'Utilities';
        typeSelect.value = 'Expense';
        modeSelect.value = 'UPI';
        noteInput.value = 'Power & Water Bill';

        await saveScheduledInlineEdit(0);

        expect(storage.saveScheduledCSV).toHaveBeenCalledTimes(1);
        expect(state.scheduledTransactions[0].amount).toBe(2300);
        expect(state.scheduledTransactions[0].amountExpression).toBe('2000 + 300');
        expect(state.scheduledTransactions[0].txnMode).toBe('UPI');
        expect(state.scheduledTransactions[0].note).toBe('Power & Water Bill');
        expect(state.inlineEditSchedIdx).toBeNull();
        expect(helpers.toast).toHaveBeenCalledWith('Scheduled transaction updated!', 'success');
    });

    test('saveScheduledInlineEdit correctly negates amount for Income and Refund types', async () => {
        startScheduledInlineEdit(0);
        const amtInput = document.getElementById('sched-inline-amount-0');
        const typeSelect = document.getElementById('sched-inline-type-0');

        amtInput.value = '500';
        typeSelect.value = 'Income';

        await saveScheduledInlineEdit(0);

        expect(state.scheduledTransactions[0].amount).toBe(-500);
        expect(state.scheduledTransactions[0].txnType).toBe('Income');
    });

    test('blocks save when cloudSyncInProgress is true', async () => {
        state.cloudSyncInProgress = true;
        startScheduledInlineEdit(0);

        await saveScheduledInlineEdit(0);
        expect(helpers.toast).toHaveBeenCalledWith('Please wait for cloud sync to complete...', 'error');
        expect(storage.saveScheduledCSV).not.toHaveBeenCalled();
    });

    test('keyboard events: Enter saves and Escape cancels', async () => {
        startScheduledInlineEdit(0);
        const noteInput = document.getElementById('sched-inline-note-0');

        // Test Escape
        noteInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(state.inlineEditSchedIdx).toBeNull();

        // Re-open and test Enter
        startScheduledInlineEdit(0);
        const amtInput = document.getElementById('sched-inline-amount-0');
        amtInput.value = '999';
        amtInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

        // Wait microtasks
        await Promise.resolve();
        expect(storage.saveScheduledCSV).toHaveBeenCalled();
    });
});
