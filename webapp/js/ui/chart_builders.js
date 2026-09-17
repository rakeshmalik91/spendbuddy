import { openModal } from "./modal.js";
import { getTrendExpenses, getGlobalFilteredExpenses } from "./time_filter.js";
import { getLocalDateString, toast, formatDate, editScheduledTransaction, formatMonth, parseLocalDate, escHtml, amountClass, txnTypeBadgeHTML, txnModeBadgeHTML, calculateNextRunDate, isRefundTxn, mergeRefundTransactions, renderAmountHTML } from "../utils/helpers.js";
import { $$, $ } from "../core/init.js";
import { saveScheduledCSV, roundAmount } from "../services/storage.js";
import { evaluateExpression } from "./form.js";
import { state } from "../core/state.js";
import { ensureChartFullscreenButton, openChartPopup } from "./chart_popup.js";

/* ══════════════ CHART BUILDERS ══════════════ */

export const CHART_COLORS = [
    '#638aff', '#a78bfa', '#f472b6', '#34d399', '#fbbf24',
    '#22d3ee', '#f87171', '#818cf8', '#fb923c', '#4ade80',
    '#e879f9', '#38bdf8', '#facc15', '#2dd4bf', '#f97316',
    '#c084fc'
];

export function formatBarValueLabel(value) {
    if (!value) return '';
    const abs = Math.abs(value);
    if (abs >= 1000) return '₹' + (abs / 1000).toFixed(2) + 'k';
    return '₹' + abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function barValueRightPadding(values) {
    const labels = values.map(formatBarValueLabel);
    const maxLen = labels.reduce((m, l) => Math.max(m, l.length), 4);
    return Math.max(52, maxLen * 7 + 8);
}

export const horizontalBarDatalabels = {
    display: true,
    clip: false,
    anchor: 'end',
    align: 'end',
    offset: 4,
    color: '#ffffff',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderRadius: 3,
    padding: 3,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowBlur: 4,
    font: { weight: 'bold', size: 11, family: 'Inter, sans-serif' },
};

export function renderChart(canvasId, builderFn) {
    if (state.chartInstances[canvasId]) {
        state.chartInstances[canvasId].destroy();
    }
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (!ctx.dataset.fullscreenBound) {
        ctx.addEventListener('click', async () => {
            if (window.innerWidth <= 768 || window.Android) {
                try {
                    const wrap = ctx.closest('.chart-wrap');
                    if (wrap) {
                        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                            if (wrap.requestFullscreen) {
                                await wrap.requestFullscreen();
                            } else if (wrap.webkitRequestFullscreen) {
                                await wrap.webkitRequestFullscreen();
                            }

                            if (screen.orientation && screen.orientation.lock) {
                                await screen.orientation.lock('landscape').catch(e => console.warn('Orientation lock failed:', e));
                            }
                        } else {
                            if (document.exitFullscreen) {
                                await document.exitFullscreen();
                            } else if (document.webkitExitFullscreen) {
                                await document.webkitExitFullscreen();
                            }

                            if (screen.orientation && screen.orientation.unlock) {
                                screen.orientation.unlock();
                            }
                        }
                    }
                } catch (e) {
                    console.error('Fullscreen error:', e);
                }
            }
        });
        ctx.dataset.fullscreenBound = 'true';
    }

    const wrap = ctx.closest('.chart-wrap');
    if (wrap) {
        ensureChartFullscreenButton(wrap, canvasId);
    }

    state.chartInstances[canvasId] = builderFn(ctx.getContext('2d'));

    if (state.activePopupCanvasId === canvasId) {
        openChartPopup(canvasId);
    }
}

Chart.defaults.color = '#8b95a8';
Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';
Chart.defaults.font.family = "'Inter', system-ui, sans-serif";

// Disable chart animations and hover popups on mobile to prevent lag during view swaps
if (window.innerWidth <= 768 || window.Android) {
    Chart.defaults.animation = false;
    Chart.defaults.plugins.tooltip.enabled = false;
}

export function buildMonthlyExpenseChart(ctx) {
    let currentExpenses = getGlobalFilteredExpenses();
    currentExpenses = currentExpenses.filter(e => !e.txnType || e.txnType === 'Expense' || e.txnType === 'Refund');
    const monthlyData = {};
    currentExpenses.forEach(e => {
        const m = e.date.slice(0, 7);
        if (!m) return;
        if (!monthlyData[m]) monthlyData[m] = { expense: 0, income: 0 };
        // Deduct refund amounts from monthly expenses to show net expense
        if (isRefundTxn(e)) {
            monthlyData[m].expense -= Math.abs(e.amount);
        } else {
            monthlyData[m].expense += Math.abs(e.amount);
        }
    });
    let months = Object.keys(monthlyData).sort();
    if (months.length > 0) {
        let [minY, minM] = months[0].split('-').map(Number);
        let [maxY, maxM] = months[months.length - 1].split('-').map(Number);
        let curY = minY, curM = minM;
        while (curY < maxY || (curY === maxY && curM <= maxM)) {
            let mStr = `${curY}-${String(curM).padStart(2, '0')}`;
            if (!monthlyData[mStr]) monthlyData[mStr] = { expense: 0, income: 0 };
            curM++;
            if (curM > 12) { curM = 1; curY++; }
        }
        months = Object.keys(monthlyData).sort();
    }

    let runningTotal = 0;
    const mappedData = months.map(m => {
        const val = monthlyData[m].expense;
        if (state.trendChartCumulative) {
            runningTotal += val;
            return runningTotal;
        }
        return val;
    });

    return new Chart(ctx, {
        type: state.trendChartType,
        data: {
            labels: months.map(formatMonth),
            datasets: [{
                label: 'Expenses',
                data: mappedData,
                backgroundColor: state.trendChartType === 'line' ? 'rgba(248, 113, 113, 0.08)' : 'rgba(248, 113, 113, 0.7)',
                borderColor: '#f87171',
                borderWidth: state.trendChartType === 'line' ? 2 : 1,
                borderRadius: state.trendChartType === 'line' ? 0 : 6,
                fill: true,
                tension: 0.35,
                pointRadius: state.trendChartType === 'line' ? 1.5 : 0,
                pointHoverRadius: state.trendChartType === 'line' ? 5 : 0,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 30 } },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (c) => '₹' + c.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) } }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: v => '₹' + (v / 1000).toFixed(2) + 'k' }
                }
            }
        }
    });
}

export function buildCategoryDonut(ctx) {
    let currentExpenses = getGlobalFilteredExpenses();
    currentExpenses = currentExpenses.filter(e => !e.txnType || e.txnType === 'Expense' || e.txnType === 'Refund');
    const catData = {};
    currentExpenses.forEach(e => {
        const cat = e.category || 'Uncategorized';
        if (isRefundTxn(e)) {
            catData[cat] = (catData[cat] || 0) - Math.abs(e.amount);
        } else {
            catData[cat] = (catData[cat] || 0) + Math.abs(e.amount);
        }
    });
    const sorted = Object.entries(catData).filter(s => s[1] > 0).sort((a, b) => b[1] - a[1]);
    // iOS Safari Canvas Bug Fix: Strip the starting emoji completely from chart labels.
    // Safari's canvas measureText engine catastrophically fails when measuring complex emojis.
    // This regex strips any leading characters that are NOT letters or numbers (in any language),
    // effectively deleting leading emojis, symbols, and weird spaces.
    const labels = sorted.map(s => {
        const clean = s[0].replace(/^[^\p{L}\p{N}]+/u, '').trim();
        return clean || s[0]; // Fallback to original if the entire string was just emojis
    });
    const data = sorted.map(s => s[1]);

    return new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                label: 'Expense+Refund',
                data,
                backgroundColor: CHART_COLORS.slice(0, labels.length),
                borderWidth: 0,
                hoverOffset: 8,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '55%',
            plugins: {
                legend: {
                    display: true,
                    position: 'right',
                    labels: {
                        color: '#e2e8f0',
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 12,
                        font: { size: 11 },
                        generateLabels: function (chart) {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map((label, i) => {
                                    const meta = chart.getDatasetMeta(0);
                                    const style = meta.controller.getStyle(i);
                                    const value = data.datasets[0].data[i];
                                    const abs = Math.abs(value);
                                    let valStr = abs >= 1000 ? (abs / 1000).toFixed(2) + 'k' : abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                    return {
                                        text: `${label} (₹${valStr})`,
                                        fontColor: '#e2e8f0',
                                        fillStyle: style.backgroundColor,
                                        strokeStyle: style.borderColor,
                                        lineWidth: style.borderWidth,
                                        hidden: meta.data[i].hidden,
                                        index: i
                                    };
                                });
                            }
                            return [];
                        }
                    }
                },
                tooltip: { callbacks: { label: (c) => c.label + ': ₹' + c.parsed.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) } }
            }
        }
    });
}


