import { state } from '../js/core/state.js';
import { renderRecentTransactions, renderSelectedDayTransactions } from '../js/ui/dashboard.js';
import { renderRefundCollapsibleSubrow } from '../js/utils/refund_helpers.js';
import * as timeFilter from '../js/ui/time_filter.js';

jest.mock('../js/ui/time_filter.js', () => ({
    getGlobalFilteredExpenses: jest.fn(),
    getPrevGlobalFilteredExpenses: jest.fn(() => []),
    getPrev5GlobalFilteredExpenses: jest.fn(() => ({ expenses: [], days: 0 }))
}));

jest.mock('../js/ui/chart_builders.js', () => ({
    buildDailyTrendChart: jest.fn(),
    renderChart: jest.fn(),
    buildTopExpensesChart: jest.fn(),
    buildMonthlyExpenseChart: jest.fn(),
    buildCategoryDonut: jest.fn()
}));

describe('Dashboard Transaction Tags', () => {
    beforeEach(() => {
        state.expenses = [];
        state.scheduledTransactions = [];
        state.limitDashboard = 20;
        state.hideIncome = false;
        state.hideInvestment = false;
        state.hideTransfer = false;
        state.hideSourceTxnId = false;

        document.body.innerHTML = `
            <table id="recent-table">
                <tbody id="recent-tbody"></tbody>
            </table>
            <input type="date" id="input-date" value="2026-09-13" />
            <table>
                <tbody id="selected-day-tbody"></tbody>
            </table>
        `;
        jest.clearAllMocks();
    });

    describe('renderRecentTransactions', () => {
        it('should render tag badge for tagged transactions in recent transactions', () => {
            const txns = [
                {
                    date: '2026-09-13',
                    category: 'Groceries',
                    amount: 450,
                    txnType: 'Expense',
                    txnMode: 'UPI',
                    note: 'Supermarket',
                    tag: 'WeeklySupplies',
                    source: 'HDFC Bank'
                },
                {
                    date: '2026-09-13',
                    category: 'Fuel',
                    amount: 200,
                    txnType: 'Expense',
                    txnMode: 'Credit Card',
                    note: 'Petrol',
                    source: 'ICICI Bank'
                }
            ];
            state.expenses = [...txns];
            timeFilter.getGlobalFilteredExpenses.mockReturnValue(txns);

            renderRecentTransactions();

            const tbody = document.getElementById('recent-tbody');
            const row0 = tbody.querySelector('#dash-row-0');
            const row1 = tbody.querySelector('#dash-row-1');

            expect(row0).not.toBeNull();
            expect(row1).not.toBeNull();

            // Tagged transaction should have .badge-tag
            const tagBadge = row0.querySelector('.badge-tag');
            expect(tagBadge).not.toBeNull();
            expect(tagBadge.textContent).toContain('🏷️ WeeklySupplies');
            expect(tagBadge.getAttribute('title')).toBe('Tag: WeeklySupplies');

            // Untagged transaction should NOT have .badge-tag
            expect(row1.querySelector('.badge-tag')).toBeNull();
        });

        it('should render a unified composite source badge (e.g. Schedule & Email) on dashboard', () => {
            const txns = [
                {
                    date: '2026-09-13',
                    category: 'Utilities',
                    amount: 999,
                    txnType: 'Expense',
                    txnMode: 'Autopay',
                    note: 'Electricity Bill',
                    source: 'Schedule & Email: Tata Power Alert'
                }
            ];
            state.expenses = [...txns];
            timeFilter.getGlobalFilteredExpenses.mockReturnValue(txns);

            renderRecentTransactions();

            const tbody = document.getElementById('recent-tbody');
            const row = tbody.querySelector('#dash-row-0');
            expect(row).not.toBeNull();

            const sourceBadges = row.querySelectorAll('.badge-source');
            // Should be exactly 1 unified badge, not 2 separate badges
            expect(sourceBadges.length).toBe(1);
            expect(sourceBadges[0].textContent).toBe('Schedule & Email');
        });

        it('should merge matching refunds into collapsible sub-row when state.mergeRefunds is true', () => {
            state.mergeRefunds = true;
            const mainExpense = {
                date: '2026-09-13',
                category: 'Shopping',
                amount: 1500,
                txnType: 'Expense',
                txnMode: 'Credit Card',
                note: 'Shoes purchase',
                txnId: 'TXN_SHOE_001'
            };
            const refundTxn = {
                date: '2026-09-13',
                category: 'Shopping',
                amount: -500,
                txnType: 'Refund',
                txnMode: 'Credit Card',
                note: 'Partial refund shoes',
                txnId: 'TXN_SHOE_001'
            };
            const txns = [mainExpense, refundTxn];
            state.expenses = [...txns];
            timeFilter.getGlobalFilteredExpenses.mockReturnValue(txns);

            renderRecentTransactions();

            const tbody = document.getElementById('recent-tbody');
            // Expense row rendered with merged=true
            const expenseRow = tbody.querySelector('#dash-row-0');
            expect(expenseRow).not.toBeNull();
            expect(expenseRow.getAttribute('data-merged')).toBe('true');
            expect(expenseRow.getAttribute('data-refund-idx')).toBe('1');

            // Refunded toggle badge rendered with click handler
            const refundBadge = expenseRow.querySelector('.badge-refund-toggle');
            expect(refundBadge).not.toBeNull();
            expect(refundBadge.textContent).toContain('Refunded (1)');
            expect(refundBadge.getAttribute('onclick')).toContain("toggleRefundCollapsible('dash-row-0', event)");

            // Amount column shows strikethrough original amount and Net amount
            const amtCell = expenseRow.querySelector('td[data-label="Amount"]');
            expect(amtCell.textContent).toContain('1,500.00');
            expect(amtCell.textContent).toContain('Net: ₹1,000.00');

            // Collapsible sub-row rendered with id dash-row-0-refunds
            const subrow = tbody.querySelector('#dash-row-0-refunds');
            expect(subrow).not.toBeNull();
            expect(subrow.textContent).toContain('Partial refund shoes');
            expect(subrow.textContent).toContain('+₹500.00');

            // Refund transaction should NOT be rendered as a separate top-level touchable-row
            const allTouchableRows = tbody.querySelectorAll('tr.touchable-row');
            expect(allTouchableRows.length).toBe(1);
        });

        it('should treat refunds as standalone entries when state.mergeRefunds is false', () => {
            state.mergeRefunds = false;
            const mainExpense = {
                date: '2026-09-13',
                category: 'Shopping',
                amount: 1500,
                txnType: 'Expense',
                txnMode: 'Credit Card',
                note: 'Shoes purchase',
                txnId: 'TXN_SHOE_002'
            };
            const refundTxn = {
                date: '2026-09-13',
                category: 'Shopping',
                amount: -1500,
                txnType: 'Refund',
                txnMode: 'Credit Card',
                note: 'Full refund shoes',
                txnId: 'TXN_SHOE_002'
            };
            const txns = [mainExpense, refundTxn];
            state.expenses = [...txns];
            timeFilter.getGlobalFilteredExpenses.mockReturnValue(txns);

            renderRecentTransactions();

            const tbody = document.getElementById('recent-tbody');
            const allTouchableRows = tbody.querySelectorAll('tr.touchable-row');
            // Both transactions render as standalone rows
            expect(allTouchableRows.length).toBe(2);

            const row0 = tbody.querySelector('#dash-row-0');
            const row1 = tbody.querySelector('#dash-row-1');
            expect(row0).not.toBeNull();
            expect(row1).not.toBeNull();
            expect(row0.getAttribute('data-merged')).toBe('false');
            expect(row1.getAttribute('data-merged')).toBe('false');

            // No subrow rendered
            expect(tbody.querySelector('#dash-row-0-refunds')).toBeNull();
            expect(tbody.querySelector('#dash-row-1-refunds')).toBeNull();

            // Refund row has +₹ and amount-negative styling
            const refundAmtCell = row1.querySelector('td[data-label="Amount"]');
            expect(refundAmtCell.textContent).toContain('+');
            expect(refundAmtCell.textContent).toContain('1,500.00');

            // Reset state
            state.mergeRefunds = true;
        });

        it('should calculate monthly total from all loaded expenses in that month, not just recent partial slice', () => {
            // Older expense on Sep 01 not within 7-day cutoff
            const olderTxn = {
                date: '2026-09-01',
                category: 'Rent',
                amount: 25000,
                txnType: 'Expense',
                txnMode: 'Net Banking',
                note: 'Monthly House Rent'
            };
            // Recent expense on Sep 15
            const recentTxn = {
                date: '2026-09-15',
                category: 'Groceries',
                amount: 1200,
                txnType: 'Expense',
                txnMode: 'UPI',
                note: 'Weekly Grocery'
            };
            // Refund on Sep 05
            const refundTxn = {
                date: '2026-09-05',
                category: 'Shopping',
                amount: -500,
                txnType: 'Refund',
                txnMode: 'Credit Card',
                note: 'Item refund'
            };
            const allTxns = [recentTxn, refundTxn, olderTxn];
            state.expenses = allTxns;
            timeFilter.getGlobalFilteredExpenses.mockReturnValue(allTxns);

            renderRecentTransactions();

            const tbody = document.getElementById('recent-tbody');
            const monthHeader = tbody.querySelector('.month-header');
            expect(monthHeader).not.toBeNull();
            const monthTotalCell = monthHeader.querySelector('.month-header-total');
            expect(monthTotalCell).not.toBeNull();

            // Total net expense for September should be 25000 + 1200 - 500 = 25,700.00
            expect(monthTotalCell.textContent).toContain('25,700.00');
        });
    });

    describe('renderSelectedDayTransactions', () => {
        it('should render tag badge for selected day transactions and scheduled previews', () => {
            const txns = [
                {
                    date: '2026-09-13',
                    category: 'Dining',
                    amount: 800,
                    txnType: 'Expense',
                    txnMode: 'UPI',
                    note: 'Restaurant dinner',
                    tag: 'WeekendOuting',
                    source: 'GPay'
                }
            ];
            state.expenses = [...txns];

            renderSelectedDayTransactions();

            const tbody = document.getElementById('selected-day-tbody');
            const row = tbody.querySelector('tr.touchable-row');
            expect(row).not.toBeNull();

            const tagBadge = row.querySelector('.badge-tag');
            expect(tagBadge).not.toBeNull();
            expect(tagBadge.textContent).toContain('🏷️ WeekendOuting');
            expect(tagBadge.getAttribute('title')).toBe('Tag: WeekendOuting');
        });

        it('should render tag badge for future scheduled transactions on selected date', () => {
            document.getElementById('input-date').value = '2099-01-01';
            state.expenses = [];
            state.scheduledTransactions = [
                {
                    id: 'sched-1',
                    frequency: 'one-off',
                    next_run_date: '2099-01-01',
                    category: 'Subscriptions',
                    amount: 500,
                    txnMode: 'Credit Card',
                    note: 'Streaming Service',
                    tag: 'Entertainment'
                }
            ];

            renderSelectedDayTransactions();

            const tbody = document.getElementById('selected-day-tbody');
            const row = tbody.querySelector('tr.touchable-row');
            expect(row).not.toBeNull();

            const tagBadge = row.querySelector('.badge-tag');
            expect(tagBadge).not.toBeNull();
            expect(tagBadge.textContent).toContain('🏷️ Entertainment');
        });
    });

    describe('renderRefundCollapsibleSubrow', () => {
        it('should render tag badge for refund items in dashboard collapsible rows (prefix = dash-row)', () => {
            const mainExpense = {
                date: '2026-09-10',
                category: 'Shopping',
                amount: 1200,
                txnType: 'Expense',
                txnMode: 'UPI'
            };
            const refundItem = {
                date: '2026-09-12',
                category: 'Shopping',
                amount: -300,
                txnType: 'Refund',
                txnMode: 'UPI',
                note: 'Return item',
                tag: 'ReturnRefund'
            };
            state.expenses = [mainExpense, refundItem];

            const subrowHtml = renderRefundCollapsibleSubrow(
                'dash-row',
                0,
                [refundItem],
                300,
                900,
                6
            );

            expect(subrowHtml).toContain('badge-tag');
            expect(subrowHtml).toContain('🏷️ ReturnRefund');
        });
    });
});
