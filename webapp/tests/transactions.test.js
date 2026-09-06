import { state } from '../js/core/state.js';
import * as filters from '../js/ui/filters.js';
import * as timeFilter from '../js/ui/time_filter.js';
import { getDaySeparatorHTML } from '../js/ui/settings.js';

// Mock dependencies
jest.mock('../js/ui/time_filter.js', () => ({
    getGlobalFilteredExpenses: jest.fn()
}));

function setupDOM() {
    document.body.innerHTML = `
        <select id="filter-category">
            <option value="">All</option>
            <option value="Food">Food</option>
            <option value="Travel">Travel</option>
        </select>
        <select id="filter-type">
            <option value="">All</option>
            <option value="UPI">UPI</option>
            <option value="Credit Card">Credit Card</option>
        </select>
        <select id="filter-transaction-type">
            <option value="">All</option>
            <option value="Expense">Expense</option>
            <option value="Refund">Refund</option>
        </select>
        <select id="filter-location">
            <option value="">All</option>
            <option value="IntegrationTestTag">IntegrationTestTag</option>
        </select>
        <select id="filter-tag">
            <option value="">All</option>
            <option value="Vacation">Vacation</option>
            <option value="Work">Work</option>
        </select>
        <input id="filter-search" type="text" />
        <button id="btn-clear-filters" disabled></button>
    `;
}

describe('Transactions Filtering Logic', () => {
    beforeEach(() => {
        setupDOM();
        
        // Setup mock data from global time filter
        timeFilter.getGlobalFilteredExpenses.mockReturnValue([
            { id: 1, date: '2026-07-19', amount: -500, category: 'Food', txnType: 'Expense', txnMode: 'UPI', note: 'Zomato', tag: 'Vacation' },
            { id: 2, date: '2026-07-18', amount: -1500, category: 'Travel', txnType: 'Expense', txnMode: 'Credit Card', note: 'Uber', tag: 'Work' },
            { id: 3, date: '2026-07-17', amount: 200, category: 'Food', txnType: 'Refund', txnMode: 'UPI', note: 'Zomato refund', tag: 'Vacation' }
        ]);
    });

    it('should return all expenses when no filters are applied', () => {
        const result = filters.getFilteredExpenses();
        expect(result.length).toBe(3);
    });

    it('should filter by category', () => {
        document.getElementById('filter-category').value = 'Food';
        const result = filters.getFilteredExpenses();
        expect(result.length).toBe(2);
        expect(result.every(e => e.category === 'Food')).toBe(true);
    });

    it('should filter by transaction mode', () => {
        document.getElementById('filter-type').value = 'Credit Card';
        const result = filters.getFilteredExpenses();
        expect(result.length).toBe(1);
        expect(result[0].txnMode).toBe('Credit Card');
    });

    it('should filter by transaction type', () => {
        document.getElementById('filter-transaction-type').value = 'Refund';
        const result = filters.getFilteredExpenses();
        expect(result.length).toBe(1);
        expect(result[0].txnType).toBe('Refund');
    });

    it('should filter by tag dropdown selection', () => {
        document.getElementById('filter-tag').value = 'Work';
        const result = filters.getFilteredExpenses();
        expect(result.length).toBe(1);
        expect(result[0].tag).toBe('Work');
    });

    it('should search by note or category text (case insensitive)', () => {
        document.getElementById('filter-search').value = 'uber';
        const result = filters.getFilteredExpenses();
        expect(result.length).toBe(1);
        expect(result[0].note).toBe('Uber');
    });

    it('should search by tag text (case insensitive)', () => {
        timeFilter.getGlobalFilteredExpenses.mockReturnValue([
            { id: 1, date: '2026-07-19', amount: -500, category: 'Food', txnType: 'Expense', txnMode: 'UPI', note: 'Zomato', tag: 'DinnerParty' },
            { id: 2, date: '2026-07-18', amount: -1500, category: 'Travel', txnType: 'Expense', txnMode: 'Credit Card', note: 'Uber', tag: 'AirportTrip' }
        ]);
        document.getElementById('filter-search').value = 'dinnerparty';
        const result = filters.getFilteredExpenses();
        expect(result.length).toBe(1);
        expect(result[0].tag).toBe('DinnerParty');
    });

    it('should combine multiple filters', () => {
        document.getElementById('filter-category').value = 'Food';
        document.getElementById('filter-transaction-type').value = 'Expense';
        
        const result = filters.getFilteredExpenses();
        expect(result.length).toBe(1);
        expect(result[0].category).toBe('Food');
        expect(result[0].txnType).toBe('Expense');
    });

    it('should reset all filter dropdowns and search input when clearAllFilters is called', () => {
        document.getElementById('filter-category').value = 'Food';
        document.getElementById('filter-type').value = 'Credit Card';
        document.getElementById('filter-transaction-type').value = 'Expense';
        document.getElementById('filter-location').value = 'IntegrationTestTag';
        document.getElementById('filter-tag').value = 'Vacation';
        document.getElementById('filter-search').value = 'Zomato';

        filters.clearAllFilters();

        expect(document.getElementById('filter-category').value).toBe('');
        expect(document.getElementById('filter-type').value).toBe('');
        expect(document.getElementById('filter-transaction-type').value).toBe('');
        expect(document.getElementById('filter-location').value).toBe('');
        expect(document.getElementById('filter-tag').value).toBe('');
        expect(document.getElementById('filter-search').value).toBe('');

        const result = filters.getFilteredExpenses();
        expect(result.length).toBe(3);
        expect(document.getElementById('btn-clear-filters').disabled).toBe(true);
    });

    it('should correctly toggle disabled state of clear filters button based on active filters', () => {
        const btn = document.getElementById('btn-clear-filters');
        filters.updateClearFiltersBtnState();
        expect(btn.disabled).toBe(true);
        expect(filters.hasActiveFilters()).toBe(false);

        document.getElementById('filter-category').value = 'Food';
        filters.updateClearFiltersBtnState();
        expect(btn.disabled).toBe(false);
        expect(filters.hasActiveFilters()).toBe(true);

        document.getElementById('filter-category').value = '';
        document.getElementById('filter-search').value = 'coffee';
        filters.updateClearFiltersBtnState();
        expect(btn.disabled).toBe(false);
        expect(filters.hasActiveFilters()).toBe(true);

        filters.clearAllFilters();
        expect(btn.disabled).toBe(true);
        expect(filters.hasActiveFilters()).toBe(false);
    });

    it('should sort tags in filter dropdown from latest to oldest transaction date', () => {
        state.categories = ['Food', 'Travel'];
        state.txnModes = ['UPI', 'Credit Card'];
        state.expenses = [
            { id: 1, date: '2026-05-10', tag: 'OldTrip' },
            { id: 2, date: '2026-08-15', tag: 'RecentTrip' },
            { id: 3, date: '2026-07-20', tag: 'MidTrip' },
            { id: 4, date: '2026-01-01', tag: 'OldTrip' } // older occurrence of OldTrip
        ];

        filters.populateFilterOptions();

        const tagOptions = Array.from(document.querySelectorAll('#filter-tag option')).map(o => o.value);
        expect(tagOptions).toEqual(['', 'RecentTrip', 'MidTrip', 'OldTrip']);
    });
});

