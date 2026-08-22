import { state } from '../js/core/state.js';
import { getPrev5GlobalFilteredExpenses, getTrendExpenses } from '../js/ui/time_filter.js';

describe('getPrev5GlobalFilteredExpenses', () => {
    beforeEach(() => {
        // Reset state
        state.expenses = [];
        state.hideIncome = false;
        state.hideInvestment = false;
        state.hideTransfer = false;
        state.timeMode = 'year';
        state.timeDate = new Date('2026-06-15T00:00:00'); // Target date
        state.customDateStart = null;
        state.customDateEnd = null;
    });

    it('should cap daysCount when oldest transaction is after the theoretical start date', () => {
        // Target is 2026. 5 previous years: 2021-2025 (1826 days).
        // Oldest transaction is 2024-01-01.
        state.expenses = [
            { id: 1, date: '2025-12-31', amount: -100, txnType: 'Expense' },
            { id: 2, date: '2024-01-01', amount: -100, txnType: 'Expense' }
        ];
        
        const result = getPrev5GlobalFilteredExpenses();
        
        // 2024 is a leap year (366 days), 2025 has 365 days. Total = 731.
        expect(result.days).toBe(731);
        expect(result.expenses.length).toBe(2);
    });

    it('should use theoretical max days when oldest transaction is before the start date', () => {
        // Target is 2026. 5 previous years: 2021-2025.
        // Oldest transaction is 2020-01-01.
        state.expenses = [
            { id: 1, date: '2025-06-15', amount: -100, txnType: 'Expense' },
            { id: 2, date: '2020-01-01', amount: -100, txnType: 'Expense' }
        ];
        
        const result = getPrev5GlobalFilteredExpenses();
        
        // 5 years: 2021 (365), 2022 (365), 2023 (365), 2024 (366), 2025 (365) = 1826
        expect(result.days).toBe(1826);
        expect(result.expenses.length).toBe(1); // Only the 2025 one falls in the 5-year window
    });

    it('should return 0 days if oldest transaction is strictly after the previous periods', () => {
        // Target is 2026. 5 previous years: 2021-2025.
        // Oldest transaction is 2026-01-01.
        state.expenses = [
            { id: 1, date: '2026-01-01', amount: -100, txnType: 'Expense' }
        ];
        
        const result = getPrev5GlobalFilteredExpenses();
        
        expect(result.days).toBe(0);
        expect(result.expenses.length).toBe(0);
    });
    
    it('should handle custom time mode capping', () => {
        state.timeMode = 'custom';
        state.customDateStart = '2026-06-01';
        state.customDateEnd = '2026-06-10';
        
        // Previous 5 periods of 10 days each -> 50 days ending on 2026-05-31.
        // Start date is 50 days before 2026-05-31 => 2026-04-12.
        
        // Oldest transaction is 2026-05-01.
        state.expenses = [
            { id: 1, date: '2026-05-31', amount: -100, txnType: 'Expense' },
            { id: 2, date: '2026-05-01', amount: -100, txnType: 'Expense' }
        ];
        
        const result = getPrev5GlobalFilteredExpenses();
        
        // Days from 2026-05-01 to 2026-05-31 is 31 days.
        expect(result.days).toBe(31);
        expect(result.expenses.length).toBe(2);
    });

    it('should cap daysCount correctly for month mode', () => {
        state.timeMode = 'month';
        state.timeDate = new Date('2026-06-15T00:00:00'); 
        // 5 previous months: Jan, Feb, Mar, Apr, May of 2026.
        // Theoretical max is 31+28+31+30+31 = 151 days. End is 2026-05-31.
        
        // Oldest transaction is 2026-04-15.
        state.expenses = [
            { id: 1, date: '2026-05-31', amount: -100, txnType: 'Expense' },
            { id: 2, date: '2026-04-15', amount: -100, txnType: 'Expense' }
        ];
        
        const result = getPrev5GlobalFilteredExpenses();
        
        // 16 days in Apr (15 to 30), 31 in May = 47 days.
        expect(result.days).toBe(47);
        expect(result.expenses.length).toBe(2);
    });

    it('should cap daysCount correctly for week mode', () => {
        state.timeMode = 'week';
        state.timeDate = new Date('2026-06-17T00:00:00'); // Wed
        // Current week is Jun 14 (Sun) to Jun 20 (Sat).
        // 5 previous weeks end on Jun 13 (Sat).
        // Theoretical max is 35 days.
        
        // Oldest transaction is 2026-06-01.
        state.expenses = [
            { id: 1, date: '2026-06-10', amount: -100, txnType: 'Expense' },
            { id: 2, date: '2026-06-01', amount: -100, txnType: 'Expense' }
        ];
        
        const result = getPrev5GlobalFilteredExpenses();
        
        // 2026-06-01 to 2026-06-13 is 13 days.
        expect(result.days).toBe(13);
        expect(result.expenses.length).toBe(2);
    });

    it('should cap daysCount correctly for day mode', () => {
        state.timeMode = 'day';
        state.timeDate = new Date('2026-06-15T00:00:00'); 
        // 5 previous days: Jun 10 to Jun 14.
        // Theoretical max is 5 days.
        
        // Oldest transaction is 2026-06-12.
        state.expenses = [
            { id: 1, date: '2026-06-14', amount: -100, txnType: 'Expense' },
            { id: 2, date: '2026-06-12', amount: -100, txnType: 'Expense' }
        ];
        
        const result = getPrev5GlobalFilteredExpenses();
        
        // 2026-06-12 to 2026-06-14 is 3 days.
        expect(result.days).toBe(3);
        expect(result.expenses.length).toBe(2);
    });
});

describe('getTrendExpenses filter isolation', () => {
    beforeEach(() => {
        state.expenses = [
            { id: 1, date: '2026-06-15', category: 'Food', txnMode: 'UPI', amount: 100, txnType: 'Expense' },
            { id: 2, date: '2026-06-15', category: 'Shopping', txnMode: 'Card', amount: 200, txnType: 'Expense' }
        ];
        state.timeMode = 'all';
        document.body.innerHTML = `
            <div id="trend-filter-category">
                <div class="chip active" data-value="Food">Food</div>
            </div>
            <div id="trend-filter-txnmode">
                <div class="chip active" data-value="UPI">UPI</div>
            </div>
        `;
    });

    it('should filter expenses when ignoreTrendFilters is false', () => {
        const filtered = getTrendExpenses(false);
        expect(filtered.length).toBe(1);
        expect(filtered[0].category).toBe('Food');
    });

    it('should return all global expenses when ignoreTrendFilters is true (for Dashboard charts)', () => {
        const filtered = getTrendExpenses(true);
        expect(filtered.length).toBe(2);
    });
});