export function buildCategoryBarChart(ctx) {
    let currentExpenses = getGlobalFilteredExpenses();
    currentExpenses = currentExpenses.filter(e => !e.txnType || e.txnType === 'Expense' || e.txnType === 'Refund');
    const catData = {};
    currentExpenses.forEach(e => {
        const cat = e.category || 'Uncategorized';
        if (isRefundTxn(e)) {
            catData[cat] = (catData[cat] || 0) - Math.abs(e.amount);
        } else {
            catData[cat] = (catData[cat] || 0) + Math.abs(e.amount);
        }
    });
    const sorted = Object.entries(catData).filter(s => s[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const safeLabels = sorted.map(s => {
        const clean = s[0].replace(/^[^\p{L}\p{N}]+/u, '').trim();
        return clean || s[0];
    });

    const values = sorted.map(s => s[1]);

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: safeLabels,
            datasets: [{
                label: 'Expense+Refund',
                data: values,
                backgroundColor: CHART_COLORS.slice(0, sorted.length),
                borderWidth: 0,
                borderRadius: 6,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { right: barValueRightPadding(values) } },
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                datalabels: horizontalBarDatalabels,
                tooltip: { callbacks: { label: (c) => '₹' + c.parsed.x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) } }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { callback: v => '₹' + (v / 1000).toFixed(2) + 'k' }
                }
            }
        }
    });
}

export function buildTagBarChart(ctx) {
    let currentExpenses = getGlobalFilteredExpenses();
    currentExpenses = currentExpenses.filter(e => !e.txnType || e.txnType === 'Expense' || e.txnType === 'Refund');
    const tagData = {};
    currentExpenses.forEach(e => {
        const tag = (e.tag || '').trim();
        if (!tag) return;
        if (isRefundTxn(e)) {
            tagData[tag] = (tagData[tag] || 0) - Math.abs(e.amount);
        } else {
            tagData[tag] = (tagData[tag] || 0) + Math.abs(e.amount);
        }
    });
    const sorted = Object.entries(tagData).filter(s => s[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const safeLabels = sorted.map(s => {
        const clean = s[0].replace(/^[^\p{L}\p{N}]+/u, '').trim();
        return clean || s[0];
    });

    const values = sorted.map(s => s[1]);

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: safeLabels,
            datasets: [{
                label: 'Expense+Refund',
                data: values,
                backgroundColor: CHART_COLORS.slice(0, sorted.length),
                borderWidth: 0,
                borderRadius: 6,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { right: barValueRightPadding(values) } },
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                datalabels: horizontalBarDatalabels,
                tooltip: { callbacks: { label: (c) => '₹' + c.parsed.x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) } }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { callback: v => '₹' + (v / 1000).toFixed(2) + 'k' }
                }
            }
        }
    });
}

function getDailyLocationAndSpend(expenses) {
    const dayLocationCounts = {};
    const dailySpend = {};

    expenses.forEach(e => {
        if (!e.date) return;
        if (!dailySpend[e.date]) dailySpend[e.date] = 0;
        const amt = isRefundTxn(e) ? -Math.abs(e.amount) : Math.abs(e.amount);
        dailySpend[e.date] += amt;
        
        const loc = (e.location || '').trim() || 'Unknown';
        if (!dayLocationCounts[e.date]) dayLocationCounts[e.date] = {};
        if (!dayLocationCounts[e.date][loc]) dayLocationCounts[e.date][loc] = 0;
        dayLocationCounts[e.date][loc] += amt;
    });

    const dayLocation = {};
    for (const dStr in dayLocationCounts) {
        let maxSpend = -Infinity;
        let bestLoc = 'Unknown';
        for (const loc in dayLocationCounts[dStr]) {
            if (loc !== 'Unknown' && dayLocationCounts[dStr][loc] > maxSpend) {
                maxSpend = dayLocationCounts[dStr][loc];
                bestLoc = loc;
            }
        }
        if (bestLoc === 'Unknown') {
            for (const loc in dayLocationCounts[dStr]) {
                if (dayLocationCounts[dStr][loc] > maxSpend) {
                    maxSpend = dayLocationCounts[dStr][loc];
                    bestLoc = loc;
                }
            }
        }
        dayLocation[dStr] = bestLoc;
    }
    return { dayLocation, dailySpend };
}

function fillMissingLocationsBackward(dayLocation, minD, maxD) {
    let lastSeenLocation = 'Unknown';
    for (let d = new Date(maxD); d >= minD; d.setDate(d.getDate() - 1)) {
        const dStr = getLocalDateString(d);
        if (dayLocation[dStr] && dayLocation[dStr] !== 'Unknown') {
            lastSeenLocation = dayLocation[dStr];
        } else {
            dayLocation[dStr] = lastSeenLocation;
        }
    }
}

function calculateLocationAverages(dayLocation, dailySpend, minD, maxD) {
    const locTotalSpend = {};
    const locTotalDays = {};
    
    for (let d = new Date(minD); d <= maxD; d.setDate(d.getDate() + 1)) {
        const dStr = getLocalDateString(d);
        const loc = dayLocation[dStr] || 'Unknown';
        if (!locTotalSpend[loc]) locTotalSpend[loc] = 0;
        if (!locTotalDays[loc]) locTotalDays[loc] = 0;
        
        locTotalSpend[loc] += (dailySpend[dStr] || 0);
        locTotalDays[loc] += 1;
    }

    const averages = {};
    for (const loc in locTotalSpend) {
        if (locTotalSpend[loc] > 0 && locTotalDays[loc] > 0) {
            averages[loc] = locTotalSpend[loc] / locTotalDays[loc];
        }
    }
    return averages;
}

export function buildLocationChart(ctx) {
    let currentExpenses = getGlobalFilteredExpenses();
    currentExpenses = currentExpenses.filter(e => !e.txnType || e.txnType === 'Expense' || e.txnType === 'Refund');
    
    if (currentExpenses.length === 0) {
        return new Chart(ctx, { type: 'bar', data: { labels: [], datasets: [] } });
    }

    const allDates = currentExpenses.map(e => e.date).filter(Boolean).sort();
    if (allDates.length === 0) {
        return new Chart(ctx, { type: 'bar', data: { labels: [], datasets: [] } });
    }
    
    const minD = parseLocalDate(allDates[0]);
    const maxD = parseLocalDate(allDates[allDates.length - 1]);

    const { dayLocation, dailySpend } = getDailyLocationAndSpend(currentExpenses);

    fillMissingLocationsBackward(dayLocation, minD, maxD);

    const averages = calculateLocationAverages(dayLocation, dailySpend, minD, maxD);

    const sorted = Object.entries(averages).sort((a, b) => b[1] - a[1]);

    const safeLabels = sorted.map(s => {
        const clean = s[0].replace(/^[^\p{L}\p{N}]+/u, '').trim();
        return clean || s[0];
    });

    const values = sorted.map(s => s[1]);

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: safeLabels,
            datasets: [{
                label: 'Expense+Refund',
                data: values,
                backgroundColor: CHART_COLORS.slice(0, sorted.length),
                borderWidth: 0,
                borderRadius: 6,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { right: barValueRightPadding(values) } },
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                datalabels: horizontalBarDatalabels,
                tooltip: { callbacks: { label: (c) => '₹' + c.parsed.x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) } }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { callback: v => '₹' + (v / 1000).toFixed(2) + 'k' }
                }
            }
        }
    });
}

function _isDashboardCanvas(ctx) {
    if (!ctx) return false;
    const canvas = ctx.canvas || ctx;
    if (!canvas) return false;
    if (canvas.id && canvas.id.startsWith('dash-')) return true;
    if (typeof canvas.closest === 'function' && canvas.closest('#view-dashboard')) return true;
    return false;
}

export function buildDailyTrendChart(ctx) {
    const isDash = _isDashboardCanvas(ctx);
    // On dashboard view, ignore category/mode chip filters from the charts page
    const activeCatChips = isDash ? [] : Array.from(document.querySelectorAll('#trend-filter-category .chip.active')).map(c => c.dataset.value);
    const isAllCategories = activeCatChips.includes('all') || activeCatChips.length === 0;

    // Update the card title dynamically on charts page only
    if (!isDash) {
        const titleEl = document.getElementById('chart-daily-trend-title');
        if (titleEl) {
            titleEl.textContent = isAllCategories ? 'Daily Spending Trend (Expense+Refund)' : 'Daily Trend by Category (Expense+Refund)';
        }
    }

    if (isAllCategories) {
        return _buildDailyTrendSingle(ctx, isDash);
    } else {
        return _buildTrendByCategory(ctx, activeCatChips, 'daily', isDash);
    }
}

