import { mergeRefundTransactions, renderRefundCollapsibleSubrow } from '../js/utils/helpers.js';
import { openRefundLinkingModal } from '../js/ui/refund_linking_modal.js';
import { generateRefund } from '../js/ui/form.js';
import { state } from '../js/core/state.js';

describe('Shared Txn ID Multi-Refund Linking', () => {
    test('mergeRefundTransactions groups multiple refunds sharing the same Txn ID with main expense', () => {
        const mainExpense = {
            date: '2026-07-25',
            amount: 62939.00,
            category: 'Shopping',
            txnType: 'Expense',
            txnMode: 'UPI',
            note: 'Amazon Big Purchase',
            txnId: 'AMZ62939'
        };

        const refund1 = {
            date: '2026-07-28',
            amount: -55199.00,
            category: 'Shopping',
            txnType: 'Refund',
            txnMode: 'UPI',
            note: 'Item 1 cancel refund',
            txnId: 'AMZ62939'
        };

        const refund2 = {
            date: '2026-07-29',
            amount: -7740.00,
            category: 'Shopping',
            txnType: 'Refund',
            txnMode: 'UPI',
            note: 'Item 2 return refund',
            txnId: 'AMZ62939'
        };

        const unlinkedExpense = {
            date: '2026-07-30',
            amount: 500.00,
            category: 'Food',
            txnType: 'Expense',
            txnMode: 'UPI',
            note: 'Swiggy',
            txnId: 'SWIGGY500'
        };

        const transactions = [mainExpense, refund1, refund2, unlinkedExpense];
        const grouped = mergeRefundTransactions(transactions);

        expect(grouped.length).toBe(2);

        const amzGroup = grouped.find(g => g.main.txnId === 'AMZ62939');
        expect(amzGroup).toBeDefined();
        expect(amzGroup.refunds.length).toBe(2);
        expect(amzGroup.totalRefunded).toBe(62939.00);
        expect(amzGroup.netAmount).toBe(0.00);

        const swiggyGroup = grouped.find(g => g.main.txnId === 'SWIGGY500');
        expect(swiggyGroup).toBeDefined();
        expect(swiggyGroup.refunds.length).toBe(0);
        expect(swiggyGroup.netAmount).toBe(500.00);
    });

    test('mergeRefundTransactions handles partial refunds correctly', () => {
        const mainExpense = {
            date: '2026-07-25',
            amount: 10000.00,
            category: 'Electronics',
            txnType: 'Expense',
            txnMode: 'Card',
            note: 'Monitor',
            txnId: 'MONITOR10K'
        };

        const partialRefund = {
            date: '2026-07-27',
            amount: -3000.00,
            category: 'Electronics',
            txnType: 'Refund',
            txnMode: 'Card',
            note: 'Partial price match refund',
            txnId: 'MONITOR10K'
        };

        const grouped = mergeRefundTransactions([mainExpense, partialRefund]);

        expect(grouped.length).toBe(1);
        expect(grouped[0].refunds.length).toBe(1);
        expect(grouped[0].totalRefunded).toBe(3000.00);
        expect(grouped[0].netAmount).toBe(7000.00);
    });

    test('mergeRefundTransactions supports pipe-separated multi-Txn ID strings', () => {
        const mainExpense = {
            date: '2026-07-10',
            amount: 5000.00,
            category: 'Clothing',
            txnType: 'Expense',
            txnMode: 'UPI',
            note: 'Zara Order',
            txnId: 'BANK_REF_999|ZARA_ORDER_1'
        };

        const refund = {
            date: '2026-07-12',
            amount: -2000.00,
            category: 'Clothing',
            txnType: 'Refund',
            txnMode: 'UPI',
            note: 'Zara Return',
            txnId: 'ZARA_ORDER_1'
        };

        const grouped = mergeRefundTransactions([mainExpense, refund]);

        expect(grouped.length).toBe(1);
        expect(grouped[0].refunds.length).toBe(1);
        expect(grouped[0].netAmount).toBe(3000.00);
    });

    test('mergeRefundTransactions never auto-matches two refund transactions with each other', () => {
        const refund1 = {
            date: '2026-08-02',
            amount: -5499.00,
            category: 'Shopping',
            txnType: 'Refund',
            txnMode: 'UPI',
            note: 'Amazon Refund',
            txnId: '406-3410652-0728320'
        };

        const refund2 = {
            date: '2026-08-02',
            amount: -5499.00,
            category: 'Shopping',
            txnType: 'Refund',
            txnMode: 'UPI',
            note: 'Amazon refund',
            txnId: '551650462146|__TXN_ms8x6880vxej'
        };

        const grouped = mergeRefundTransactions([refund1, refund2]);

        expect(grouped.length).toBe(2);
        expect(grouped[0].refunds.length).toBe(0);
        expect(grouped[1].refunds.length).toBe(0);
    });
});

