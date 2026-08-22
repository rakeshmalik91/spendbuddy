import { renderChart, buildTopExpensesChart, buildTxnTypeDailyTrendChart, buildTxnTypeYearlyTrendChart, buildTxnModeChart, buildCategoryDonut, buildDailyTrendChart, buildYearlyTrendChart, buildWeeklyTrendChart, buildCategoryBarChart, buildTagBarChart, buildMonthlyTrendChart, buildLocationChart, buildDailyBalanceChart } from "./chart_builders.js";
import { $$, $ } from "../core/init.js";
import { state } from "../core/state.js";

/* ══════════════ CHARTS PAGE ══════════════ */

export function renderChartsPage() {
    renderChart('chart-category-donut', buildCategoryDonut);
    renderChart('chart-category-bar', buildCategoryBarChart);
    renderChart('chart-tag-bar', buildTagBarChart);

    // Hide trend charts that don't make sense for the current time granularity
    const yearlyCard = document.getElementById('card-yearly-trend');
    const monthlyCard = document.getElementById('card-monthly-trend');
    const weeklyCard = document.getElementById('card-weekly-trend');
    const dailyCard = document.getElementById('card-daily-trend');
    const trendsSection = document.getElementById('trends-section');

    const hideYearly = state.timeMode !== 'all';
    const hideMonthly = ['month', 'week', 'day'].includes(state.timeMode);
    const hideWeekly = ['week', 'day'].includes(state.timeMode);
    const hideDaily = ['day'].includes(state.timeMode);

    if (trendsSection) {
        trendsSection.style.display = state.timeMode === 'day' ? 'none' : '';
        const trendsGrid = document.getElementById('trends-grid');
        if (trendsGrid) trendsGrid.dataset.mode = state.timeMode;
    }

    const categoryTopGrid = document.getElementById('category-top-grid');
    if (categoryTopGrid) categoryTopGrid.dataset.mode = state.timeMode;

    const txnTypeTrendCard = document.getElementById('card-txntype-trend');
    const txnTypeYearlyTrendCard = document.getElementById('card-txntype-yearly-trend');

    if (yearlyCard) yearlyCard.style.display = hideYearly ? 'none' : '';
    if (monthlyCard) monthlyCard.style.display = hideMonthly ? 'none' : '';
    if (weeklyCard) weeklyCard.style.display = hideWeekly ? 'none' : '';
    if (dailyCard) dailyCard.style.display = hideDaily ? 'none' : '';
    if (txnTypeYearlyTrendCard) {
        txnTypeYearlyTrendCard.style.display = hideYearly ? 'none' : '';
    }

    if (txnTypeTrendCard) {
        txnTypeTrendCard.style.display = hideDaily ? 'none' : '';
        const typeBtn = txnTypeTrendCard.querySelector('.btn-trend-type');
        if (typeBtn) {
            typeBtn.style.display = (state.timeMode === 'all' || state.timeMode === 'year') ? '' : 'none';
        }
    }

    if (!hideYearly) renderChart('chart-txntype-yearly-trend', buildTxnTypeYearlyTrendChart);
    if (!hideYearly) renderChart('chart-yearly-trend', buildYearlyTrendChart);
    if (!hideMonthly) renderChart('chart-monthly-trend', buildMonthlyTrendChart);
    if (!hideWeekly) renderChart('chart-weekly-trend', buildWeeklyTrendChart);
    if (!hideDaily) renderChart('chart-daily-trend', buildDailyTrendChart);
    if (!hideDaily) renderChart('chart-txntype-trend', buildTxnTypeDailyTrendChart);

    const locationTrendsSection = document.getElementById('location-trends-section');
    const showLocationTrends = state.timeMode === 'all' || state.timeMode === 'year';
    if (locationTrendsSection) {
        locationTrendsSection.style.display = showLocationTrends ? '' : 'none';
    }

    renderChart('chart-txn-type', buildTxnModeChart);
    if (showLocationTrends) renderChart('chart-location-trend', buildLocationChart);
    renderChart('chart-top-expenses', buildTopExpensesChart);
    renderChart('chart-daily-balance', buildDailyBalanceChart);
}

export function updateTrendButtons() {
    $$('.btn-trend-cum').forEach(btn => {
        btn.textContent = state.trendChartCumulative ? 'Cumulative: ON' : 'Cumulative: OFF';
        if (state.trendChartCumulative) {
            btn.classList.add('btn-primary');
            btn.classList.remove('btn-secondary');
        } else {
            btn.classList.add('btn-secondary');
            btn.classList.remove('btn-primary');
        }
    });
    $$('.btn-trend-type').forEach(btn => {
        btn.textContent = 'Type: ' + state.trendChartType.toUpperCase();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    updateTrendButtons();

    document.body.addEventListener('click', (e) => {
        if (e.target.closest('.btn-trend-cum')) {
            state.trendChartCumulative = !state.trendChartCumulative;
            localStorage.setItem('spendbuddy_chart_cumulative', state.trendChartCumulative);
            updateTrendButtons();
            
            if ($('#view-dashboard').classList.contains('active')) {
                import('./dashboard.js').then(m => m.renderDashboard());
            } else if ($('#view-charts').classList.contains('active')) {
                renderChartsPage();
            }
        }
        if (e.target.closest('.btn-trend-type')) {
            state.trendChartType = state.trendChartType === 'line' ? 'bar' : 'line';
            localStorage.setItem('spendbuddy_chart_type', state.trendChartType);
            updateTrendButtons();
            
            if ($('#view-dashboard').classList.contains('active')) {
                import('./dashboard.js').then(m => m.renderDashboard());
            } else if ($('#view-charts').classList.contains('active')) {
                renderChartsPage();
            }
        }
    });
});