function _buildDailyTrendSingle(ctx, isDash = false) {
    let currentExpenses = getTrendExpenses(isDash);
    currentExpenses = currentExpenses.filter(e => !e.txnType || e.txnType === 'Expense' || e.txnType === 'Refund' || e.txnType === 'Investment');
    const dailyData = {};
    currentExpenses.forEach(e => {
        if (!e.date) return;
        if (!dailyData[e.date]) dailyData[e.date] = { expense: 0, investment: 0 };
        if (isRefundTxn(e)) {
            dailyData[e.date].expense -= Math.abs(e.amount);
        } else if (e.txnType === 'Investment') {
            dailyData[e.date].investment += Math.abs(e.amount);
        } else {
            dailyData[e.date].expense += Math.abs(e.amount);
        }
    });
    let days = Object.keys(dailyData).sort();
    if (days.length > 0) {
        let minD = new Date(days[0]);
        let maxD = new Date(days[days.length - 1]);
        for (let d = new Date(minD); d <= maxD; d.setDate(d.getDate() + 1)) {
            let dStr = getLocalDateString(d);
            if (!dailyData[dStr]) dailyData[dStr] = { expense: 0, investment: 0 };
        }
        days = Object.keys(dailyData).sort();
    }

    let runningExp = 0, runningInv = 0;
    const mappedExp = days.map(d => {
        const val = dailyData[d].expense;
        if (state.trendChartCumulative) { runningExp += val; return runningExp; }
        return val;
    });
    const mappedInv = days.map(d => {
        const val = dailyData[d].investment;
        if (state.trendChartCumulative) { runningInv += val; return runningInv; }
        return val;
    });

    const datasets = [];
    const hasExp = mappedExp.some(v => v !== 0);
    const hasInv = mappedInv.some(v => v !== 0);
    if (hasExp || !hasInv) {
        datasets.push({
            label: 'Expense+Refund',
            data: mappedExp,
            borderColor: '#638aff',
            backgroundColor: 'rgba(99, 138, 255, 0.08)',
            fill: true,
            tension: 0.35,
            pointRadius: 1.5,
            pointHoverRadius: 5,
            borderWidth: 2,
        });
    }
    if (hasInv) {
        datasets.push({
            label: 'Investment',
            data: mappedInv,
            borderColor: '#fbbf24',
            backgroundColor: 'rgba(251, 191, 36, 0.08)',
            fill: true,
            tension: 0.35,
            pointRadius: 1.5,
            pointHoverRadius: 5,
            borderWidth: 2,
        });
    }

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: days.map(d => d.slice(5)),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 30 } },
            plugins: {
                legend: { display: datasets.length > 1, position: 'bottom', labels: { boxWidth: 12, font: { size: 10, family: 'Inter, sans-serif' } } },
                tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ₹` + c.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) } }
            },
            scales: {
                y: { beginAtZero: true, ticks: { callback: v => (v < 0 ? '-₹' : '₹') + (Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(2) + 'k' : Math.abs(v)) } },
                x: { ticks: { maxTicksLimit: 20, font: { size: 10 } } }
            }
        }
    });
}

export function buildTxnTypeYearlyTrendChart(ctx) {
    let currentExpenses = getGlobalFilteredExpenses();
    const dataByPeriodAndType = {};
    const allTypes = new Set();
    
    currentExpenses.forEach(e => {
        if (!e.date) return;
        let d = e.date.slice(0, 4); // yyyy
        
        const isRefund = isRefundTxn(e);
        let t = isRefund ? 'Expense+Refund' : (e.txnType || 'Expense');
        if (t === 'Expense') t = 'Expense+Refund';
        if (t !== 'Income' && t !== 'Investment' && t !== 'Expense+Refund') return;
        
        allTypes.add(t);
        if (!dataByPeriodAndType[d]) dataByPeriodAndType[d] = {};
        
        let amt = isRefund ? -Math.abs(e.amount) : Math.abs(e.amount);
        dataByPeriodAndType[d][t] = (dataByPeriodAndType[d][t] || 0) + amt;
    });

    let periods = Object.keys(dataByPeriodAndType).sort();
    if (periods.length > 0) {
        let minY = parseInt(periods[0]);
        let maxY = parseInt(periods[periods.length - 1]);
        for (let y = minY; y <= maxY; y++) {
            let yStr = String(y);
            if (!dataByPeriodAndType[yStr]) dataByPeriodAndType[yStr] = {};
        }
        periods = Object.keys(dataByPeriodAndType).sort();
    }
    
    const orderedTypes = ['Expense+Refund', 'Income', 'Investment'];
    const typesArray = orderedTypes.filter(type => allTypes.has(type));

    const datasets = typesArray.map((type, i) => {
        let color = CHART_COLORS[i % CHART_COLORS.length];
        if (type === 'Income') color = 'rgba(0, 255, 255, 1)'; // Cyan/Blue
        if (type === 'Investment') color = 'rgba(167, 139, 250, 1)'; // Purple
        if (type === 'Expense+Refund') color = 'rgba(244, 114, 182, 1)'; // Pink/Red
        
        let runningTotal = 0;
        const mappedData = periods.map(p => {
            const val = dataByPeriodAndType[p][type] || 0;
            if (state.trendChartCumulative) {
                runningTotal += val;
                return runningTotal;
            }
            return val;
        });

        if (state.trendChartType === 'bar') {
            let stackGroup = (type === 'Expense+Refund' || type === 'Investment') ? 'Stack 1' : 'Stack 0';
            return {
                label: type,
                data: mappedData,
                backgroundColor: color,
                borderColor: color,
                borderWidth: 1,
                borderRadius: 6,
                stack: stackGroup,
            };
        } else {
            return {
                label: type,
                data: mappedData,
                backgroundColor: color,
                borderColor: color,
                fill: false,
                tension: 0.35,
                pointRadius: 1.5,
                pointHoverRadius: 5,
                borderWidth: 2,
            };
        }
    });

    return new Chart(ctx, {
        type: state.trendChartType,
        data: {
            labels: periods,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 30, bottom: 10 } },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { boxWidth: 12, font: { size: 10, family: 'Inter, sans-serif' } }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: (c) => `${c.dataset.label}: ₹` + c.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    }
                }
            },
            scales: {
                x: {
                    stacked: state.trendChartType === 'bar',
                    ticks: {}
                },
                y: {
                    stacked: state.trendChartType === 'bar',
                    beginAtZero: true,
                    ticks: { callback: v => '₹' + (Math.abs(v) >= 1000 ? (v / 1000).toFixed(2) + 'k' : v) }
                }
            }
        }
    });
}
export function buildTxnTypeDailyTrendChart(ctx) {
    let currentExpenses = getGlobalFilteredExpenses();
    const dataByPeriodAndType = {};
    const allTypes = new Set();
    
    const isMonthly = state.timeMode === 'all' || state.timeMode === 'year';
    
    // Update the title
    const titleEl = document.getElementById('chart-txntype-trend-title');
    if (titleEl) {
        titleEl.textContent = isMonthly ? 'Monthly Trend by Transaction Type' : 'Daily Trend by Transaction Type';
    }

    currentExpenses.forEach(e => {
        if (!e.date) return;
        let d = e.date;
        if (isMonthly) {
            d = d.slice(0, 7); // yyyy-mm
        }
        const isRefund = isRefundTxn(e);
        let t = isRefund ? 'Expense+Refund' : (e.txnType || 'Expense');
        if (t === 'Expense') t = 'Expense+Refund';
        if (t !== 'Income' && t !== 'Investment' && t !== 'Expense+Refund') return;
        
        allTypes.add(t);
        if (!dataByPeriodAndType[d]) dataByPeriodAndType[d] = {};
        
        let amt = isRefund ? -Math.abs(e.amount) : Math.abs(e.amount);
        dataByPeriodAndType[d][t] = (dataByPeriodAndType[d][t] || 0) + amt;
    });

    let periods = Object.keys(dataByPeriodAndType).sort();
    if (periods.length > 0) {
        if (isMonthly) {
            let [minY, minM] = periods[0].split('-').map(Number);
            let [maxY, maxM] = periods[periods.length - 1].split('-').map(Number);
            let curY = minY, curM = minM;
            while (curY < maxY || (curY === maxY && curM <= maxM)) {
                let mStr = `${curY}-${String(curM).padStart(2, '0')}`;
                if (!dataByPeriodAndType[mStr]) dataByPeriodAndType[mStr] = {};
                curM++;
                if (curM > 12) { curM = 1; curY++; }
            }
        } else {
            let minD = new Date(periods[0]);
            let maxD = new Date(periods[periods.length - 1]);
            for (let d = new Date(minD); d <= maxD; d.setDate(d.getDate() + 1)) {
                let dStr = getLocalDateString(d);
                if (!dataByPeriodAndType[dStr]) dataByPeriodAndType[dStr] = {};
            }
        }
        periods = Object.keys(dataByPeriodAndType).sort();
    }
    
    const orderedTypes = ['Expense+Refund', 'Income', 'Investment'];
    const typesArray = orderedTypes.filter(type => allTypes.has(type));

    const datasets = typesArray.map((type, i) => {
        let color = CHART_COLORS[i % CHART_COLORS.length];
        if (type === 'Income') color = 'rgba(0, 255, 255, 1)'; // Cyan/Blue
        if (type === 'Investment') color = 'rgba(167, 139, 250, 1)'; // Purple
        if (type === 'Expense+Refund') color = 'rgba(244, 114, 182, 1)'; // Pink/Red
        
        let runningTotal = 0;
        const mappedData = periods.map(p => {
            const val = dataByPeriodAndType[p][type] || 0;
            if (state.trendChartCumulative) {
                runningTotal += val;
                return runningTotal;
            }
            return val;
        });

        if (state.trendChartType === 'bar' && isMonthly) {
            let stackGroup = (type === 'Expense+Refund' || type === 'Investment') ? 'Stack 1' : 'Stack 0';
            return {
                label: type,
                data: mappedData,
                backgroundColor: color,
                borderColor: color,
                borderWidth: 1,
                borderRadius: 6,
                stack: stackGroup,
            };
        } else {
            return {
                label: type,
                data: mappedData,
                backgroundColor: color,
                borderColor: color,
                fill: false,
                tension: 0.35,
                pointRadius: 1.5,
                pointHoverRadius: 5,
                borderWidth: 2,
            };
        }
    });

    return new Chart(ctx, {
        type: isMonthly ? state.trendChartType : 'line',
        data: {
            labels: periods.map(p => isMonthly ? formatMonth(p) : p.slice(5)),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 30, bottom: 10 } },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { boxWidth: 12, font: { size: 10, family: 'Inter, sans-serif' } }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: (c) => `${c.dataset.label}: ₹` + c.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    }
                }
            },
            scales: {
                x: {
                    stacked: isMonthly && state.trendChartType === 'bar',
                    ticks: isMonthly ? {} : { maxTicksLimit: 20, font: { size: 10 } }
                },
                y: {
                    stacked: isMonthly && state.trendChartType === 'bar',
                    beginAtZero: true,
                    ticks: { callback: v => '₹' + (Math.abs(v) >= 1000 ? (v / 1000).toFixed(2) + 'k' : v) }
                }
            }
        }
    });
}

/* ══════════════ SHARED MULTI-CATEGORY TREND HELPER ══════════════ */

/**
 * Builds a multi-line or multi-bar chart for a set of selected categories.
 * period: 'yearly' | 'monthly' | 'weekly' | 'daily'
 */
function _buildTrendByCategory(ctx, selectedCategories, period, isDash = false) {
    let currentExpenses = getTrendExpenses(isDash);
    currentExpenses = currentExpenses.filter(e => !e.txnType || e.txnType === 'Expense' || e.txnType === 'Refund' || e.txnType === 'Investment');

    const dataByBucket = {};
    const presentCategories = new Set();
    const includeEverythingElse = selectedCategories.includes('everything_else');
    const specificSelected = new Set(selectedCategories.filter(c => c !== 'everything_else'));

    currentExpenses.forEach(e => {
        if (!e.date) return;
        let bucket;
        if (period === 'yearly') bucket = e.date.slice(0, 4);
        else if (period === 'monthly') bucket = e.date.slice(0, 7);
        else if (period === 'weekly') bucket = getWeekBoundaries(e.date);
        else bucket = e.date; // daily

        const cat = e.category || 'Uncategorized';
        let displayCat = cat;
        if (includeEverythingElse && !specificSelected.has(cat)) {
            displayCat = 'Everything else';
        }
        presentCategories.add(displayCat);
        if (!dataByBucket[bucket]) dataByBucket[bucket] = {};
        const amt = isRefundTxn(e) ? -Math.abs(e.amount) : Math.abs(e.amount);
        dataByBucket[bucket][displayCat] = (dataByBucket[bucket][displayCat] || 0) + amt;
    });

    // Fill gaps between min and max bucket
    let buckets = Object.keys(dataByBucket).sort();
    if (buckets.length > 0) {
        if (period === 'yearly') {
            let minY = parseInt(buckets[0]), maxY = parseInt(buckets[buckets.length - 1]);
            for (let y = minY; y <= maxY; y++) {
                let k = String(y);
                if (!dataByBucket[k]) dataByBucket[k] = {};
            }
        } else if (period === 'monthly') {
            let [minY, minM] = buckets[0].split('-').map(Number);
            let [maxY, maxM] = buckets[buckets.length - 1].split('-').map(Number);
            let curY = minY, curM = minM;
            while (curY < maxY || (curY === maxY && curM <= maxM)) {
                let k = `${curY}-${String(curM).padStart(2, '0')}`;
                if (!dataByBucket[k]) dataByBucket[k] = {};
                curM++; if (curM > 12) { curM = 1; curY++; }
            }
        } else if (period === 'weekly') {
            let minD = new Date(buckets[0]), maxD = new Date(buckets[buckets.length - 1]);
            for (let d = new Date(minD); d <= maxD; d.setDate(d.getDate() + 7)) {
                let k = getLocalDateString(d);
                if (!dataByBucket[k]) dataByBucket[k] = {};
            }
        } else { // daily
            let minD = new Date(buckets[0]), maxD = new Date(buckets[buckets.length - 1]);
            for (let d = new Date(minD); d <= maxD; d.setDate(d.getDate() + 1)) {
                let k = getLocalDateString(d);
                if (!dataByBucket[k]) dataByBucket[k] = {};
            }
        }
        buckets = Object.keys(dataByBucket).sort();
    }

    // Format labels per period
    const labels = buckets.map(b => {
        if (period === 'yearly') return b;
        if (period === 'monthly') return formatMonth(b);
        if (period === 'weekly') return formatDate(b);
        return b.slice(5); // daily: MM-DD
    });

    // Only use selected categories that have actual data
    const categoriesArray = selectedCategories.filter(c => c !== 'everything_else' && presentCategories.has(c));
    if (includeEverythingElse && presentCategories.has('Everything else')) {
        categoriesArray.push('Everything else');
    }

    // Daily has no Type toggle, so always use line for it.
    // For yearly/monthly/weekly, respect state.trendChartType so the Type: LINE/BAR button works.
    const chartType = period === 'daily' ? 'line' : state.trendChartType;

    const datasets = categoriesArray.map((cat, i) => {
        const color = CHART_COLORS[i % CHART_COLORS.length];
        let runningTotal = 0;
        const mappedData = buckets.map(b => {
            const val = (dataByBucket[b] && dataByBucket[b][cat]) || 0;
            if (state.trendChartCumulative) { runningTotal += val; return runningTotal; }
            return val;
        });

        if (chartType === 'bar') {
            return {
                label: cat,
                data: mappedData,
                backgroundColor: color,
                borderColor: color,
                borderWidth: 1,
                borderRadius: 6,
            };
        }
        return {
            label: cat,
            data: mappedData,
            backgroundColor: color,
            borderColor: color,
            fill: false,
            tension: 0.35,
            pointRadius: 1.5,
            pointHoverRadius: 5,
            borderWidth: 2,
        };
    });

    const xTickOptions = period === 'weekly'
        ? { maxTicksLimit: 15, font: { size: 10 } }
        : period === 'daily'
        ? { maxTicksLimit: 20, font: { size: 10 } }
        : {};

    return new Chart(ctx, {
        type: chartType,
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 30, bottom: 10 } },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { boxWidth: 12, font: { size: 10, family: 'Inter, sans-serif' } }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: (c) => `${c.dataset.label}: ₹` + c.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    }
                }
            },
            scales: {
                x: { stacked: chartType === 'bar', ticks: xTickOptions },
                y: {
                    stacked: chartType === 'bar',
                    beginAtZero: true,
                    ticks: { callback: v => '₹' + (v >= 1000 ? (v / 1000).toFixed(2) + 'k' : v) }
                }
            }
        }
    });
}

export function buildYearlyTrendChart(ctx) {
    const isDash = _isDashboardCanvas(ctx);
    const activeCatChips = isDash ? [] : Array.from(document.querySelectorAll('#trend-filter-category .chip.active')).map(c => c.dataset.value);
    const isAllCategories = activeCatChips.includes('all') || activeCatChips.length === 0;

    if (!isDash) {
        const titleEl = document.getElementById('chart-yearly-trend-title');
        if (titleEl) titleEl.textContent = isAllCategories ? 'Yearly Spending Trend (Expense+Refund)' : 'Yearly Trend by Category (Expense+Refund)';
    }

    if (isAllCategories) {
        return _buildYearlyTrendSingle(ctx, isDash);
    } else {
        return _buildTrendByCategory(ctx, activeCatChips, 'yearly', isDash);
    }
}

function _buildYearlyTrendSingle(ctx, isDash = false) {
    let currentExpenses = getTrendExpenses(isDash);
    currentExpenses = currentExpenses.filter(e => !e.txnType || e.txnType === 'Expense' || e.txnType === 'Refund' || e.txnType === 'Investment');
    const yearlyData = {};
    currentExpenses.forEach(e => {
        if (!e.date) return;
        const y = e.date.slice(0, 4);
        if (!yearlyData[y]) yearlyData[y] = { expense: 0, investment: 0 };
        if (isRefundTxn(e)) {
            yearlyData[y].expense -= Math.abs(e.amount);
        } else if (e.txnType === 'Investment') {
            yearlyData[y].investment += Math.abs(e.amount);
        } else {
            yearlyData[y].expense += Math.abs(e.amount);
        }
    });
    let years = Object.keys(yearlyData).sort();
    if (years.length > 0) {
        let minY = parseInt(years[0]);
        let maxY = parseInt(years[years.length - 1]);
        for (let y = minY; y <= maxY; y++) {
            let yStr = String(y);
            if (!(yStr in yearlyData)) yearlyData[yStr] = { expense: 0, investment: 0 };
        }
        years = Object.keys(yearlyData).sort();
    }

    let runningExp = 0, runningInv = 0;
    const mappedExp = years.map(y => {
        const val = yearlyData[y].expense;
        if (state.trendChartCumulative) { runningExp += val; return runningExp; }
        return val;
    });
    const mappedInv = years.map(y => {
        const val = yearlyData[y].investment;
        if (state.trendChartCumulative) { runningInv += val; return runningInv; }
        return val;
    });

    const datasets = [];
    const hasExp = mappedExp.some(v => v !== 0);
    const hasInv = mappedInv.some(v => v !== 0);
    if (hasExp || !hasInv) {
        datasets.push({
            label: 'Expense+Refund',
            data: mappedExp,
            backgroundColor: state.trendChartType === 'line' ? 'rgba(167, 139, 250, 0.08)' : 'rgba(167, 139, 250, 0.7)',
            borderColor: '#a78bfa',
            fill: true,
            tension: 0.35,
            pointRadius: state.trendChartType === 'line' ? 1.5 : 0,
            pointHoverRadius: state.trendChartType === 'line' ? 5 : 0,
            borderWidth: state.trendChartType === 'line' ? 2 : 1,
            borderRadius: state.trendChartType === 'line' ? 0 : 6,
            stack: 'Stack 0'
        });
    }
    if (hasInv) {
        datasets.push({
            label: 'Investment',
            data: mappedInv,
            backgroundColor: state.trendChartType === 'line' ? 'rgba(251, 191, 36, 0.08)' : 'rgba(251, 191, 36, 0.7)',
            borderColor: '#fbbf24',
            fill: true,
            tension: 0.35,
            pointRadius: state.trendChartType === 'line' ? 1.5 : 0,
            pointHoverRadius: state.trendChartType === 'line' ? 5 : 0,
            borderWidth: state.trendChartType === 'line' ? 2 : 1,
            borderRadius: state.trendChartType === 'line' ? 0 : 6,
            stack: 'Stack 0'
        });
    }

    return new Chart(ctx, {
        type: state.trendChartType,
        data: {
            labels: years,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 30 } },
            plugins: {
                legend: { display: datasets.length > 1, position: 'bottom', labels: { boxWidth: 12, font: { size: 10, family: 'Inter, sans-serif' } } },
                tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ₹` + c.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) } }
            },
            scales: {
                x: { stacked: state.trendChartType === 'bar' },
                y: { stacked: state.trendChartType === 'bar', beginAtZero: true, ticks: { callback: v => (v < 0 ? '-₹' : '₹') + (Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(2) + 'k' : Math.abs(v)) } }
            }
        }
    });
}

