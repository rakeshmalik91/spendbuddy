import { state } from '../js/core/state.js';
import * as batchUpdate from '../js/ui/batch_update.js';
import * as formModule from '../js/ui/form.js';
import * as filters from '../js/ui/filters.js';
import * as renderAllModule from '../js/ui/render_all.js';

jest.mock('../js/ui/form.js', () => ({
    saveYearCSV: jest.fn().mockResolvedValue(true)
}));

jest.mock('../js/ui/render_all.js', () => ({
    renderAll: jest.fn()
}));

jest.mock('../js/ui/filters.js', () => ({
    getFilteredExpenses: jest.fn()
}));

function setupTestDOM() {
    document.body.innerHTML = `
        <div id="batch-action-bar" class="batch-action-bar">
            <span id="batch-selected-count">0 selected</span>
            <input type="checkbox" id="batch-select-all" />
        </div>
        <table id="all-table">
            <tbody id="all-tbody">
                <tr class="month-header">
                    <td><input type="checkbox" class="batch-select-checkbox batch-select-month" data-month="2026-07" /></td>
                </tr>
                <tr class="day-separator">
                    <td><input type="checkbox" class="batch-select-checkbox batch-select-day" data-date="2026-07-19" /></td>
                </tr>
                <tr id="txn-row-0">
                    <td><input type="checkbox" class="batch-select-checkbox" data-real-idx="0" /></td>
                </tr>
                <tr id="txn-row-1">
                    <td><input type="checkbox" class="batch-select-checkbox" data-real-idx="1" /></td>
                </tr>
                <tr id="txn-row-2">
                    <td><input type="checkbox" class="batch-select-checkbox" data-real-idx="2" /></td>
                </tr>
            </tbody>
        </table>
        <div id="modal-batch-update-overlay">
            <div id="modal-batch-update">
                <span id="batch-current-category"></span>
                <input type="checkbox" id="batch-enable-category" />
                <select id="batch-input-category">
                    <option value="Food & Dining">Food & Dining</option>
                    <option value="Groceries">Groceries</option>
                </select>

                <span id="batch-current-txn-mode"></span>
                <input type="checkbox" id="batch-enable-txn-mode" />
                <select id="batch-input-txn-mode">
                    <option value="Credit Card">Credit Card</option>
                    <option value="UPI">UPI</option>
                </select>

                <span id="batch-current-txn-type"></span>
                <input type="checkbox" id="batch-enable-txn-type" />
                <select id="batch-input-txn-type">
                    <option value="Expense">Expense</option>
                    <option value="Income">Income</option>
                    <option value="Refund">Refund</option>
                    <option value="Investment">Investment</option>
                </select>

                <span id="batch-current-date"></span>
                <input type="checkbox" id="batch-enable-date" />
                <input type="date" id="batch-input-date" />

                <span id="batch-current-location"></span>
                <input type="checkbox" id="batch-enable-location" />
                <input type="text" id="batch-input-location" />
                <div id="batch-location-suggestions"></div>

                <span id="batch-current-tag"></span>
                <input type="checkbox" id="batch-enable-tag" />
                <input type="text" id="batch-input-tag" />
                <div id="batch-tag-suggestions"></div>

                <button id="btn-batch-apply">Apply</button>
                <button id="btn-batch-cancel">Cancel</button>
            </div>
        </div>
    `;
}

