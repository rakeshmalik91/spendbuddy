import { state } from '../js/core/state.js';
import { startInlineEdit, saveInlineEdit, cancelInlineEdit, isInlineEditModified, renderTransactions } from '../js/ui/transactions.js';
import { openQuickEditModal } from '../js/ui/quick_edit_modal.js';
import { saveYearCSV, editEntry } from '../js/ui/form.js';

jest.mock('../js/ui/form.js', () => {
    const actual = jest.requireActual('../js/ui/form.js');
    return {
        ...actual,
        saveYearCSV: jest.fn().mockResolvedValue(true),
        editEntry: jest.fn()
    };
});

function setupTableDOM() {
    document.body.innerHTML = `
        <input type="checkbox" id="toggle-hide-source-txnid" />
        <input type="checkbox" id="toggle-merge-refunds-txn" />
        <table id="all-table">
            <tbody id="all-tbody"></tbody>
        </table>
        <div id="view-transactions"><div class="table-footer"></div></div>
    `;
}

describe('Desktop Inline Quick Edit', () => {
    let originalInnerWidth;

    beforeEach(() => {
        originalInnerWidth = window.innerWidth;
        window.innerWidth = 1024; // Desktop viewport
        setupTableDOM();
        jest.clearAllMocks();

        state.categories = ['Food', 'Shopping', 'Travel', 'Bills'];
        state.txnPageSize = 50;
        state.sortCol = 'date';
        state.sortAsc = false;
        state.timeDate = new Date('2026-09-12T00:00:00');
        state.inlineEditTxnIdx = null;

        state.expenses = [
            {
                date: '2026-09-12',
                amount: 250.00,
                amountExpression: '120+130',
                currency: 'INR',
                category: 'Food',
                txnType: 'Expense',
                txnMode: 'UPI',
                note: 'Lunch with team',
                location: 'Cyber Hub',
                tag: 'Work',
                source: 'SMS: HDFC Bank',
                txnId: 'TXN12345'
            },
            {
                date: '2026-09-10',
                amount: -150.00,
                amountExpression: '',
                currency: 'INR',
                category: 'Shopping',
                txnType: 'Refund',
                txnMode: 'Credit Card',
                note: 'Returned item',
                location: 'Mall',
                tag: 'Personal',
                source: 'Email',
                txnId: 'TXN67890'
            }
        ];
    });

    afterEach(() => {
        window.innerWidth = originalInnerWidth;
        state.inlineEditTxnIdx = null;
    });

    test('falls back to editEntry on mobile viewport (<= 860px)', () => {
        window.innerWidth = 800;
        startInlineEdit(0);
        expect(editEntry).toHaveBeenCalledWith(0);
        expect(state.inlineEditTxnIdx).toBeNull();
    });

    test('openQuickEditModal delegates to startInlineEdit', () => {
        openQuickEditModal(0);
        expect(state.inlineEditTxnIdx).toBe(0);
        const row = document.getElementById('txn-row-0');
        expect(row.classList.contains('quick-editing')).toBe(true);
    });

    test('activates inline inputs in table row on desktop (> 860px)', () => {
        renderTransactions();
        // Row is initially not in edit mode
        expect(document.getElementById('inline-edit-amount-0')).toBeNull();

        startInlineEdit(0);

        const row = document.getElementById('txn-row-0');
        expect(row.classList.contains('quick-editing')).toBe(true);

        const catSelect = document.getElementById('inline-edit-category-0');
        const amountInput = document.getElementById('inline-edit-amount-0');
        const noteInput = document.getElementById('inline-edit-note-0');
        const saveBtn = row.querySelector('.inline-btn-save');
        const cancelBtn = row.querySelector('.inline-btn-cancel');

        expect(catSelect).not.toBeNull();
        expect(catSelect.value).toBe('Food');
        expect(amountInput).not.toBeNull();
        expect(amountInput.value).toBe('120+130');
        expect(noteInput).not.toBeNull();
        expect(noteInput.value).toBe('Lunch with team');
        expect(saveBtn).not.toBeNull();
        expect(cancelBtn).not.toBeNull();
    });

    test('shows live arithmetic preview when expression is typed in inline input', () => {
        startInlineEdit(0);
        const amountInput = document.getElementById('inline-edit-amount-0');
        const preview = document.getElementById('inline-edit-preview-0');

        // Initial preview for 120+130
        expect(preview.style.display).not.toBe('none');
        expect(preview.textContent).toContain('250.00');

        // Type a new multi-term expression
        amountInput.value = '100+50*2';
        amountInput.dispatchEvent(new Event('input'));

        expect(preview.style.display).not.toBe('none');
        expect(preview.textContent).toContain('200.00');

        // Single number (no operators) -> preview hidden
        amountInput.value = '500';
        amountInput.dispatchEvent(new Event('input'));
        expect(preview.style.display).toBe('none');

        // Invalid characters
        amountInput.value = 'abc';
        amountInput.dispatchEvent(new Event('input'));
        expect(preview.style.display).not.toBe('none');
        expect(preview.textContent).toContain('Invalid');
    });

    test('shows negative live preview for Refund transaction', () => {
        startInlineEdit(1);
        const amountInput = document.getElementById('inline-edit-amount-1');
        const preview = document.getElementById('inline-edit-preview-1');

        amountInput.value = '100+50';
        amountInput.dispatchEvent(new Event('input'));

        expect(preview.style.display).not.toBe('none');
        expect(preview.textContent).toContain('-₹150.00');
    });

    test('saves modified fields and preserves all unedited transaction attributes', async () => {
        startInlineEdit(0);
        const catSelect = document.getElementById('inline-edit-category-0');
        const amountInput = document.getElementById('inline-edit-amount-0');
        const noteInput = document.getElementById('inline-edit-note-0');

        catSelect.value = 'Shopping';
        amountInput.value = '300+50';
        noteInput.value = 'Updated shopping note';

        await saveInlineEdit(0);

        // State updated
        const updated = state.expenses[0];
        expect(updated.category).toBe('Shopping');
        expect(updated.amount).toBe(350);
        expect(updated.amountExpression).toBe('300+50');
        expect(updated.note).toBe('Updated shopping note');

        // Preserved unedited fields
        expect(updated.date).toBe('2026-09-12');
        expect(updated.currency).toBe('INR');
        expect(updated.txnType).toBe('Expense');
        expect(updated.txnMode).toBe('UPI');
        expect(updated.location).toBe('Cyber Hub');
        expect(updated.tag).toBe('Work');
        expect(updated.source).toBe('SMS: HDFC Bank');
        expect(updated.txnId).toBe('TXN12345');

        // Cloud save invoked
        expect(saveYearCSV).toHaveBeenCalledWith('2026');

        // Exits edit mode
        expect(state.inlineEditTxnIdx).toBeNull();
        expect(document.getElementById('inline-edit-amount-0')).toBeNull();
    });

    test('preserves negative amount for Refund on save', async () => {
        startInlineEdit(1);
        const amountInput = document.getElementById('inline-edit-amount-1');
        amountInput.value = '200';

        await saveInlineEdit(1);

        const updated = state.expenses[1];
        expect(updated.amount).toBe(-200);
        expect(updated.amountExpression).toBe('');
    });

    test('cancels inline edit without saving', () => {
        startInlineEdit(0);
        expect(state.inlineEditTxnIdx).toBe(0);

        cancelInlineEdit();
        expect(state.inlineEditTxnIdx).toBeNull();
        expect(document.getElementById('inline-edit-amount-0')).toBeNull();
        expect(saveYearCSV).not.toHaveBeenCalled();
    });

    test('triggers inline edit on row double-click and includes Quick Edit in action menu for iPad/touch', () => {
        renderTransactions();
        const tbodyHtml = document.getElementById('all-tbody').innerHTML;

        // Must be in the action dropdown menu with .action-quick-edit and .show-on-ipad
        expect(tbodyHtml).toContain('action-dropdown-item action-quick-edit show-on-ipad');
        expect(tbodyHtml).toContain('startInlineEdit(0)');
        expect(tbodyHtml).toContain('⚡</span> Quick Edit');

        // Must be bound to ondblclick on the table row for desktop
        const row = document.getElementById('txn-row-0');
        expect(row).not.toBeNull();
        expect(row.getAttribute('ondblclick')).toBe("if (window.innerWidth > 860 && !event.target.closest('input, select, button, a, .action-dropdown-wrap, .badge-schedule-link')) startInlineEdit(0);");

        // Test calling startInlineEdit(0)
        expect(state.inlineEditTxnIdx).toBeNull();
        startInlineEdit(0);
        expect(state.inlineEditTxnIdx).toBe(0);
    });

    test('isInlineEditModified accurately detects whether fields have been edited', () => {
        startInlineEdit(0);
        // Initially untouched
        expect(isInlineEditModified(0)).toBe(false);

        const amtInput = document.getElementById('inline-edit-amount-0');
        const catSelect = document.getElementById('inline-edit-category-0');
        const noteInput = document.getElementById('inline-edit-note-0');

        // Modify note
        noteInput.value = 'Different note';
        expect(isInlineEditModified(0)).toBe(true);
        noteInput.value = 'Lunch with team'; // Revert back
        expect(isInlineEditModified(0)).toBe(false);

        // Modify category
        catSelect.value = 'Shopping';
        expect(isInlineEditModified(0)).toBe(true);
        catSelect.value = 'Food'; // Revert back
        expect(isInlineEditModified(0)).toBe(false);

        // Modify amount
        amtInput.value = '999';
        expect(isInlineEditModified(0)).toBe(true);
        amtInput.value = '120+130'; // Revert back
        expect(isInlineEditModified(0)).toBe(false);
    });

    test('cancels inline edit on click outside if not edited', () => {
        startInlineEdit(0);
        expect(state.inlineEditTxnIdx).toBe(0);
        expect(document.getElementById('inline-edit-amount-0')).not.toBeNull();

        // Simulate elapsed time past the 50ms guard
        state.inlineEditStartedAt = Date.now() - 100;

        // Click outside on document.body
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        // Should have cancelled inline edit
        expect(state.inlineEditTxnIdx).toBeNull();
        expect(document.getElementById('inline-edit-amount-0')).toBeNull();
    });

    test('does not cancel inline edit on click outside if fields were edited', () => {
        startInlineEdit(0);
        expect(state.inlineEditTxnIdx).toBe(0);

        const amtInput = document.getElementById('inline-edit-amount-0');
        amtInput.value = '400';

        // Simulate elapsed time past the 50ms guard
        state.inlineEditStartedAt = Date.now() - 100;

        // Click outside on document.body
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        // Should NOT have cancelled inline edit
        expect(state.inlineEditTxnIdx).toBe(0);
        expect(document.getElementById('inline-edit-amount-0')).not.toBeNull();
        expect(document.getElementById('inline-edit-amount-0').value).toBe('400');
    });

    test('does not cancel inline edit when clicking inside the editing row', () => {
        startInlineEdit(0);
        expect(state.inlineEditTxnIdx).toBe(0);

        const row = document.getElementById('txn-row-0');
        const amtInput = document.getElementById('inline-edit-amount-0');

        state.inlineEditStartedAt = Date.now() - 100;

        // Click inside the input
        amtInput.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(state.inlineEditTxnIdx).toBe(0);

        // Click on the row
        row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(state.inlineEditTxnIdx).toBe(0);
    });

    test('cancels inline edit on Escape keydown even when textboxes are not focused', () => {
        startInlineEdit(0);
        expect(state.inlineEditTxnIdx).toBe(0);
        expect(document.getElementById('inline-edit-amount-0')).not.toBeNull();

        // Ensure focus is on document.body, not on any input
        document.body.focus();
        expect(document.activeElement).not.toBe(document.getElementById('inline-edit-amount-0'));

        // Dispatch Escape keydown on document
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        // Inline edit should be cancelled
        expect(state.inlineEditTxnIdx).toBeNull();
        expect(document.getElementById('inline-edit-amount-0')).toBeNull();
    });
});