export function buildMonthlyTrendChart(ctx) {
    const isDash = _isDashboardCanvas(ctx);
    const activeCatChips = isDash ? [] : Array.from(document.querySelectorAll('#trend-filter-category .chip.active')).map(c => c.dataset.value);
    const isAllCategories = activeCatChips.includes('all') || activeCatChips.length === 0;

    if (!isDash) {
        const titleEl = document.getElementById('chart-monthly-trend-title');
        if (titleEl) titleEl.textContent = isAllCategories ? 'Monthly Spending Trend (Expense+Refund)' : 'Monthly Trend by Category (Expense+Refund)';
    }

    if (isAllCategories) {
        return _buildMonthlyTrendSingle(ctx, isDash);
    } else {
        return _buildTrendByCategory(ctx, activeCatChips, 'monthly', isDash);
    }
}

function _buildMonthlyTrendSingle(ctx, isDash = false) {
    let currentExpenses = getTrendExpenses(isDash);
    currentExpenses = currentExpenses.filter(e => !e.txnType || e.txnType === 'Expense' || e.txnType === 'Refund' || e.txnType === 'Investment');
    const monthlyData = {};
    currentExpenses.forEach(e => {
        if (!e.date) return;
        const m = e.date.slice(0, 7);
        if (!monthlyData[m]) monthlyData[m] = { expense: 0, investment: 0 };
        if (isRefundTxn(e)) {
            monthlyData[m].expense -= Math.abs(e.amount);
        } else if (e.txnType === 'Investment') {
            monthlyData[m].investment += Math.abs(e.amount);
        } else {
            monthlyData[m].expense += Math.abs(e.amount);
        }
    });
    let months = Object.keys(monthlyData).sort();
    if (months.length > 0) {
        let [minY, minM] = months[0].split('-').map(Number);
        let [maxY, maxM] = months[months.length - 1].split('-').map(Number);
        let curY = minY, curM = minM;
        while (curY < maxY || (curY === maxY && curM <= maxM)) {
            let mStr = `${curY}-${String(curM).padStart(2, '0')}`;
            if (!monthlyData[mStr]) monthlyData[mStr] = { expense: 0, investment: 0 };
            curM++;
            if (curM > 12) { curM = 1; curY++; }
        }
        months = Object.keys(monthlyData).sort();
    }

    let runningExp = 0, runningInv = 0;
    const mappedExp = months.map(m => {
        const val = monthlyData[m].expense;
        if (state.trendChartCumulative) { runningExp += val; return runningExp; }
        return val;
    });
    const mappedInv = months.map(m => {
        const val = monthlyData[m].investment;
        if (state.trendChartCumulative) { runningInv += val; return runningInv; }
        return val;
    });

    const datasets = [];
    const hasExp = mappedExp.some(v => v !== 0);
    const hasInv = mappedInv.some(v => v !== 0);
    if (hasExp || !hasInv) {
        datasets.push({
            label: 'Expense+Refund',
            data: mappedExp,
            backgroundColor: state.trendChartType === 'line' ? 'rgba(244, 114, 182, 0.08)' : 'rgba(244, 114, 182, 0.7)',
            borderColor: '#f472b6',
            fill: true,
            tension: 0.35,
            pointRadius: state.trendChartType === 'line' ? 1.5 : 0,
            pointHoverRadius: state.trendChartType === 'line' ? 5 : 0,
            borderWidth: state.trendChartType === 'line' ? 2 : 1,
            borderRadius: state.trendChartType === 'line' ? 0 : 6,
            stack: 'Stack 0'
        });
    }
    if (hasInv) {
        datasets.push({
            label: 'Investment',
            data: mappedInv,
            backgroundColor: state.trendChartType === 'line' ? 'rgba(251, 191, 36, 0.08)' : 'rgba(251, 191, 36, 0.7)',
            borderColor: '#fbbf24',
            fill: true,
            tension: 0.35,
            pointRadius: state.trendChartType === 'line' ? 1.5 : 0,
            pointHoverRadius: state.trendChartType === 'line' ? 5 : 0,
            borderWidth: state.trendChartType === 'line' ? 2 : 1,
            borderRadius: state.trendChartType === 'line' ? 0 : 6,
            stack: 'Stack 0'
        });
    }

    return new Chart(ctx, {
        type: state.trendChartType,
        data: {
            labels: months.map(formatMonth),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 30 } },
            plugins: {
                legend: { display: datasets.length > 1, position: 'bottom', labels: { boxWidth: 12, font: { size: 10, family: 'Inter, sans-serif' } } },
                tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ₹` + c.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) } }
            },
            scales: {
                x: { stacked: state.trendChartType === 'bar' },
                y: { stacked: state.trendChartType === 'bar', beginAtZero: true, ticks: { callback: v => (v < 0 ? '-₹' : '₹') + (Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(2) + 'k' : Math.abs(v)) } }
            }
        }
    });
}

export function getWeekBoundaries(dateStr) {
    const d = parseLocalDate(dateStr);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const start = new Date(d.setDate(diff));
    return getLocalDateString(start);
}

export function buildWeeklyTrendChart(ctx) {
    const isDash = _isDashboardCanvas(ctx);
    const activeCatChips = isDash ? [] : Array.from(document.querySelectorAll('#trend-filter-category .chip.active')).map(c => c.dataset.value);
    const isAllCategories = activeCatChips.includes('all') || activeCatChips.length === 0;

    if (!isDash) {
        const titleEl = document.getElementById('chart-weekly-trend-title');
        if (titleEl) titleEl.textContent = isAllCategories ? 'Weekly Spending Trend (Expense+Refund)' : 'Weekly Trend by Category (Expense+Refund)';
    }

    if (isAllCategories) {
        return _buildWeeklyTrendSingle(ctx, isDash);
    } else {
        return _buildTrendByCategory(ctx, activeCatChips, 'weekly', isDash);
    }
}

function _buildWeeklyTrendSingle(ctx, isDash = false) {
    let currentExpenses = getTrendExpenses(isDash);
    currentExpenses = currentExpenses.filter(e => !e.txnType || e.txnType === 'Expense' || e.txnType === 'Refund' || e.txnType === 'Investment');
    const weeklyData = {};
    currentExpenses.forEach(e => {
        if (!e.date) return;
        const w = getWeekBoundaries(e.date);
        if (!weeklyData[w]) weeklyData[w] = { expense: 0, investment: 0 };
        if (isRefundTxn(e)) {
            weeklyData[w].expense -= Math.abs(e.amount);
        } else if (e.txnType === 'Investment') {
            weeklyData[w].investment += Math.abs(e.amount);
        } else {
            weeklyData[w].expense += Math.abs(e.amount);
        }
    });
    let weeks = Object.keys(weeklyData).sort();
    if (weeks.length > 0) {
        let minD = new Date(weeks[0]);
        let maxD = new Date(weeks[weeks.length - 1]);
        for (let d = new Date(minD); d <= maxD; d.setDate(d.getDate() + 7)) {
            let dStr = getLocalDateString(d);
            if (!(dStr in weeklyData)) weeklyData[dStr] = { expense: 0, investment: 0 };
        }
        weeks = Object.keys(weeklyData).sort();
    }

    let runningExp = 0, runningInv = 0;
    const mappedExp = weeks.map(w => {
        const val = weeklyData[w].expense;
        if (state.trendChartCumulative) { runningExp += val; return runningExp; }
        return val;
    });
    const mappedInv = weeks.map(w => {
        const val = weeklyData[w].investment;
        if (state.trendChartCumulative) { runningInv += val; return runningInv; }
        return val;
    });

    const datasets = [];
    const hasExp = mappedExp.some(v => v !== 0);
    const hasInv = mappedInv.some(v => v !== 0);
    if (hasExp || !hasInv) {
        datasets.push({
            label: 'Expense+Refund',
            data: mappedExp,
            borderColor: '#34d399',
            backgroundColor: state.trendChartType === 'line' ? 'rgba(52, 211, 153, 0.08)' : 'rgba(52, 211, 153, 0.7)',
            fill: true,
            tension: 0.35,
            pointRadius: state.trendChartType === 'line' ? 2 : 0,
            pointHoverRadius: state.trendChartType === 'line' ? 6 : 0,
            borderWidth: state.trendChartType === 'line' ? 2 : 1,
            borderRadius: state.trendChartType === 'line' ? 0 : 6,
            stack: 'Stack 0'
        });
    }
    if (hasInv) {
        datasets.push({
            label: 'Investment',
            data: mappedInv,
            borderColor: '#fbbf24',
            backgroundColor: state.trendChartType === 'line' ? 'rgba(251, 191, 36, 0.08)' : 'rgba(251, 191, 36, 0.7)',
            fill: true,
            tension: 0.35,
            pointRadius: state.trendChartType === 'line' ? 2 : 0,
            pointHoverRadius: state.trendChartType === 'line' ? 6 : 0,
            borderWidth: state.trendChartType === 'line' ? 2 : 1,
            borderRadius: state.trendChartType === 'line' ? 0 : 6,
            stack: 'Stack 0'
        });
    }

    return new Chart(ctx, {
        type: state.trendChartType,
        data: {
            labels: weeks.map(w => formatDate(w)),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 30 } },
            plugins: {
                legend: { display: datasets.length > 1, position: 'bottom', labels: { boxWidth: 12, font: { size: 10, family: 'Inter, sans-serif' } } },
                tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ₹` + c.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) } }
            },
            scales: {
                x: { stacked: state.trendChartType === 'bar', ticks: { maxTicksLimit: 15, font: { size: 10 } } },
                y: { stacked: state.trendChartType === 'bar', beginAtZero: true, ticks: { callback: v => (v < 0 ? '-₹' : '₹') + (Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(2) + 'k' : Math.abs(v)) } }
            }
        }
    });
}