describe('openRefundLinkingModal UI behavior', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        state.expenses = [
            { date: '2026-07-25', amount: 1000, category: 'Shopping', txnType: 'Expense', txnMode: 'UPI', note: 'Shirt', txnId: 'T1' },
            { date: '2026-07-26', amount: -500, category: 'Shopping', txnType: 'Refund', txnMode: 'UPI', note: 'Shirt Refund', txnId: '' }
        ];
    });

    test('clicking backdrop overlay closes the refund linking modal', () => {
        openRefundLinkingModal(0);
        const overlay = document.getElementById('refund-linking-modal-overlay');
        expect(overlay).not.toBeNull();
        expect(overlay.style.display).toBe('flex');

        // Click outside the modal card (directly on backdrop overlay)
        overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(overlay.style.display).toBe('none');
    });

    test('clicking inside modal content does not close the refund linking modal', () => {
        openRefundLinkingModal(0);
        const overlay = document.getElementById('refund-linking-modal-overlay');
        const modalContent = overlay.firstElementChild;

        // Click inside modal content
        modalContent.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(overlay.style.display).toBe('flex');
    });

    test('openRefundLinkingModal populates system txnId for refund target if no txnId exists', () => {
        expect(state.expenses[1].txnId).toBe('');
        openRefundLinkingModal(1);
        expect(state.expenses[1].txnId).toMatch(/^__TXN_/);
    });

    test('renderRefundCollapsibleSubrow generates collapsible subrow with hide-on-mobile and shortened source badge', () => {
        const refunds = [
            { date: '2026-07-26', amount: -500, category: 'Shopping', txnType: 'Refund', txnMode: 'UPI', note: 'Shirt Refund', txnId: 'R1', source: 'SMS: AD-HDFCBK - Debited INR 500' }
        ];
        const subrowHtml = renderRefundCollapsibleSubrow('txn-row', 0, refunds, 500, 500, 6);

        expect(subrowHtml).toContain('id="txn-row-0-refunds"');
        expect(subrowHtml).toContain('class="refund-collapsible-row hide-on-mobile"');
        expect(subrowHtml).not.toContain('hidden');
        expect(subrowHtml).toContain('Shirt Refund');
        expect(subrowHtml).toContain('+₹500.00');
        expect(subrowHtml).toContain('<span class="badge-source hide-on-desktop" title="SMS: AD-HDFCBK - Debited INR 500">SMS</span>');
    });

    test('mergeRefundTransactions populates linkedExpenses when refund is filtered and original expense is in store pool', () => {
        const JulyExpense = { date: '2026-07-29', amount: 62939, category: 'Shopping', txnType: 'Expense', txnMode: 'UPI', note: 'Amazon Laptop', txnId: 'AMZ_ORDER_99' };
        const AugRefund = { date: '2026-08-02', amount: -5499, category: 'Shopping', txnType: 'Refund', txnMode: 'UPI', note: 'Amazon Refund', txnId: 'AMZ_ORDER_99' };

        const allExpenses = [JulyExpense, AugRefund];
        const filteredAug = [AugRefund];

        const grouped = mergeRefundTransactions(filteredAug, allExpenses);
        expect(grouped.length).toBe(1);
        expect(grouped[0].main).toBe(AugRefund);
        expect(grouped[0].linkedExpenses).toContain(JulyExpense);

        const subrowHtml = renderRefundCollapsibleSubrow('txn-row', 0, [], 0, 0, 6, grouped[0].linkedExpenses);
        expect(subrowHtml).toContain('Linked Original Expense');
        expect(subrowHtml).toContain('Amazon Laptop');
        expect(subrowHtml).toContain('₹62,939.00');
    });

    test('generateRefund directly logs and links refund transaction without navigating to add form', async () => {
        state.expenses = [
            { date: '2026-07-25', amount: 1200, category: 'Food', txnType: 'Expense', txnMode: 'UPI', note: 'Dinner', txnId: '' }
        ];

        await generateRefund(0);

        expect(state.expenses.length).toBe(2);
        expect(state.expenses[0].txnId).toMatch(/^__TXN_/);
        expect(state.expenses[1].txnType).toBe('Refund');
        expect(state.expenses[1].amount).toBe(-1200);
        expect(state.expenses[1].txnId).toBe(state.expenses[0].txnId);
        expect(state.expenses[1].note).toBe('Refund: Dinner');
    });

    test('mergeRefundTransactions treats refunds as independent standalone entries when state.mergeRefunds is false', () => {
        state.mergeRefunds = false;
        try {
            const mainExpense = { date: '2026-09-01', amount: 15000, category: 'Home', txnType: 'Expense', txnMode: 'UPI', note: 'Home Loan', txnId: 'EXP_1' };
            const refund = { date: '2026-09-07', amount: -15000, category: 'Home', txnType: 'Refund', txnMode: 'UPI', note: 'Refund', txnId: 'REF_1' };

            const grouped = mergeRefundTransactions([mainExpense, refund]);
            expect(grouped.length).toBe(2);
            expect(grouped[0].main).toBe(mainExpense);
            expect(grouped[0].refunds.length).toBe(0);
            expect(grouped[1].main).toBe(refund);
            expect(grouped[1].refunds.length).toBe(0);
            expect(grouped[1].netAmount).toBe(15000);
        } finally {
            state.mergeRefunds = true;
        }
    });

    test('txn page toggle-merge-refunds-txn updates state, localStorage, and settings toggle', async () => {
        const { setupFilters } = await import('../js/ui/filters.js');
        document.body.innerHTML = `
            <input type="checkbox" id="toggle-merge-refunds-txn" checked />
            <input type="checkbox" id="toggle-merge-refunds" checked />
            <table id="all-table"><tbody id="all-tbody"></tbody></table>
            <div id="view-transactions"><div class="table-footer"></div></div>
        `;

        setupFilters();

        const txnToggle = document.getElementById('toggle-merge-refunds-txn');
        const settingsToggle = document.getElementById('toggle-merge-refunds');

        // Turn OFF
        txnToggle.checked = false;
        txnToggle.dispatchEvent(new Event('change'));

        expect(state.mergeRefunds).toBe(false);
        expect(localStorage.getItem('expman_merge_refunds')).toBe('false');
        expect(settingsToggle.checked).toBe(false);

        // Turn ON
        txnToggle.checked = true;
        txnToggle.dispatchEvent(new Event('change'));

        expect(state.mergeRefunds).toBe(true);
        expect(localStorage.getItem('expman_merge_refunds')).toBe('true');
        expect(settingsToggle.checked).toBe(true);
    });

    test('renderTransactions synchronizes toggle-merge-refunds-txn with state.mergeRefunds', async () => {
        const { renderTransactions } = await import('../js/ui/transactions.js');
        document.body.innerHTML = `
            <input type="checkbox" id="toggle-merge-refunds-txn" checked />
            <table id="all-table"><tbody id="all-tbody"></tbody></table>
            <div id="view-transactions"><div class="table-footer"></div></div>
        `;

        state.expenses = [
            { date: '2026-09-01', amount: 1000, category: 'Food', txnType: 'Expense', txnMode: 'UPI', note: 'Lunch', txnId: 'T1' }
        ];

        state.mergeRefunds = false;
        renderTransactions();
        expect(document.getElementById('toggle-merge-refunds-txn').checked).toBe(false);

        state.mergeRefunds = true;
        renderTransactions();
        expect(document.getElementById('toggle-merge-refunds-txn').checked).toBe(true);
    });

    test('txn page toggle-hide-source-txnid updates state, localStorage, and settings toggle', async () => {
        const { setupFilters } = await import('../js/ui/filters.js');
        document.body.innerHTML = `
            <input type="checkbox" id="toggle-hide-source-txnid" />
            <input type="checkbox" id="toggle-hide-source-txnid-settings" />
            <table id="all-table"><tbody id="all-tbody"></tbody></table>
            <div id="view-transactions"><div class="table-footer"></div></div>
        `;

        state.hideSourceTxnId = false;
        setupFilters();

        const txnToggle = document.getElementById('toggle-hide-source-txnid');
        const settingsToggle = document.getElementById('toggle-hide-source-txnid-settings');

        // Turn ON (hide)
        txnToggle.checked = true;
        txnToggle.dispatchEvent(new Event('change'));

        expect(state.hideSourceTxnId).toBe(true);
        expect(localStorage.getItem('expman_hide_source_txnid')).toBe('true');
        expect(settingsToggle.checked).toBe(true);

        // Turn OFF (show)
        txnToggle.checked = false;
        txnToggle.dispatchEvent(new Event('change'));

        expect(state.hideSourceTxnId).toBe(false);
        expect(localStorage.getItem('expman_hide_source_txnid')).toBe('false');
        expect(settingsToggle.checked).toBe(false);
    });

    test('renderTransactions shortens source and txn id badges and displays emoji mode when state.hideSourceTxnId is true', async () => {
        const { renderTransactions } = await import('../js/ui/transactions.js');
        document.body.innerHTML = `
            <input type="checkbox" id="toggle-hide-source-txnid" />
            <table id="all-table"><tbody id="all-tbody"></tbody></table>
            <div id="view-transactions"><div class="table-footer"></div></div>
        `;

        state.txnModes = ['📱 UPI', '💳 Credit Card'];
        state.expenses = [
            { date: '2026-09-01', amount: 1000, category: 'Food', txnType: 'Expense', txnMode: 'UPI', note: 'Lunch', txnId: 'TXN12345', source: 'SMS: HDFC Bank' }
        ];

        // When hideSourceTxnId is false, full badges should appear
        state.hideSourceTxnId = false;
        renderTransactions();
        expect(document.getElementById('toggle-hide-source-txnid').checked).toBe(false);
        const htmlShown = document.getElementById('all-tbody').innerHTML;
        expect(htmlShown).toContain('badge-source hide-on-mobile');
        expect(htmlShown).toContain('SMS: HDFC Bank');
        expect(htmlShown).toContain('TXN12345');
        expect(htmlShown).toContain('📱 UPI');

        // When hideSourceTxnId is true, source is shortened, txnId has hide-on-mobile, mode is emoji-only
        state.hideSourceTxnId = true;
        renderTransactions();
        expect(document.getElementById('toggle-hide-source-txnid').checked).toBe(true);
        const htmlCompact = document.getElementById('all-tbody').innerHTML;
        // Source should be shortened to 'SMS' with full source in title
        expect(htmlCompact).toContain('badge-source');
        expect(htmlCompact).toContain('>SMS<');
        expect(htmlCompact).toContain('title="SMS: HDFC Bank"');
        // Txn id should have hide-on-mobile
        expect(htmlCompact).toContain('badge-txn hide-on-mobile');
        expect(htmlCompact).toContain('#TXN12345');
        // Mode should be emoji only with badge-mode-emoji
        expect(htmlCompact).toContain('badge-mode badge-mode-emoji');
        expect(htmlCompact).toContain('badge-mode-emoji-icon">📱</span>');
        expect(htmlCompact).toContain('badge-mode-label">UPI</span>');

        // Cleanup
        state.hideSourceTxnId = false;
    });

    test('txn header hamburger button toggles txn-menu-dropdown show class and closes on outside click or escape', async () => {
        const { setupFilters } = await import('../js/ui/filters.js');
        document.body.innerHTML = `
            <div id="txn-header-actions">
                <button type="button" class="txn-menu-btn" id="txn-menu-btn">☰</button>
                <div class="txn-menu-dropdown" id="txn-menu-dropdown"></div>
            </div>
            <div id="outside-element"></div>
        `;

        setupFilters();

        const btn = document.getElementById('txn-menu-btn');
        const dropdown = document.getElementById('txn-menu-dropdown');
        const outside = document.getElementById('outside-element');

        expect(dropdown.classList.contains('show')).toBe(false);

        // Click hamburger
        btn.click();
        expect(dropdown.classList.contains('show')).toBe(true);
        expect(btn.classList.contains('active')).toBe(true);

        // Click hamburger again to toggle off
        btn.click();
        expect(dropdown.classList.contains('show')).toBe(false);
        expect(btn.classList.contains('active')).toBe(false);

        // Open and click outside
        btn.click();
        expect(dropdown.classList.contains('show')).toBe(true);
        outside.click();
        expect(dropdown.classList.contains('show')).toBe(false);

        // Open and press Escape
        btn.click();
        expect(dropdown.classList.contains('show')).toBe(true);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(dropdown.classList.contains('show')).toBe(false);
    });
});