describe('getDaySeparatorHTML', () => {
    const dataset = [
        { date: '2026-09-06', amount: 850, txnType: 'Expense', category: 'Home' },
        { date: '2026-09-06', amount: 654, txnType: 'Expense', category: 'Transport' },
        { date: '2026-09-05', amount: 464, txnType: 'Expense', category: 'Transport' },
        { date: '2026-09-05', amount: -200, txnType: 'Income', category: 'Salary' } // excluded from day total
    ];

    it('should return empty separator row when dateStr or dataset is missing', () => {
        expect(getDaySeparatorHTML(null, dataset, 7)).toBe('<tr class="day-separator"><td colspan="7"></td></tr>');
        expect(getDaySeparatorHTML('2026-09-06', null, 7)).toBe('<tr class="day-separator"><td colspan="7"></td></tr>');
    });

    it('should render day-date-label with formatted date and hide-on-desktop class for 7-column table', () => {
        const html = getDaySeparatorHTML('2026-09-06', dataset, 7);
        expect(html).toContain('class="day-separator"');
        expect(html).toContain('<span class="day-date-label hide-on-desktop">📅');
        expect(html).toContain('06 Sep'); // 06 Sept 2026 or 06 Sep 2026 depending on locale
        expect(html).toContain('class="day-separator-total"');
        expect(html).toContain('1,504.00'); // 850 + 654
        expect(html).toContain('colspan="3"');
        expect(html).toContain('batch-select-day');
    });

    it('should render day-date-label with formatted date for 6-column table (Dashboard)', () => {
        const html = getDaySeparatorHTML('2026-09-06', dataset, 6);
        expect(html).toContain('class="day-separator"');
        expect(html).toContain('<span class="day-date-label hide-on-desktop">📅');
        expect(html).toContain('06 Sep');
        expect(html).toContain('class="day-separator-total"');
        expect(html).toContain('1,504.00');
        expect(html).toContain('colspan="3"');
        expect(html).toContain('colspan="2"'); // colsAfter = 6 - 4 = 2
    });
});