export function buildTxnModeChart(ctx) {
    let currentExpenses = getGlobalFilteredExpenses();
    currentExpenses = currentExpenses.filter(e => !e.txnType || e.txnType === 'Expense' || e.txnType === 'Refund');
    const typeData = {};
    currentExpenses.forEach(e => {
        const mode = e.txnMode || 'Unknown';
        const amt = isRefundTxn(e) ? -Math.abs(e.amount) : Math.abs(e.amount);
        typeData[mode] = (typeData[mode] || 0) + amt;
    });
    const validData = Object.entries(typeData).filter(s => s[1] > 0);
    const labels = validData.map(s => s[0]);
    const data = validData.map(s => s[1]);

    return new Chart(ctx, {
        type: 'polarArea',
        data: {
            labels,
            datasets: [{
                label: 'Expense+Refund',
                data,
                backgroundColor: [
                    'rgba(99, 138, 255, 0.6)',
                    'rgba(167, 139, 250, 0.6)',
                    'rgba(244, 114, 182, 0.6)',
                    'rgba(52, 211, 153, 0.6)',
                ],
                borderWidth: 0,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'right',
                    labels: {
                        color: '#e2e8f0',
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 12,
                        font: { size: 11 },
                        generateLabels: function (chart) {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map((label, i) => {
                                    const meta = chart.getDatasetMeta(0);
                                    const style = meta.controller.getStyle(i);
                                    const value = data.datasets[0].data[i];
                                    const abs = Math.abs(value);
                                    let valStr = abs >= 1000 ? (abs / 1000).toFixed(2) + 'k' : abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                    return {
                                        text: `${label} (₹${valStr})`,
                                        fontColor: '#e2e8f0',
                                        fillStyle: style.backgroundColor,
                                        strokeStyle: style.borderColor,
                                        lineWidth: style.borderWidth,
                                        hidden: meta.data[i].hidden,
                                        index: i
                                    };
                                });
                            }
                            return [];
                        }
                    }
                },
                tooltip: { callbacks: { label: (c) => c.label + ': ₹' + c.parsed.r.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) } }
            }
        }
    });
}

