import { state } from '../js/core/state.js';
import * as timeFilter from '../js/ui/time_filter.js';
import {
    buildMonthlyExpenseChart,
    buildCategoryDonut,
    buildCategoryBarChart,
    buildTagBarChart,
    buildTopExpensesChart,
    buildTxnModeChart,
    buildDailyTrendChart,
    buildWeeklyTrendChart,
    buildMonthlyTrendChart,
    buildYearlyTrendChart,
    buildTxnTypeDailyTrendChart,
    buildTxnTypeYearlyTrendChart,
    buildLocationChart,
    buildDailyBalanceChart
} from '../js/ui/chart_builders.js';

jest.mock('../js/ui/time_filter.js', () => ({
    getGlobalFilteredExpenses: jest.fn(),
    getTrendExpenses: jest.fn()
}));

describe('Dashboard Page Charts - Refund & Spending Calculations', () => {
    let mockCtx;

    beforeEach(() => {
        document.body.innerHTML = '<div id="view-dashboard"><canvas id="dash-monthly-chart"></canvas></div>';
        mockCtx = {
            getContext: jest.fn(),
            canvas: document.getElementById('dash-monthly-chart')
        };

        global.Chart = jest.fn((ctx, config) => config);
        global.Chart.defaults = {
            color: '',
            borderColor: '',
            font: { family: '' },
            plugins: { tooltip: {} }
        };
        state.trendChartType = 'bar';
        state.trendChartCumulative = false;
    });

    it('buildMonthlyExpenseChart (Dashboard) should deduct refunds from monthly expense total', () => {
        timeFilter.getGlobalFilteredExpenses.mockReturnValue([
            { id: 1, date: '2026-07-10', amount: 1000, category: 'Shopping', txnType: 'Expense' },
            { id: 2, date: '2026-07-15', amount: 300, category: 'Shopping', txnType: 'Refund' }, // refund ₹300
            { id: 3, date: '2026-07-20', amount: 500, category: 'Food', txnType: 'Expense' }
        ]);

        const chartConfig = buildMonthlyExpenseChart(mockCtx);
        // Net expense for 2026-07 = 1000 - 300 + 500 = 1200
        expect(chartConfig.data.datasets[0].data[0]).toBe(1200);
    });

    it('buildDailyTrendChart (Dashboard) should deduct refunds from daily expense total', () => {
        timeFilter.getTrendExpenses.mockReturnValue([
            { id: 1, date: '2026-07-10', amount: 800, category: 'Food', txnType: 'Expense' },
            { id: 2, date: '2026-07-10', amount: 200, category: 'Food', txnType: 'Refund' }, // refund ₹200
            { id: 3, date: '2026-07-10', amount: 500, category: 'Mutual Funds', txnType: 'Investment' }
        ]);

        const chartConfig = buildDailyTrendChart(mockCtx);
        // Net expense for 2026-07-10 = 800 - 200 = 600, Investment = 500
        expect(chartConfig.data.datasets[0].label).toBe('Expense+Refund');
        expect(chartConfig.data.datasets[0].data[0]).toBe(600);
        expect(chartConfig.data.datasets[1].label).toBe('Investment');
        expect(chartConfig.data.datasets[1].data[0]).toBe(500);
    });

    it('buildCategoryDonut (Dashboard) should deduct refunds from category totals', () => {
        timeFilter.getGlobalFilteredExpenses.mockReturnValue([
            { id: 1, date: '2026-07-10', amount: 1000, category: 'Shopping', txnType: 'Expense' },
            { id: 2, date: '2026-07-15', amount: 400, category: 'Shopping', txnType: 'Refund' }, // refund ₹400 for Shopping
            { id: 3, date: '2026-07-20', amount: 500, category: 'Food', txnType: 'Expense' }
        ]);

        const chartConfig = buildCategoryDonut(mockCtx);
        // Shopping net = 600, Food net = 500
        expect(chartConfig.data.labels).toEqual(['Shopping', 'Food']);
        expect(chartConfig.data.datasets[0].data).toEqual([600, 500]);
    });

    it('buildTopExpensesChart (Dashboard) should calculate net expense amounts and exclude standalone refunds', () => {
        timeFilter.getGlobalFilteredExpenses.mockReturnValue([
            { id: 1, date: '2026-07-10', amount: 5000, category: 'Electronics', txnType: 'Expense', note: 'Laptop', txnId: 'TXN100' },
            { id: 2, date: '2026-07-12', amount: 1000, category: 'Electronics', txnType: 'Refund', note: 'Laptop discount refund', txnId: 'TXN100' }, // linked refund ₹1000
            { id: 3, date: '2026-07-15', amount: 3000, category: 'Travel', txnType: 'Expense', note: 'Flight' },
            { id: 4, date: '2026-07-20', amount: 2000, category: 'Shopping', txnType: 'Refund', note: 'Standalone refund' } // unlinked refund
        ]);

        const chartConfig = buildTopExpensesChart(mockCtx);
        // Laptop net amount = 5000 - 1000 = 4000. Flight net amount = 3000. Standalone refund excluded.
        expect(chartConfig.data.labels).toEqual(['Laptop', 'Flight']);
        expect(chartConfig.data.datasets[0].data).toEqual([4000, 3000]);
    });
});