describe('Batch Update Module', () => {
    beforeEach(() => {
        setupTestDOM();
        jest.clearAllMocks();

        state.expenses = [
            { id: 1, date: '2026-07-19', amount: 500, category: 'Food', txnMode: 'UPI', txnType: 'Expense', location: 'Delhi', tag: 'Lunch', note: 'Zomato' },
            { id: 2, date: '2026-07-18', amount: 1500, category: 'Travel', txnMode: 'Cash', txnType: 'Expense', location: 'Noida', tag: '', note: 'Taxi' },
            { id: 3, date: '2025-12-10', amount: -200, category: 'Food', txnMode: 'UPI', txnType: 'Refund', location: 'Delhi', tag: 'Lunch', note: 'Refund' }
        ];

        filters.getFilteredExpenses.mockReturnValue(state.expenses);
        batchUpdate.clearSelection();
    });

    it('should toggle transaction selection individually', () => {
        batchUpdate.toggleTxnSelection(0, true);
        expect(batchUpdate.getSelectedTxnIndices().has(0)).toBe(true);
        expect(batchUpdate.getSelectedTxnIndices().size).toBe(1);

        batchUpdate.toggleTxnSelection(1, true);
        expect(batchUpdate.getSelectedTxnIndices().size).toBe(2);

        batchUpdate.toggleTxnSelection(0, false);
        expect(batchUpdate.getSelectedTxnIndices().has(0)).toBe(false);
        expect(batchUpdate.getSelectedTxnIndices().size).toBe(1);
    });

    it('should clear selection completely', () => {
        batchUpdate.toggleTxnSelection(0, true);
        batchUpdate.toggleTxnSelection(1, true);
        expect(batchUpdate.getSelectedTxnIndices().size).toBe(2);

        batchUpdate.clearSelection();
        expect(batchUpdate.getSelectedTxnIndices().size).toBe(0);
        expect(document.getElementById('batch-select-all').checked).toBe(false);
    });

    it('should toggle select all filtered transactions', () => {
        batchUpdate.toggleSelectAll(true);
        expect(batchUpdate.getSelectedTxnIndices().size).toBe(3);
        expect(batchUpdate.getSelectedTxnIndices().has(0)).toBe(true);
        expect(batchUpdate.getSelectedTxnIndices().has(1)).toBe(true);
        expect(batchUpdate.getSelectedTxnIndices().has(2)).toBe(true);

        batchUpdate.toggleSelectAll(false);
        expect(batchUpdate.getSelectedTxnIndices().size).toBe(0);
    });

    it('should update batch action bar counts and visibility', () => {
        const bar = document.getElementById('batch-action-bar');
        const countBadge = document.getElementById('batch-selected-count');

        batchUpdate.toggleTxnSelection(0, true);
        batchUpdate.updateBatchActionBar();
        expect(bar.classList.contains('show')).toBe(true);
        expect(countBadge.textContent).toBe('1 selected');

        batchUpdate.toggleTxnSelection(0, false);
        batchUpdate.updateBatchActionBar();
        expect(bar.classList.contains('show')).toBe(false);
    });

    it('should batch update category, mode, tag, and location across selected transactions', async () => {
        batchUpdate.toggleTxnSelection(0, true);
        batchUpdate.toggleTxnSelection(1, true);

        // Enable category, txnMode, location, and tag
        document.getElementById('batch-enable-category').checked = true;
        document.getElementById('batch-input-category').value = 'Groceries';

        document.getElementById('batch-enable-txn-mode').checked = true;
        document.getElementById('batch-input-txn-mode').value = 'Credit Card';

        document.getElementById('batch-enable-location').checked = true;
        document.getElementById('batch-input-location').value = 'Gurugram';

        document.getElementById('batch-enable-tag').checked = true;
        document.getElementById('batch-input-tag').value = 'WeeklyShop';

        await batchUpdate.applyBatchUpdate();

        // Check updated expenses
        expect(state.expenses[0].category).toBe('Groceries');
        expect(state.expenses[0].txnMode).toBe('Credit Card');
        expect(state.expenses[0].location).toBe('Gurugram');
        expect(state.expenses[0].tag).toBe('WeeklyShop');

        expect(state.expenses[1].category).toBe('Groceries');
        expect(state.expenses[1].txnMode).toBe('Credit Card');
        expect(state.expenses[1].location).toBe('Gurugram');
        expect(state.expenses[1].tag).toBe('WeeklyShop');

        // Unselected item remains unchanged
        expect(state.expenses[2].category).toBe('Food');
        expect(state.expenses[2].location).toBe('Delhi');

        // Verify saveYearCSV called for year 2026
        expect(formModule.saveYearCSV).toHaveBeenCalledWith('2026');
        expect(renderAllModule.renderAll).toHaveBeenCalled();
    });

    it('should adjust amount sign when transaction type is batch updated to Income/Refund', async () => {
        batchUpdate.toggleTxnSelection(0, true); // Expense 500

        document.getElementById('batch-enable-txn-type').checked = true;
        document.getElementById('batch-input-txn-type').value = 'Income';

        await batchUpdate.applyBatchUpdate();

        expect(state.expenses[0].txnType).toBe('Income');
        expect(state.expenses[0].amount).toBe(-500);
    });

    it('should handle multi-year batch updates and call saveYearCSV for each affected year', async () => {
        batchUpdate.toggleTxnSelection(0, true); // 2026 item
        batchUpdate.toggleTxnSelection(2, true); // 2025 item

        document.getElementById('batch-enable-tag').checked = true;
        document.getElementById('batch-input-tag').value = 'Special';

        await batchUpdate.applyBatchUpdate();

        expect(formModule.saveYearCSV).toHaveBeenCalledWith('2026');
        expect(formModule.saveYearCSV).toHaveBeenCalledWith('2025');
    });

    it('should display current values across selected transactions when opening modal', () => {
        batchUpdate.toggleTxnSelection(0, true); // Food, UPI, Expense, 2026-07-19, Delhi, Lunch
        batchUpdate.toggleTxnSelection(1, true); // Travel, Cash, Expense, 2026-07-18, Noida, (empty tag)

        batchUpdate.openBatchUpdateModal();

        expect(document.getElementById('batch-current-category').textContent).toBe('Current: Food, Travel');
        expect(document.getElementById('batch-current-txn-mode').textContent).toBe('Current: UPI, Cash');
        expect(document.getElementById('batch-current-txn-type').textContent).toBe('Current: Expense');
        expect(document.getElementById('batch-current-location').textContent).toBe('Current: Delhi, Noida');
        expect(document.getElementById('batch-current-tag').textContent).toBe('Current: Lunch, (empty)');
    });

    it('should prefill inputs when all selected transactions share a single value', () => {
        // Items 0 and 2: Both have Location 'Delhi', Tag 'Lunch'
        batchUpdate.toggleTxnSelection(0, true); // Food, UPI, Expense, 2026-07-19, Delhi, Lunch
        batchUpdate.toggleTxnSelection(2, true); // Food, UPI, Refund, 2025-12-10, Delhi, Lunch

        batchUpdate.openBatchUpdateModal();

        // Shared values should be prefilled
        expect(document.getElementById('batch-input-category').value).toBe('Food');
        expect(document.getElementById('batch-input-txn-mode').value).toBe('UPI');
        expect(document.getElementById('batch-input-location').value).toBe('Delhi');
        expect(document.getElementById('batch-input-tag').value).toBe('Lunch');

        // Non-shared values (Date, TxnType) should NOT be prefilled to either value
        expect(document.getElementById('batch-input-date').value).toBe('');
    });

    it('should toggle all transactions for a specific day using toggleDaySelection', () => {
        batchUpdate.toggleDaySelection('2026-07-19', true);

        expect(batchUpdate.getSelectedTxnIndices().has(0)).toBe(true); // 2026-07-19 item
        expect(batchUpdate.getSelectedTxnIndices().has(1)).toBe(false); // 2026-07-18 item
        expect(document.querySelector('.batch-select-day[data-date="2026-07-19"]').checked).toBe(true);

        // Deselect day
        batchUpdate.toggleDaySelection('2026-07-19', false);
        expect(batchUpdate.getSelectedTxnIndices().has(0)).toBe(false);
        expect(document.querySelector('.batch-select-day[data-date="2026-07-19"]').checked).toBe(false);
    });

    it('should toggle all transactions for a specific month using toggleMonthSelection', () => {
        batchUpdate.toggleMonthSelection('2026-07', true);

        expect(batchUpdate.getSelectedTxnIndices().has(0)).toBe(true); // 2026-07 item
        expect(batchUpdate.getSelectedTxnIndices().has(1)).toBe(true); // 2026-07 item
        expect(batchUpdate.getSelectedTxnIndices().has(2)).toBe(false); // 2025-12 item
        expect(document.querySelector('.batch-select-month[data-month="2026-07"]').checked).toBe(true);

        // Deselect month
        batchUpdate.toggleMonthSelection('2026-07', false);
        expect(batchUpdate.getSelectedTxnIndices().has(0)).toBe(false);
        expect(batchUpdate.getSelectedTxnIndices().has(1)).toBe(false);
        expect(document.querySelector('.batch-select-month[data-month="2026-07"]').checked).toBe(false);
    });

    it('should set indeterminate state on month checkbox when only some items are selected', () => {
        batchUpdate.toggleTxnSelection(0, true); // Select 1 item in 2026-07

        const monthCheckbox = document.querySelector('.batch-select-month[data-month="2026-07"]');
        expect(monthCheckbox.checked).toBe(false);
        expect(monthCheckbox.indeterminate).toBe(true);
    });
});