export function buildTopExpensesChart(ctx) {
    let currentExpenses = getGlobalFilteredExpenses();
    currentExpenses = currentExpenses.filter(e => !e.txnType || e.txnType === 'Expense' || e.txnType === 'Refund');
    const grouped = mergeRefundTransactions(currentExpenses);
    const top = grouped
        .filter(g => g && g.main && !isRefundTxn(g.main) && g.netAmount > 0)
        .sort((a, b) => b.netAmount - a.netAmount)
        .slice(0, 10);

    const safeLabels = top.map(g => {
        const e = g.main;
        const raw = e.note || e.category;
        const clean = raw.replace(/^[^\p{L}\p{N}]+/u, '').trim();
        return clean || raw;
    });

    const values = top.map(g => g.netAmount);

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: safeLabels,
            datasets: [{
                label: 'Expense+Refund',
                data: values,
                backgroundColor: CHART_COLORS.slice(0, 10),
                borderWidth: 0,
                borderRadius: 6,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { right: barValueRightPadding(values) } },
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                datalabels: horizontalBarDatalabels,
                tooltip: {
                    callbacks: {
                        label: (c) => '₹' + c.parsed.x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                        afterLabel: (c) => top[c.dataIndex].main.date
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { callback: v => '₹' + (v / 1000).toFixed(2) + 'k' }
                }
            }
        }
    });
}
export function startScheduledInlineEdit(idx) {
    if (typeof window !== 'undefined' && window.innerWidth <= 860) {
        if (typeof editScheduledTransaction === 'function') editScheduledTransaction(idx);
        return;
    }
    state.inlineEditSchedIdx = idx;
    renderScheduledTransactions();
    setTimeout(() => {
        const amtInput = document.getElementById(`sched-inline-amount-${idx}`);
        if (amtInput) amtInput.focus();
    }, 0);
}

export function cancelScheduledInlineEdit() {
    state.inlineEditSchedIdx = null;
    renderScheduledTransactions();
}

export function isScheduledInlineEditModified(idx) {
    const st = state.scheduledTransactions[idx];
    if (!st) return false;
    const amtInput = document.getElementById(`sched-inline-amount-${idx}`);
    const catSelect = document.getElementById(`sched-inline-category-${idx}`);
    const typeSelect = document.getElementById(`sched-inline-type-${idx}`);
    const modeSelect = document.getElementById(`sched-inline-mode-${idx}`);
    const noteInput = document.getElementById(`sched-inline-note-${idx}`);
    if (!amtInput) return false;

    const initialAmtStr = st.amountExpression || (
        Math.abs(st.amount) % 1 === 0
            ? Math.abs(st.amount).toString()
            : Math.abs(st.amount).toFixed(2)
    );
    const initialCategory = st.category || '';
    const initialType = st.txnType || 'Expense';
    const initialMode = st.txnMode || '';
    const initialNote = st.note || '';

    const currentAmt = (amtInput.value || '').trim();
    const currentCategory = catSelect ? catSelect.value : initialCategory;
    const currentType = typeSelect ? typeSelect.value : initialType;
    const currentMode = modeSelect ? modeSelect.value : initialMode;
    const currentNote = noteInput ? noteInput.value.trim() : initialNote;

    return (currentAmt !== initialAmtStr) ||
           (currentCategory !== initialCategory) ||
           (currentType !== initialType) ||
           (currentMode !== initialMode) ||
           (currentNote !== initialNote);
}