describe('Charts Page Charts - Refund & Spending Calculations', () => {
    let mockCtx;

    beforeEach(() => {
        document.body.innerHTML = '<div id="view-charts"><canvas id="chart-yearly-trend"></canvas></div>';
        mockCtx = {
            getContext: jest.fn(),
            canvas: document.getElementById('chart-yearly-trend')
        };

        global.Chart = jest.fn((ctx, config) => config);
        global.Chart.defaults = {
            color: '',
            borderColor: '',
            font: { family: '' },
            plugins: { tooltip: {} }
        };
        state.trendChartType = 'line';
        state.trendChartCumulative = false;
        state.timeMode = 'year';
    });

    it('buildWeeklyTrendChart (Charts Page) should deduct refunds from weekly expense totals', () => {
        timeFilter.getTrendExpenses.mockReturnValue([
            { id: 1, date: '2026-07-06', amount: 1500, category: 'Groceries', txnType: 'Expense' },
            { id: 2, date: '2026-07-08', amount: 500, category: 'Groceries', txnType: 'Refund' } // refund ₹500
        ]);

        const chartConfig = buildWeeklyTrendChart(mockCtx);
        expect(chartConfig.data.datasets[0].data[0]).toBe(1000);
    });

    it('buildMonthlyTrendChart (Charts Page) should deduct refunds from monthly expense totals', () => {
        timeFilter.getTrendExpenses.mockReturnValue([
            { id: 1, date: '2026-06-10', amount: 2500, category: 'Shopping', txnType: 'Expense' },
            { id: 2, date: '2026-06-15', amount: 500, category: 'Shopping', txnType: 'Refund' }
        ]);

        const chartConfig = buildMonthlyTrendChart(mockCtx);
        expect(chartConfig.data.datasets[0].data[0]).toBe(2000);
    });

    it('buildYearlyTrendChart (Charts Page) should deduct refunds from yearly expense totals', () => {
        timeFilter.getTrendExpenses.mockReturnValue([
            { id: 1, date: '2025-05-10', amount: 10000, category: 'Travel', txnType: 'Expense' },
            { id: 2, date: '2025-05-20', amount: 2000, category: 'Travel', txnType: 'Refund' }
        ]);

        const chartConfig = buildYearlyTrendChart(mockCtx);
        expect(chartConfig.data.datasets[0].data[0]).toBe(8000);
    });

    it('buildWeeklyTrendChart and buildDailyTrendChart should show Expense+Refund dataset when cumulative values are negative and investments exist', () => {
        state.trendChartCumulative = true;
        timeFilter.getTrendExpenses.mockReturnValue([
            { id: 1, date: '2026-07-27', amount: 40000, category: 'Shopping', txnType: 'Refund' }, // -40000
            { id: 2, date: '2026-08-03', amount: 66000, category: 'Shopping', txnType: 'Refund' }, // -66000
            { id: 3, date: '2026-08-10', amount: 80000, category: 'Shopping', txnType: 'Expense' }, // +80000 -> cumulative still negative (-26000)
            { id: 4, date: '2026-08-17', amount: 1730, category: 'Mutual Funds', txnType: 'Investment' }
        ]);

        const weeklyConfig = buildWeeklyTrendChart(mockCtx);
        expect(weeklyConfig.data.datasets.some(d => d.label === 'Expense+Refund')).toBe(true);
        expect(weeklyConfig.data.datasets.some(d => d.label === 'Investment')).toBe(true);

        const dailyConfig = buildDailyTrendChart(mockCtx);
        expect(dailyConfig.data.datasets.some(d => d.label === 'Expense+Refund')).toBe(true);
        expect(dailyConfig.data.datasets.some(d => d.label === 'Investment')).toBe(true);
    });

    it('buildCategoryBarChart (Charts Page) should deduct refunds from category totals', () => {
        timeFilter.getGlobalFilteredExpenses.mockReturnValue([
            { id: 1, date: '2026-07-10', amount: 1000, category: 'Shopping', txnType: 'Expense' },
            { id: 2, date: '2026-07-15', amount: 400, category: 'Shopping', txnType: 'Refund' },
            { id: 3, date: '2026-07-20', amount: 500, category: 'Food', txnType: 'Expense' }
        ]);

        const chartConfig = buildCategoryBarChart(mockCtx);
        expect(chartConfig.data.labels).toEqual(['Shopping', 'Food']);
        expect(chartConfig.data.datasets[0].data).toEqual([600, 500]);
    });

    it('buildCategoryBarChart (Charts Page) should limit categories to top 10', () => {
        const dummyExpenses = Array.from({ length: 15 }, (_, i) => ({
            id: i + 1,
            date: '2026-07-10',
            amount: (i + 1) * 100,
            category: `Category ${i + 1}`,
            txnType: 'Expense'
        }));
        timeFilter.getGlobalFilteredExpenses.mockReturnValue(dummyExpenses);

        const chartConfig = buildCategoryBarChart(mockCtx);
        expect(chartConfig.data.labels.length).toBe(10);
        expect(chartConfig.data.datasets[0].data.length).toBe(10);
        expect(chartConfig.data.labels[0]).toBe('Category 15');
        expect(chartConfig.data.datasets[0].data[0]).toBe(1500);
        expect(chartConfig.data.labels[9]).toBe('Category 6');
        expect(chartConfig.data.datasets[0].data[9]).toBe(600);
    });

    it('buildTagBarChart (Charts Page) should deduct refunds from tag totals and sort by net amount', () => {
        timeFilter.getGlobalFilteredExpenses.mockReturnValue([
            { id: 1, date: '2026-07-10', amount: 3000, tag: 'Vacation', txnType: 'Expense' },
            { id: 2, date: '2026-07-15', amount: 500, tag: 'Vacation', txnType: 'Refund' },
            { id: 3, date: '2026-07-20', amount: 1200, tag: 'Office', txnType: 'Expense' },
            { id: 4, date: '2026-07-22', amount: 400, txnType: 'Expense' } // Untagged
        ]);

        const chartConfig = buildTagBarChart(mockCtx);
        expect(chartConfig.data.labels).toEqual(['Vacation', 'Office']);
        expect(chartConfig.data.datasets[0].data).toEqual([2500, 1200]);
    });

    it('buildTagBarChart (Charts Page) should limit tags to top 10', () => {
        const dummyExpenses = Array.from({ length: 15 }, (_, i) => ({
            id: i + 1,
            date: '2026-07-10',
            amount: (i + 1) * 100,
            tag: `Tag ${i + 1}`,
            txnType: 'Expense'
        }));
        timeFilter.getGlobalFilteredExpenses.mockReturnValue(dummyExpenses);

        const chartConfig = buildTagBarChart(mockCtx);
        expect(chartConfig.data.labels.length).toBe(10);
        expect(chartConfig.data.datasets[0].data.length).toBe(10);
        expect(chartConfig.data.labels[0]).toBe('Tag 15');
        expect(chartConfig.data.datasets[0].data[0]).toBe(1500);
        expect(chartConfig.data.labels[9]).toBe('Tag 6');
        expect(chartConfig.data.datasets[0].data[9]).toBe(600);
    });

    it('buildTxnModeChart (Charts Page) should deduct refunds from payment mode totals', () => {
        timeFilter.getGlobalFilteredExpenses.mockReturnValue([
            { id: 1, date: '2026-07-10', amount: 2000, category: 'Shopping', txnType: 'Expense', txnMode: 'Credit Card' },
            { id: 2, date: '2026-07-15', amount: 500, category: 'Shopping', txnType: 'Refund', txnMode: 'Credit Card' },
            { id: 3, date: '2026-07-20', amount: 800, category: 'Food', txnType: 'Expense', txnMode: 'UPI' }
        ]);

        const chartConfig = buildTxnModeChart(mockCtx);
        expect(chartConfig.data.labels).toEqual(['Credit Card', 'UPI']);
        expect(chartConfig.data.datasets[0].data).toEqual([1500, 800]);
    });

    it('buildTxnTypeDailyTrendChart (Charts Page) should deduct refunds from Expense+Refund series', () => {
        timeFilter.getGlobalFilteredExpenses.mockReturnValue([
            { id: 1, date: '2026-07-10', amount: 1200, category: 'Food', txnType: 'Expense' },
            { id: 2, date: '2026-07-10', amount: 200, category: 'Food', txnType: 'Refund' },
            { id: 3, date: '2026-07-10', amount: 5000, category: 'Salary', txnType: 'Income' }
        ]);

        const chartConfig = buildTxnTypeDailyTrendChart(mockCtx);
        const expRefundDataset = chartConfig.data.datasets.find(d => d.label === 'Expense+Refund');
        const incomeDataset = chartConfig.data.datasets.find(d => d.label === 'Income');
        expect(expRefundDataset.data[0]).toBe(1000);
        expect(incomeDataset.data[0]).toBe(5000);
    });

    it('buildTxnTypeYearlyTrendChart (Charts Page) should deduct refunds from Expense+Refund series', () => {
        timeFilter.getGlobalFilteredExpenses.mockReturnValue([
            { id: 1, date: '2025-01-10', amount: 15000, category: 'Electronics', txnType: 'Expense' },
            { id: 2, date: '2025-02-15', amount: 3000, category: 'Electronics', txnType: 'Refund' }
        ]);

        const chartConfig = buildTxnTypeYearlyTrendChart(mockCtx);
        const expRefundDataset = chartConfig.data.datasets.find(d => d.label === 'Expense+Refund');
        expect(expRefundDataset.data[0]).toBe(12000);
    });

    it('buildLocationChart (Charts Page) should deduct refunds from location spend totals', () => {
        timeFilter.getGlobalFilteredExpenses.mockReturnValue([
            { id: 1, date: '2026-07-10', amount: 1500, category: 'Dining', location: 'Bangalore', txnType: 'Expense' },
            { id: 2, date: '2026-07-10', amount: 300, category: 'Dining', location: 'Bangalore', txnType: 'Refund' }
        ]);

        const chartConfig = buildLocationChart(mockCtx);
        expect(chartConfig.data.labels[0]).toBe('Bangalore');
        expect(chartConfig.data.datasets[0].data[0]).toBe(1200);
    });

    it('buildLocationChart (Charts Page) should correctly assign location and deduct refunds on days with standalone refunds', () => {
        timeFilter.getGlobalFilteredExpenses.mockReturnValue([
            { id: 1, date: '2026-07-10', amount: 2000, category: 'Shopping', location: 'Delhi', txnType: 'Expense' },
            { id: 2, date: '2026-07-11', amount: 500, category: 'Shopping', location: 'Delhi', txnType: 'Refund' }
        ]);

        const chartConfig = buildLocationChart(mockCtx);
        // Total net spend for Delhi over 2 days = 2000 - 500 = 1500 across 2 days -> 750 avg
        expect(chartConfig.data.labels[0]).toBe('Delhi');
        expect(chartConfig.data.datasets[0].data[0]).toBe(750);
    });

    it('buildDailyBalanceChart (Charts Page) should add refunds to balance correctly', () => {
        timeFilter.getGlobalFilteredExpenses.mockReturnValue([
            { id: 1, date: '2026-07-10', amount: 1000, category: 'Food', txnType: 'Expense' },
            { id: 2, date: '2026-07-10', amount: 400, category: 'Food', txnType: 'Refund' } // refund adds ₹400 back to balance
        ]);

        const chartConfig = buildDailyBalanceChart(mockCtx);
        // Net balance impact = -1000 + 400 = -600
        expect(chartConfig.data.datasets[0].data[0]).toBe(-600);
    });
});