export async function saveScheduledInlineEdit(idx) {
    if (state.cloudSyncInProgress) {
        toast('Please wait for cloud sync to complete...', 'error');
        return;
    }
    const st = state.scheduledTransactions[idx];
    if (!st) return;

    const amtInput = document.getElementById(`sched-inline-amount-${idx}`);
    const catSelect = document.getElementById(`sched-inline-category-${idx}`);
    const typeSelect = document.getElementById(`sched-inline-type-${idx}`);
    const modeSelect = document.getElementById(`sched-inline-mode-${idx}`);
    const noteInput = document.getElementById(`sched-inline-note-${idx}`);
    if (!amtInput) return;

    const rawAmount = (amtInput.value || '').trim();
    if (!rawAmount) {
        toast('Please enter an amount', 'error');
        amtInput.focus();
        return;
    }

    const sanitized = rawAmount.replace(/\s+/g, '');
    if (!/^[\d.+\-*]+$/.test(sanitized)) {
        toast('Invalid characters in amount expression', 'error');
        amtInput.focus();
        return;
    }

    const evaluated = evaluateExpression(rawAmount);
    const parsedAmt = roundAmount(evaluated);
    if (isNaN(parsedAmt)) {
        toast('Please enter a valid amount', 'error');
        amtInput.focus();
        return;
    }

    const finalType = typeSelect ? typeSelect.value : (st.txnType || 'Expense');
    const isNegative = finalType === 'Income' || finalType === 'Refund';
    const finalAmount = isNegative ? -Math.abs(parsedAmt) : Math.abs(parsedAmt);
    const hasOperators = rawAmount.split(/[-+*]/).filter(Boolean).length > 1;
    const finalExpression = hasOperators ? rawAmount : '';
    const finalCategory = catSelect ? catSelect.value.trim() : st.category;
    const finalMode = modeSelect ? modeSelect.value.trim() : st.txnMode;
    const finalNote = noteInput ? noteInput.value.trim() : st.note;

    st.category = finalCategory;
    st.txnType = finalType;
    st.txnMode = finalMode;
    st.note = finalNote;
    st.amount = finalAmount;
    st.amountExpression = finalExpression;

    state.inlineEditSchedIdx = null;
    toast('Saving scheduled transaction...', 'info');

    try {
        await saveScheduledCSV();
        toast('Scheduled transaction updated!', 'success');
        renderScheduledTransactions();

        setTimeout(() => {
            const row = document.getElementById(`sched-row-${idx}`);
            if (row) {
                row.style.transition = 'background-color 0.5s ease';
                const oldBg = row.style.backgroundColor;
                row.style.backgroundColor = 'rgba(99, 138, 255, 0.3)';
                setTimeout(() => {
                    row.style.backgroundColor = oldBg;
                }, 1500);
            }
        }, 50);
    } catch (err) {
        console.error('Scheduled inline edit save failed:', err);
        toast('Error saving scheduled transaction to cloud', 'error');
        renderScheduledTransactions();
    }
}

function attachScheduledInlineEventListeners(idx) {
    const amtInput = document.getElementById(`sched-inline-amount-${idx}`);
    const typeSelect = document.getElementById(`sched-inline-type-${idx}`);
    const catSelect = document.getElementById(`sched-inline-category-${idx}`);
    const modeSelect = document.getElementById(`sched-inline-mode-${idx}`);
    const noteInput = document.getElementById(`sched-inline-note-${idx}`);
    const previewPill = document.getElementById(`sched-inline-preview-${idx}`);
    if (!amtInput) return;

    function updatePreview() {
        const raw = (amtInput.value || '').trim();
        if (!raw || !previewPill) {
            if (previewPill) previewPill.style.display = 'none';
            return;
        }
        const sanitized = raw.replace(/\s+/g, '');
        if (!/^[\d.+\-*]+$/.test(sanitized)) {
            previewPill.textContent = 'Invalid expression';
            previewPill.className = 'inline-edit-preview-error';
            previewPill.style.display = 'inline-block';
            return;
        }
        const evaluated = evaluateExpression(raw);
        const parsed = roundAmount(evaluated);
        if (isNaN(parsed)) {
            previewPill.textContent = 'Invalid expression';
            previewPill.className = 'inline-edit-preview-error';
            previewPill.style.display = 'inline-block';
            return;
        }
        const curType = typeSelect ? typeSelect.value : (state.scheduledTransactions[idx]?.txnType || 'Expense');
        const isNegative = curType === 'Income' || curType === 'Refund';
        const hasOperators = raw.split(/[-+*]/).filter(Boolean).length > 1;
        if (hasOperators) {
            const displaySign = isNegative ? '-' : '';
            previewPill.textContent = `= ${displaySign}₹${Math.abs(parsed).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            previewPill.className = 'inline-edit-preview-pill';
            previewPill.style.display = 'inline-block';
        } else {
            previewPill.style.display = 'none';
        }
    }

    amtInput.addEventListener('input', updatePreview);
    if (typeSelect) typeSelect.addEventListener('change', updatePreview);
    updatePreview();

    function handleKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveScheduledInlineEdit(idx);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelScheduledInlineEdit();
        }
    }

    [amtInput, noteInput, catSelect, typeSelect, modeSelect].forEach(el => {
        if (el) el.addEventListener('keydown', handleKeydown);
    });
}

export function renderScheduledTransactions() {
    const tbody = $('#scheduled-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    state.scheduledTransactions.forEach((st, idx) => {
        let freqStr = escHtml(st.frequency);
        if (st.frequency === 'one-off') {
            freqStr = 'One-off Schedule';
        } else if (st.frequency === 'instant') {
            freqStr = 'Quick Add Template';
        } else if (['biweekly', 'bimonthly', 'quarterly'].includes(st.frequency)) {
            if (st.frequency === 'biweekly' && st.recur_weekdays && st.recur_weekdays.length > 0) {
                const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                let dayNames = st.recur_weekdays.map(d => days[d]).join(', ');
                freqStr += ` (on ${dayNames})`;
            } else {
                const anchor = st.start_date || st.next_run_date;
                if (anchor) freqStr += ` (from ${formatDate(anchor)})`;
            }
        } else if (st.frequency === 'weekly' && st.recur_weekdays && st.recur_weekdays.length > 0) {
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            let dayNames = st.recur_weekdays.map(d => days[d]).join(', ');
            freqStr += ` (on ${dayNames})`;
        } else if (st.frequency === 'weekly' && !isNaN(st.recur_weekday)) {
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            freqStr += ` (on ${days[st.recur_weekday]})`;
        } else if (st.frequency === 'monthly' && !isNaN(st.recur_day)) {
            freqStr += ` (on ${st.recur_day})`;
        } else if (st.frequency === 'yearly' && !isNaN(st.recur_month) && !isNaN(st.recur_day)) {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            freqStr += ` (on ${months[st.recur_month - 1]} ${st.recur_day})`;
        }

        if (st.end_condition === 'enabled' && st.end_date && !isNaN(st.max_occurrences)) {
            freqStr += `<br><span style="font-size: 0.82rem; color: var(--text-secondary); text-transform: none; white-space: nowrap;">Ends: ${formatDate(st.end_date)} (${st.run_count || 0}/${st.max_occurrences} runs)</span>`;
        } else if (st.end_condition === 'until_date' && st.end_date) {
            freqStr += `<br><span style="font-size: 0.82rem; color: var(--text-secondary); text-transform: none; white-space: nowrap;">Ends: ${formatDate(st.end_date)}</span>`;
        } else if (st.end_condition === 'after_occurrences' && !isNaN(st.max_occurrences)) {
            freqStr += `<br><span style="font-size: 0.82rem; color: var(--text-secondary); text-transform: none; white-space: nowrap;">Runs: ${st.run_count || 0}/${st.max_occurrences}</span>`;
        }

        const isInlineEditing = state.inlineEditSchedIdx === idx && (typeof window === 'undefined' || window.innerWidth > 860);

        const tr = document.createElement('tr');
        tr.className = `touchable-row ${isInlineEditing ? 'quick-editing' : ''}`;
        tr.setAttribute("data-sched-idx", idx);
        tr.id = `sched-row-${idx}`;
        tr.ondblclick = (event) => {
            if (typeof window !== 'undefined' && window.innerWidth > 860 && !event.target.closest('input, select, button, a')) {
                startScheduledInlineEdit(idx);
            }
        };

        if (isInlineEditing) {
            const initialAmtVal = st.amountExpression || (
                Math.abs(st.amount) % 1 === 0
                    ? Math.abs(st.amount).toString()
                    : Math.abs(st.amount).toFixed(2)
            );

            const curCat = st.category || '';
            const allCats = Array.from(new Set([curCat, ...(state.categories || [])])).filter(Boolean);
            const catOptions = allCats.map(c => `<option value="${escHtml(c)}" ${c === curCat ? 'selected' : ''}>${escHtml(c)}</option>`).join('');

            const curType = st.txnType || 'Expense';
            const defaultTypes = ['Expense', 'Refund', 'Income', 'Investment', 'Transfer'];
            const allTypes = Array.from(new Set([curType, ...(state.txnTypes && state.txnTypes.length > 0 ? state.txnTypes : defaultTypes)])).filter(Boolean);
            const typeOptions = allTypes.map(t => `<option value="${escHtml(t)}" ${t === curType ? 'selected' : ''}>${escHtml(t)}</option>`).join('');

            const curMode = st.txnMode || '';
            const allModes = Array.from(new Set([curMode, ...(state.txnModes || [])])).filter(Boolean);
            const modeOptions = allModes.map(m => `<option value="${escHtml(m)}" ${m === curMode ? 'selected' : ''}>${escHtml(m)}</option>`).join('');

            tr.innerHTML = `
                <td data-label="Category" class="inline-edit-cell">
                    <select id="sched-inline-category-${idx}" class="inline-edit-input inline-edit-select">
                        ${catOptions}
                    </select>
                </td>
                <td data-label="Type" class="inline-edit-cell">
                    <select id="sched-inline-type-${idx}" class="inline-edit-input inline-edit-select">
                        ${typeOptions}
                    </select>
                </td>
                <td data-label="Mode" class="inline-edit-cell">
                    <select id="sched-inline-mode-${idx}" class="inline-edit-input inline-edit-select">
                        ${modeOptions}
                    </select>
                </td>
                <td data-label="Note" class="inline-edit-cell">
                    <div class="inline-edit-note-wrap">
                        <input type="text" id="sched-inline-note-${idx}" class="inline-edit-input inline-edit-note-input" value="${escHtml(st.note || '')}" placeholder="Note..." autocomplete="off" />
                    </div>
                </td>
                <td data-label="Amount" class="inline-edit-cell">
                    <div class="inline-edit-amount-wrap">
                        <input type="text" id="sched-inline-amount-${idx}" class="inline-edit-input inline-edit-amount-input" value="${escHtml(initialAmtVal)}" placeholder="Amount / expr" autocomplete="off" />
                        <span id="sched-inline-preview-${idx}" class="inline-edit-preview-pill" style="display: none;"></span>
                    </div>
                </td>
                <td data-label="Freq" style="text-transform: capitalize;">${freqStr}</td>
                <td data-label="Next Run">${formatDate(st.next_run_date)}</td>
                <td data-label="Last Run">${st.last_run_date ? formatDate(st.last_run_date) : '—'}</td>
                <td data-label="Actions" class="inline-edit-cell" style="text-align: right;">
                    <div class="row-actions inline-edit-actions" style="justify-content: flex-end;">
                        <button type="button" class="row-btn inline-btn-save" onclick="saveScheduledInlineEdit(${idx})" title="Save (Enter)">✓</button>
                        <button type="button" class="row-btn inline-btn-cancel" onclick="cancelScheduledInlineEdit()" title="Cancel (Esc)">✕</button>
                    </div>
                </td>
            `;
        } else {
            let typeBadge = txnTypeBadgeHTML(st.txnType);
            let modeBadge = txnModeBadgeHTML(st.txnMode, state.hideSourceTxnId);
            let mobileBadgesHtml = (typeBadge || modeBadge) ? `<div class="badges-wrapper hide-on-desktop">${modeBadge}${typeBadge}</div>` : '';
            let typeName = st.txnType || 'Expense';
            let typeCls = typeName.toLowerCase();

            tr.innerHTML = `
                <td data-label="Category">${escHtml(st.category)}</td>
                <td data-label="Type"><span class="badge-txn-type type-${typeCls}">${escHtml(typeName)}</span></td>
                <td data-label="Mode" title="${escHtml(st.txnMode || '')}"><span class="mode-cell">${escHtml(st.txnMode || '—')}</span></td>
                <td data-label="Note" class="${!st.note && !typeBadge && !modeBadge ? 'empty-note' : ''}">
                    <div class="note-content">
                        <span class="${!st.note ? 'empty-dash' : ''}">${st.note ? escHtml(st.note) : ''}</span>
                        ${mobileBadgesHtml}
                    </div>
                </td>
                <td data-label="Amount" style="text-align: right;" class="${amountClass(st)}">
                    ${renderAmountHTML(st)}
                </td>
                <td data-label="Freq" style="text-transform: capitalize;">${freqStr}</td>
                <td data-label="Next Run">${formatDate(st.next_run_date)}</td>
                <td data-label="Last Run">${st.last_run_date ? formatDate(st.last_run_date) : '—'}</td>
                <td data-label="Actions" style="text-align: right;">
                    <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: center; ${st.disabled ? 'text-decoration: none;' : ''}">
                        <button class="btn btn-sm btn-secondary btn-toggle-disable hide-on-mobile" data-idx="${idx}" style="background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border);" title="${st.disabled ? 'Enable' : 'Disable'}">${st.disabled ? '▶️' : '⏸️'}</button>
                        <button class="btn btn-sm btn-secondary hide-on-mobile btn-quick-edit" onclick="startScheduledInlineEdit(${idx})" style="background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border);" title="Quick Edit">⚡</button>
                        <button class="btn btn-sm btn-secondary hide-on-mobile" onclick="editScheduledTransaction(${idx})" style="background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border);" title="Edit">✏️</button>
                        <button class="btn btn-sm btn-danger btn-del hide-on-mobile" data-idx="${idx}" title="Delete">🗑️</button>
                        <button class="row-btn hide-on-desktop mobile-menu-btn" onclick="openScheduledMobileMenu(${idx})" title="Options">⋮</button>
                    </div>
                </td>
            `;

            if (st.disabled) {
                tr.style.opacity = '0.5';
                Array.from(tr.querySelectorAll('td:not(:last-child)')).forEach(td => {
                    td.style.textDecoration = 'line-through';
                });
            }

            const toggleBtn = tr.querySelector('.btn-toggle-disable');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', async () => {
                    toggleBtn.disabled = true;
                    const wasDisabled = st.disabled;
                    st.disabled = !st.disabled;

                    if (wasDisabled && !st.disabled) {
                        const today = getLocalDateString();
                        if (st.next_run_date && st.next_run_date < today && st.frequency !== 'instant' && st.frequency !== 'one-off') {
                            while (st.next_run_date < today) {
                                st.next_run_date = calculateNextRunDate(st.frequency, st, st.next_run_date);
                            }
                        }
                    }

                    const syncInd = document.getElementById('sync-indicator');
                    if (syncInd) syncInd.classList.remove('hidden');

                    try {
                        await saveScheduledCSV();
                        renderScheduledTransactions();
                        toast(st.disabled ? 'Scheduled transaction disabled' : 'Scheduled transaction enabled', 'success');
                    } catch (e) {
                        console.error('Failed to toggle disabled state:', e);
                        st.disabled = !st.disabled;
                        toggleBtn.disabled = false;
                        toast('Failed to update scheduled transaction', 'error');
                    } finally {
                        if (syncInd) syncInd.classList.add('hidden');
                    }
                });
            }

            const delBtn = tr.querySelector('.btn-del');
            if (delBtn) {
                delBtn.addEventListener('click', () => {
                    openModal({
                        title: 'Delete Scheduled Transaction',
                        message: `Are you sure you want to delete this scheduled transaction?`,
                        confirmLabel: 'Delete',
                        onConfirm: async () => {
                            state.scheduledTransactions.splice(idx, 1);
                            await saveScheduledCSV();
                            renderScheduledTransactions();
                            toast('Scheduled transaction deleted', 'success');
                        }
                    });
                });
            }
        }

        tbody.appendChild(tr);

        if (isInlineEditing) {
            attachScheduledInlineEventListeners(idx);
        }
    });
}

if (typeof window !== 'undefined') {
    window.startScheduledInlineEdit = startScheduledInlineEdit;
    window.saveScheduledInlineEdit = saveScheduledInlineEdit;
    window.cancelScheduledInlineEdit = cancelScheduledInlineEdit;
    window.renderScheduledTransactions = renderScheduledTransactions;
}

export function buildDailyBalanceChart(ctx) {
    let currentExpenses = getGlobalFilteredExpenses();
    const dailyBalance = {};
    
    currentExpenses.forEach(e => {
        if (!e.date) return;
        if (!dailyBalance[e.date]) dailyBalance[e.date] = 0;
        
        const amt = Math.abs(e.amount);
        const isRefund = isRefundTxn(e);
        const t = isRefund ? 'Refund' : (e.txnType || 'Expense');
        
        if (t === 'Income' || t === 'Refund') {
            dailyBalance[e.date] += amt;
        } else if (t === 'Expense' || t === 'Investment') {
            dailyBalance[e.date] -= amt;
        }
    });

    let days = Object.keys(dailyBalance).sort();
    if (days.length > 0) {
        let minD = new Date(days[0]);
        let maxD = new Date(days[days.length - 1]);
        for (let d = new Date(minD); d <= maxD; d.setDate(d.getDate() + 1)) {
            let dStr = getLocalDateString(d);
            if (!dailyBalance[dStr]) dailyBalance[dStr] = 0;
        }
        days = Object.keys(dailyBalance).sort();
    }

    let runningTotal = 0;
    const mappedData = days.map(d => {
        runningTotal += dailyBalance[d];
        return runningTotal;
    });

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: days.map(d => d.slice(5)),
            datasets: [{
                label: 'Daily Balance',
                data: mappedData,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                fill: true,
                tension: 0.35,
                pointRadius: 1.5,
                pointHoverRadius: 5,
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 30 } },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (c) => 'Balance: ₹' + c.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) } }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: v => '₹' + (v / 1000).toFixed(2) + 'k' }
                },
                x: {
                    ticks: { maxTicksLimit: 20, font: { size: 10 } }
                }
            }
        }
    });
}