describe('Charts Page Visibility - Location Trends timeMode filtering', () => {
    let renderChartsPage;

    beforeEach(async () => {
        HTMLCanvasElement.prototype.getContext = jest.fn(() => ({}));
        state.chartInstances = {};
        document.body.innerHTML = `
            <div id="view-charts">
                <div id="trends-section">
                    <canvas id="chart-yearly-trend"></canvas>
                </div>
                <div id="location-trends-section">
                    <canvas id="chart-location-trend"></canvas>
                </div>
                <canvas id="chart-category-donut"></canvas>
                <canvas id="chart-category-bar"></canvas>
                <canvas id="chart-txn-type"></canvas>
                <canvas id="chart-top-expenses"></canvas>
                <canvas id="chart-daily-balance"></canvas>
            </div>
        `;
        global.Chart = jest.fn((ctx, config) => ({ destroy: jest.fn() }));
        global.Chart.defaults = {
            color: '',
            borderColor: '',
            font: { family: '' },
            plugins: { tooltip: {} }
        };
        const chartsModule = await import('../js/ui/charts.js');
        renderChartsPage = chartsModule.renderChartsPage;
    });

    it('should display Location Trends only for "all" and "year", and Spending Trends for all except "day"', () => {
        state.timeMode = 'all';
        renderChartsPage();
        expect(document.getElementById('location-trends-section').style.display).toBe('');
        expect(document.getElementById('trends-section').style.display).toBe('');

        state.timeMode = 'year';
        renderChartsPage();
        expect(document.getElementById('location-trends-section').style.display).toBe('');
        expect(document.getElementById('trends-section').style.display).toBe('');

        state.timeMode = 'month';
        renderChartsPage();
        expect(document.getElementById('location-trends-section').style.display).toBe('none');
        expect(document.getElementById('trends-section').style.display).toBe('');

        state.timeMode = 'week';
        renderChartsPage();
        expect(document.getElementById('location-trends-section').style.display).toBe('none');
        expect(document.getElementById('trends-section').style.display).toBe('');

        state.timeMode = 'day';
        renderChartsPage();
        expect(document.getElementById('location-trends-section').style.display).toBe('none');
        expect(document.getElementById('trends-section').style.display).toBe('none');
    });
});

