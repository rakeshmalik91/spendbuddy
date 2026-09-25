import { buildDailyTrendChart, renderChart, buildTopExpensesChart, buildMonthlyExpenseChart, buildCategoryDonut } from "./chart_builders.js";
import { calculateNextRunDate, getLocalDateString, formatDate, escHtml, toast, getCategoryForMerchant, getTxnTypeForMerchant, findMatchingKeywordRule, amountClass, txnTypeBadgeHTML, txnModeBadgeHTML, setupInfiniteScroll, getLastLocation, mapTxnMode, getTxnModeForMerchant, getCurrentLocationTag, getDisplayTxnId, getDisplayTxnIdList, getDisplaySource, getDisplaySourceList, renderAmountHTML, isRefundTxn, normalizeTxnType, mergeRefundTransactions, renderRefundCollapsibleSubrow, isSameDaySameAmountSingleRefund } from "../utils/helpers.js";
import { getDaySeparatorHTML } from "./settings.js";
import { $$, $ } from "../core/init.js";
import { state } from "../core/state.js";
import { getGlobalFilteredExpenses, getPrevGlobalFilteredExpenses, getPrev5GlobalFilteredExpenses } from "./time_filter.js";
import { saveYearCSV } from "./form.js";
import { renderAll } from "./render_all.js";
import { isDuplicateTxn, consumeRawSmsTransaction, showSmsApprovalModal } from "./sms_approval.js";
import { showScheduledApprovalModal } from "./scheduled_approval.js";

/* ══════════════ DASHBOARD ══════════════ */

export function renderDashboard() {
    const currentExpenses = getGlobalFilteredExpenses();
    const baseExpenses = currentExpenses.filter(e => !e.txnType || e.txnType === 'Expense' || e.txnType === 'Refund');
    const totalRefunds = baseExpenses.filter(e => e.txnType === 'Refund' || (!e.txnType && e.amount < 0)).reduce((s, e) => s + Math.abs(e.amount), 0);
    const totalExpense = baseExpenses.filter(e => e.txnType === 'Expense' || (!e.txnType && e.amount > 0)).reduce((s, e) => s + Math.abs(e.amount), 0);
    const net = totalExpense - totalRefunds;

    const totalIncome = currentExpenses.filter(e => e.txnType === 'Income').reduce((s, e) => s + Math.abs(e.amount), 0);
    const totalInvestment = currentExpenses.filter(e => e.txnType === 'Investment').reduce((s, e) => s + Math.abs(e.amount), 0);
    const totalTransfer = currentExpenses.filter(e => e.txnType === 'Transfer').reduce((s, e) => s + Math.abs(e.amount), 0);

    if ($('#net-balance')) $('#net-balance').textContent = (net >= 0 ? '₹' : '-₹') + Math.abs(net).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if ($('#small-expense')) $('#small-expense').textContent = '₹' + totalExpense.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if ($('#small-refunds')) $('#small-refunds').textContent = '₹' + totalRefunds.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if ($('#total-income-real')) $('#total-income-real').textContent = '₹' + totalIncome.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if ($('#total-investment')) $('#total-investment').textContent = '₹' + totalInvestment.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if ($('#total-transfer')) $('#total-transfer').textContent = '₹' + totalTransfer.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if ($('#total-count')) $('#total-count').textContent = currentExpenses.length;

    if ($('#card-income-total')) $('#card-income-total').style.display = state.hideIncome ? 'none' : '';
    if ($('#card-investment')) $('#card-investment').style.display = state.hideInvestment ? 'none' : '';
    if ($('#card-transfer')) $('#card-transfer').style.display = state.hideTransfer ? 'none' : '';

    const summaryContainer = document.querySelector('.summary-cards');
    if (summaryContainer) {
        const visibleCards = Array.from(summaryContainer.querySelectorAll('.summary-card')).filter(c => c.style.display !== 'none');
        
        // Mobile odd-cards logic
        summaryContainer.classList.remove('odd-cards');
        visibleCards.forEach(c => c.classList.remove('span-2'));
        
        if (visibleCards.length % 2 !== 0 && visibleCards.length >= 3) {
            summaryContainer.classList.add('odd-cards');
            visibleCards[visibleCards.length - 1].classList.add('span-2');
            visibleCards[visibleCards.length - 2].classList.add('span-2');
            visibleCards[visibleCards.length - 3].classList.add('span-2');
        }

        // Desktop exact count logic to prevent orphans
        summaryContainer.className = summaryContainer.className.replace(/\bgrid-count-\d+\b/g, '');
        summaryContainer.classList.add(`grid-count-${visibleCards.length}`);
    }

    let days = 1;
    if (state.timeMode === 'day') {
        days = 1;
    } else if (state.timeMode === 'week') {
        const y = state.timeDate.getFullYear();
        const m = state.timeDate.getMonth();
        const d = state.timeDate.getDate();
        const startOfWeek = new Date(y, m, d - state.timeDate.getDay());
        const endOfWeek = new Date(y, m, d - state.timeDate.getDay() + 6);
        endOfWeek.setHours(23, 59, 59, 999);
        const now = new Date();
        if (now >= startOfWeek && now <= endOfWeek) {
            days = Math.max(1, now.getDay() + 1);
        } else {
            days = 7;
        }
    } else if (state.timeMode === 'month') {
        const y = state.timeDate.getFullYear();
        const m = state.timeDate.getMonth();
        const now = new Date();
        if (y === now.getFullYear() && m === now.getMonth()) {
            days = Math.max(1, now.getDate());
        } else {
            days = new Date(y, m + 1, 0).getDate();
        }
    } else if (state.timeMode === 'year') {
        const y = state.timeDate.getFullYear();
        const now = new Date();
        if (y === now.getFullYear()) {
            const start = new Date(y, 0, 1);
            days = Math.max(1, Math.ceil((now - start) / (1000 * 60 * 60 * 24)));
        } else {
            days = ((y % 4 === 0 && y % 100 > 0) || y % 400 === 0) ? 366 : 365;
        }
    } else if (state.timeMode === 'custom') {
        if (state.customDateStart && state.customDateEnd) {
            const d1 = new Date(state.customDateStart + 'T00:00:00');
            const d2 = new Date(state.customDateEnd + 'T00:00:00');
            days = Math.max(1, Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
        }
    } else if (state.timeMode === 'all') {
        if (baseExpenses.length > 0) {
            let minDate = baseExpenses[0].date;
            let maxDate = baseExpenses[0].date;
            for (let e of baseExpenses) {
                if (e.date < minDate) minDate = e.date;
                if (e.date > maxDate) maxDate = e.date;
            }
            const d1 = new Date(minDate + 'T00:00:00');
            const d2 = new Date(maxDate + 'T00:00:00');
            days = Math.max(1, Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
        }
    }
    const dailyAvg = net / days;
    if ($('#daily-avg-spend')) $('#daily-avg-spend').textContent = (dailyAvg >= 0 ? '₹' : '-₹') + Math.abs(dailyAvg).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const prevExpenses = getPrevGlobalFilteredExpenses();
    const prevBase = prevExpenses.filter(e => !e.txnType || e.txnType === 'Expense' || e.txnType === 'Refund');
    const prevRefunds = prevBase.filter(e => e.txnType === 'Refund' || (!e.txnType && e.amount < 0)).reduce((s, e) => s + Math.abs(e.amount), 0);
    const prevExpenseTotal = prevBase.filter(e => e.txnType === 'Expense' || (!e.txnType && e.amount > 0)).reduce((s, e) => s + Math.abs(e.amount), 0);
    const prevNet = prevExpenseTotal - prevRefunds;

    let prevDays = 1;
    if (state.timeMode === 'day') {
        prevDays = 1;
    } else if (state.timeMode === 'week') {
        prevDays = 7;
    } else if (state.timeMode === 'month') {
        let py = state.timeDate.getFullYear();
        let pm = state.timeDate.getMonth() - 1;
        if (pm < 0) { pm = 11; py -= 1; }
        prevDays = new Date(py, pm + 1, 0).getDate();
    } else if (state.timeMode === 'year') {
        let py = state.timeDate.getFullYear() - 1;
        prevDays = ((py % 4 === 0 && py % 100 > 0) || py % 400 === 0) ? 366 : 365;
    } else if (state.timeMode === 'custom') {
        if (state.customDateStart && state.customDateEnd) {
            const d1 = new Date(state.customDateStart + 'T00:00:00');
            const d2 = new Date(state.customDateEnd + 'T00:00:00');
            prevDays = Math.max(1, Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
        }
    }

    const prevDailyAvg = prevNet / prevDays;
    const diff = dailyAvg - prevDailyAvg;

    const prev5Data = getPrev5GlobalFilteredExpenses();
    const prev5Base = prev5Data.expenses.filter(e => !e.txnType || e.txnType === 'Expense' || e.txnType === 'Refund');
    const prev5Refunds = prev5Base.filter(e => e.txnType === 'Refund' || (!e.txnType && e.amount < 0)).reduce((s, e) => s + Math.abs(e.amount), 0);
    const prev5ExpenseTotal = prev5Base.filter(e => e.txnType === 'Expense' || (!e.txnType && e.amount > 0)).reduce((s, e) => s + Math.abs(e.amount), 0);
    const prev5Net = prev5ExpenseTotal - prev5Refunds;
    const prev5DailyAvg = prev5Data.days > 0 ? (prev5Net / prev5Data.days) : 0;
    const diff5 = dailyAvg - prev5DailyAvg;

    if ($('#daily-avg-trend')) {
        if (state.timeMode === 'all') {
            $('#daily-avg-trend').textContent = '';
        } else {
            let prevYear = state.timeDate.getFullYear();
            if (state.timeMode === 'year') {
                prevYear -= 1;
            } else if (state.timeMode === 'month' && state.timeDate.getMonth() === 0) {
                prevYear -= 1;
            } else if (state.timeMode === 'week') {
                const d = new Date(state.timeDate);
                d.setDate(d.getDate() - 7);
                prevYear = d.getFullYear();
            } else if (state.timeMode === 'day') {
                const d = new Date(state.timeDate);
                d.setDate(d.getDate() - 1);
                prevYear = d.getFullYear();
            } else if (state.timeMode === 'custom') {
                if (state.customDateStart && state.customDateEnd) {
                    const d1 = new Date(state.customDateStart + 'T00:00:00');
                    const d2 = new Date(state.customDateEnd + 'T00:00:00');
                    const cDays = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
                    const pD2 = new Date(d1);
                    pD2.setDate(pD2.getDate() - 1);
                    prevYear = pD2.getFullYear();
                }
            }

            if ((state.timeMode !== 'custom' && !state.loadedYears.has(prevYear)) || prevExpenses.length === 0) {
                $('#daily-avg-trend').textContent = '';
            } else {
                let htmlStr = '';

                // Only line: vs avg of last 5 periods (or available periods up to 5)
                if (prev5Data.days > 0 && (prev5DailyAvg > 0 || diff5 !== 0)) {
                    const diffClass5 = diff5 > 0 ? 'amount-positive' : (diff5 < 0 ? 'amount-negative' : '');
                    const sign5 = diff5 > 0 ? '+' : '';
                    const periodStr5 = state.timeMode === 'day' ? '5d avg' : (state.timeMode === 'week' ? '5w avg' : (state.timeMode === 'month' ? '5m avg' : (state.timeMode === 'year' ? '5y avg' : '5p avg')));
                    
                    let percentStr5 = '';
                    if (prev5DailyAvg > 0) {
                        const percent5 = Math.round((diff5 / prev5DailyAvg) * 100);
                        const pSign5 = percent5 > 0 ? '+' : '';
                        percentStr5 = ` (${pSign5}${percent5}%)`;
                    }
                    htmlStr = `<div style="display: flex; gap: 4px; align-items: baseline;"><span class="${diffClass5}" style="white-space: nowrap;">${sign5}₹${Math.round(diff5).toLocaleString('en-IN')}${percentStr5}</span> <span style="color: var(--text-muted); font-weight: normal; font-size: 0.75rem; white-space: normal;">vs ${periodStr5}</span></div>`;
                }

                $('#daily-avg-trend').innerHTML = htmlStr;
            }
        }
    }

    const trendCard = $('#dash-trend-card');
    const trendTitle = $('#dash-trend-title');
    const controls = trendCard ? trendCard.querySelector('.trend-controls') : null;
    const typeBtn = trendCard ? trendCard.querySelector('.btn-trend-type') : null;

    if (state.timeMode === 'day') {
        if (trendCard) trendCard.style.display = 'none';
    } else {
        if (trendCard) trendCard.style.display = '';
        if (controls) controls.style.display = 'flex';

        if (state.timeMode === 'week' || state.timeMode === 'month') {
            if (trendTitle) trendTitle.textContent = 'Daily Expense Trend';
            if (typeBtn) typeBtn.style.display = 'none';
            renderChart('dash-monthly-chart', buildDailyTrendChart);
        } else {
            if (trendTitle) trendTitle.textContent = 'Monthly Expense Trend';
            if (typeBtn) typeBtn.style.display = '';
            renderChart('dash-monthly-chart', buildMonthlyExpenseChart);
        }
    }

    renderChart('dash-category-chart', buildCategoryDonut);
    renderChart('dash-top-expenses', buildTopExpensesChart);

    renderQuickAdd();

    renderRecentTransactions();
}
// Old listeners removed

export function renderRecentTransactions() {
    // Recent Transactions: should show at least 1 month data.
    // If the active filter mode (state.timeMode) is month, week, or day, we show all transactions for the calendar month containing state.timeDate.
    // If state.timeMode is year, we show all transactions for that year.
    // If state.timeMode is all, we show all transactions for the latest calendar month with transactions in the database.
    let recentExpenses = [];
    let contextExpenses = getGlobalFilteredExpenses();

    if (contextExpenses.length > 0) {
        const latestDateStr = contextExpenses[0].date;
        const latestDate = new Date(latestDateStr + 'T00:00:00');
        const sevenDaysAgo = new Date(latestDate);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

        const y = sevenDaysAgo.getFullYear();
        const m = String(sevenDaysAgo.getMonth() + 1).padStart(2, '0');
        const d = String(sevenDaysAgo.getDate()).padStart(2, '0');
        const sevenDaysAgoStr = `${y}-${m}-${d}`;

        let minCountDateStr = latestDateStr;
        if (contextExpenses.length >= 10) {
            minCountDateStr = contextExpenses[9].date;
        } else if (contextExpenses.length > 0) {
            minCountDateStr = contextExpenses[contextExpenses.length - 1].date;
        }

        const cutoffDateStr = minCountDateStr < sevenDaysAgoStr ? minCountDateStr : sevenDaysAgoStr;

        recentExpenses = contextExpenses.filter(e => e.date && e.date >= cutoffDateStr && e.date <= latestDateStr);
    }

    // Group matching refunds using merge refund settings
    const grouped = mergeRefundTransactions(recentExpenses, state.expenses);

    grouped.sort((a, b) => (b.main.date || '').localeCompare(a.main.date || ''));

    const isTruncated = grouped.length > state.limitDashboard;
    const itemsToRender = grouped.slice(0, state.limitDashboard);

    const tbody = $('#recent-tbody');
    if (!tbody) return;
    let lastDateRecent = null;
    let htmlContent = itemsToRender.map(g => {
        const e = g.main;
        const realIdx = state.expenses.indexOf(e);
        const refundRealIdx = g.merged ? state.expenses.indexOf(g.merged) : -1;

        let sepHTML = '';
        if (!lastDateRecent || lastDateRecent.slice(0, 7) !== e.date.slice(0, 7)) {
            const currentMonthStr = e.date.slice(0, 7);
            const mName = new Date(e.date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
            
            // Monthly totals — only Expense & Refund (calculated across all loaded expenses for this month)
            const monthItems = state.expenses.filter(item => item.date && item.date.slice(0, 7) === currentMonthStr);
            const monthBase = monthItems.filter(item => !item.txnType || item.txnType === 'Expense' || item.txnType === 'Refund');
            const mExpense = monthBase.filter(item => item.txnType === 'Expense' || (!item.txnType && item.amount > 0)).reduce((s, item) => s + Math.abs(item.amount), 0);
            const mRefund = monthBase.filter(item => item.txnType === 'Refund' || (!item.txnType && item.amount < 0)).reduce((s, item) => s + Math.abs(item.amount), 0);
            const mNet = mExpense - mRefund;
            const mNetClass = mNet >= 0 ? 'amount-positive' : 'amount-negative';
            const sign = mNet >= 0 ? '' : '+';
            const mNetText = `<span class="${mNetClass}"><span class="amount-main"><span class="amount-sign">${sign ? sign : '&nbsp;'}</span><span class="amount-symbol">₹</span><span class="amount-val">${Math.abs(mNet).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span></span>`;

            if (lastDateRecent) {
                sepHTML += `<tr class="month-separator"><td colspan="6"></td></tr>`;
            }
            sepHTML += `<tr class="month-header"><td colspan="2">${mName}</td><td class="month-header-total">${mNetText}</td><td class="month-header-empty" colspan="3"></td></tr>`;
            sepHTML += getDaySeparatorHTML(e.date, state.expenses, 6);
        } else if (lastDateRecent && lastDateRecent !== e.date) {
            sepHTML = getDaySeparatorHTML(e.date, state.expenses, 6);
        }
        lastDateRecent = e.date;
        
        const displaySources = getDisplaySourceList(e.source);
        let sourceBadge = displaySources.map(s => `<span class="badge-source" title="${escHtml(e.source)}">${escHtml(s)}</span>`).join('');
        const displayTxnIds = getDisplayTxnIdList(e);
        let txnBadge = displayTxnIds.map(id => `<span class="badge-txn hide-on-mobile">#${escHtml(id)}</span>`).join('');
        let typeBadge = txnTypeBadgeHTML(e.txnType);
        let modeBadge = txnModeBadgeHTML(e.txnMode, state.hideSourceTxnId);
        let tagBadge = e.tag ? `<span class="badge-tag" title="Tag: ${escHtml(e.tag)}">🏷️ ${escHtml(e.tag)}</span>` : '';
        let badges = modeBadge + typeBadge + tagBadge + sourceBadge + txnBadge;

        const refunds = g.refunds || (g.merged ? [g.merged] : []);
        const linkedExpenses = g.linkedExpenses || [];
        const hasRefunds = refunds.length > 0;
        const hasLinkedExpenses = linkedExpenses.length > 0;
        const totalRefunded = g.totalRefunded !== undefined ? g.totalRefunded : (g.merged ? Math.abs(g.merged.amount) : 0);
        const netAmt = g.netAmount !== undefined ? g.netAmount : (hasRefunds ? Math.max(0, Math.abs(e.amount) - totalRefunded) : Math.abs(e.amount));

        const isSameDaySingleRef = hasRefunds && isSameDaySameAmountSingleRefund(e, refunds);
        const isSameDaySingleExp = hasLinkedExpenses && isSameDaySameAmountSingleRefund(e, linkedExpenses);
        const isCollapsedByDefault = isSameDaySingleRef || isSameDaySingleExp;

        if (hasRefunds) {
            const arrowRotate = isCollapsedByDefault ? '0deg' : '180deg';
            badges += `
            <span class="badge-txn type-investment hide-on-mobile badge-refund-toggle" onclick="toggleRefundCollapsible('dash-row-${realIdx}', event)" title="Click to toggle linked refund details" style="cursor: pointer; user-select: none;">
                Refunded (${refunds.length}) <span class="toggle-arrow" style="display: inline-block; transition: transform 0.2s ease; font-size: 0.7rem; margin-left: 2px; transform: rotate(${arrowRotate});">▼</span>
            </span>
            <span class="badge-txn type-investment hide-on-desktop" title="${refunds.length} linked refund(s): ₹${totalRefunded}">
                Refunded (${refunds.length})
            </span>`;
        } else if (hasLinkedExpenses) {
            const arrowRotate = isCollapsedByDefault ? '0deg' : '180deg';
            badges += `
            <span class="badge-txn type-income hide-on-mobile badge-refund-toggle" onclick="toggleRefundCollapsible('dash-row-${realIdx}', event)" title="Click to toggle linked original expense details" style="cursor: pointer; user-select: none;">
                Original Expense <span class="toggle-arrow" style="display: inline-block; transition: transform 0.2s ease; font-size: 0.7rem; margin-left: 2px; transform: rotate(${arrowRotate});">▼</span>
            </span>`;
        }

        let amountHtml = `
            <td data-label="Amount" class="${amountClass(e)}">
                ${renderAmountHTML(e)}
            </td>
        `;

        if (hasRefunds) {
            amountHtml = `
            <td data-label="Amount" class="${amountClass(e)}">
                <div class="amount-cell-wrap" style="flex-direction: column; align-items: flex-end; text-align: right;">
                    <div style="text-decoration: line-through; opacity: 0.6; color: var(--amount-positive);">₹${Math.abs(e.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div class="${netAmt === 0 ? 'amount-negative net-zero' : 'amount-positive'}"> (Net: ₹${netAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</div>
                </div>
            </td>`;
        }

        const isExpense = !isRefundTxn(e);
        let actionsHtml = `
            <td data-label="Actions">
                <div class="row-actions action-dropdown-wrap">
                    <button class="row-btn action-dropdown-btn hide-on-mobile" onclick="toggleActionDropdown(event, 'dash-${realIdx}')" title="Actions">⋮</button>
                    <div class="action-dropdown-menu hide-on-mobile" id="action-dropdown-dash-${realIdx}">
                        <button class="action-dropdown-item" onclick="openRefundLinkingModal(${realIdx}); closeAllActionDropdowns();">
                            <span class="action-icon">🔗</span> ${isExpense ? 'Link Refunds' : 'Link Original Expense'}
                        </button>
                        ${isExpense && !hasRefunds ? `
                        <button class="action-dropdown-item" onclick="generateRefund(${realIdx}); closeAllActionDropdowns();">
                            <span class="action-icon">↩️</span> Create Refund
                        </button>` : ''}
                        <button class="action-dropdown-item" onclick="editEntry(${realIdx}); closeAllActionDropdowns();">
                            <span class="action-icon">✏️</span> Edit
                        </button>
                        <button class="action-dropdown-item delete" onclick="openDeleteModal(${realIdx}); closeAllActionDropdowns();">
                            <span class="action-icon">🗑️</span> Delete
                        </button>
                    </div>
                    <button class="row-btn hide-on-desktop mobile-menu-btn" onclick="openMobileTxnMenu(${realIdx}, 'dash-row')" title="Options">⋮</button>
                </div>
            </td>`;

        const hasSubrow = hasRefunds || hasLinkedExpenses;
        const isExpandedClass = hasSubrow && !isCollapsedByDefault ? 'refund-expanded' : '';
        const mainRowHtml = `
        <tr id="dash-row-${realIdx}" class="${g.merged ? 'merged-row' : ''} ${isExpandedClass} touchable-row" data-real-idx="${realIdx}" data-refund-idx="${refundRealIdx || -1}" data-merged="${g.merged ? 'true' : 'false'}" data-row-prefix="dash-row">
            <td data-label="Date"><span class="txn-date-text hide-on-mobile">${formatDate(e.date)}</span></td>
            <td data-label="Category" title="${escHtml(e.category)}">${escHtml(e.category)}</td>
            <td data-label="Note" class="${!e.note && !badges ? 'empty-note' : ''}">
                <div class="note-content">
                    <span class="${!e.note ? 'empty-dash' : ''}">${e.note ? escHtml(e.note) : ''}</span>
                    ${badges ? `<div class="badges-wrapper">${badges}</div>` : ''}
                </div>
            </td>
            ${amountHtml}
            <td data-label="Mode" title="${escHtml(e.txnMode)}"><span class="mode-cell">${escHtml(e.txnMode)}</span></td>
            ${actionsHtml}
        </tr>`;

        const subrowHtml = renderRefundCollapsibleSubrow('dash-row', realIdx, refunds, totalRefunded, netAmt, 6, linkedExpenses);

        return sepHTML + mainRowHtml + subrowHtml;
    }).join('');

    if (isTruncated) {
        htmlContent += `<tr id="infinite-scroll-dash"><td colspan="6" style="text-align: center; padding: 16px; color: var(--text-muted); font-size: 0.85rem;">Loading more...</td></tr>`;
    } else if (contextExpenses.length > recentExpenses.length) {
        const hiddenCount = contextExpenses.length - recentExpenses.length;
        htmlContent += `<tr><td colspan="6" style="text-align: center; padding: 16px; color: var(--text-muted); font-size: 0.85rem;">+ ${hiddenCount} older transaction${hiddenCount > 1 ? 's' : ''} not shown. View all in Transactions tab.</td></tr>`;
    }

    tbody.innerHTML = htmlContent;

    if (isTruncated) {
        setupInfiniteScroll('infinite-scroll-dash', 'dashboard', renderRecentTransactions);
    }
}

export function renderSelectedDayTransactions() {
    const tbody = $('#selected-day-tbody');
    if (!tbody) return;

    const inputDateEl = $('#input-date') || (typeof document !== 'undefined' ? document.getElementById('input-date') : null);
    const selectedDate = inputDateEl ? inputDateEl.value : '';
    let dayTxns = state.expenses.filter(e => e.date === selectedDate);
    if (state.hideIncome) dayTxns = dayTxns.filter(e => e.txnType !== 'Income');
    if (state.hideInvestment) dayTxns = dayTxns.filter(e => e.txnType !== 'Investment');
    if (state.hideTransfer) dayTxns = dayTxns.filter(e => e.txnType !== 'Transfer');

    const futureScheduledTxns = [];
    if (selectedDate > getLocalDateString()) {
        state.scheduledTransactions.forEach(st => {
            if (state.hideIncome && st.txnType === 'Income') return;
            if (state.hideInvestment && st.txnType === 'Investment') return;
            if (state.hideTransfer && st.txnType === 'Transfer') return;
            if (st.frequency === 'one-off') {
                if (st.next_run_date === selectedDate) {
                    futureScheduledTxns.push({
                        isScheduledPreview: true,
                        date: selectedDate,
                        category: st.category,
                        note: st.note,
                        source: 'Schedule',
                        amount: st.amount,
                        currency: st.currency,
                        txnMode: st.txnMode,
                        tag: st.tag,
                    });
                }
                return;
            }
            let d = st.next_run_date;
            if (!d) return;
            let safety = 0;
            while (d < selectedDate && safety < 1000) {
                let nextD = calculateNextRunDate(st.frequency, st, d, false);
                if (nextD === d || !nextD) break;
                d = nextD;
                safety++;
            }
            if (d === selectedDate) {
                futureScheduledTxns.push({
                    isScheduledPreview: true,
                    date: selectedDate,
                    category: st.category,
                    note: st.note,
                    source: 'Schedule',
                    amount: st.amount,
                    currency: st.currency,
                    txnMode: st.txnMode,
                    tag: st.tag,
                });
            }
        });
    }

    const combinedTxns = [...dayTxns, ...futureScheduledTxns];

    if (combinedTxns.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">No transactions recorded on this date.</td></tr>`;
        return;
    }

    let lastDate = null;
    let htmlContent = combinedTxns.map(e => {
        const realIdx = state.expenses.indexOf(e);
        let sepHTML = '';
        if (!lastDate || lastDate.slice(0, 7) !== e.date.slice(0, 7)) {
            const mName = new Date(e.date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
            if (lastDate) {
                sepHTML += `<tr class="month-separator"><td colspan="6"></td></tr>`;
            }
            sepHTML += `<tr class="month-header"><td colspan="6">${mName}</td></tr>`;
        }
        lastDate = e.date;

        const displaySources = getDisplaySourceList(e.source);
        let sourceBadge = displaySources.map(s => `<span class="badge-source" title="${escHtml(e.source)}">${escHtml(s)}</span>`).join('');
        const displayTxnIds = getDisplayTxnIdList(e);
        let txnBadge = displayTxnIds.map(id => `<span class="badge-txn hide-on-mobile">#${escHtml(id)}</span>`).join('');
        let typeBadge = txnTypeBadgeHTML(e.txnType);
        let modeBadge = txnModeBadgeHTML(e.txnMode, state.hideSourceTxnId);
        let tagBadge = e.tag ? `<span class="badge-tag" title="Tag: ${escHtml(e.tag)}">🏷️ ${escHtml(e.tag)}</span>` : '';
        let badges = modeBadge + typeBadge + tagBadge + sourceBadge + txnBadge;

        let actionHTML = '';
        if (e.isScheduledPreview) {
            actionHTML = `<span style="color: var(--text-muted); font-size: 0.8rem;">Scheduled</span>`;
        } else {
            actionHTML = `
                <div class="row-actions action-dropdown-wrap">
                    <button class="row-btn action-dropdown-btn hide-on-mobile" onclick="toggleActionDropdown(event, 'sd-${realIdx}')" title="Actions">⋮</button>
                    <div class="action-dropdown-menu hide-on-mobile" id="action-dropdown-sd-${realIdx}">
                        <button class="action-dropdown-item" onclick="editEntry(${realIdx}); closeAllActionDropdowns();">
                            <span class="action-icon">✏️</span> Edit
                        </button>
                        <button class="action-dropdown-item delete" onclick="openDeleteModal(${realIdx}); closeAllActionDropdowns();">
                            <span class="action-icon">🗑️</span> Delete
                        </button>
                    </div>
                    <button class="row-btn hide-on-desktop mobile-menu-btn" onclick="openMobileTxnMenu(${realIdx})" title="Options">⋮</button>
                </div>`;
        }

        return sepHTML + `
        <tr id="txn-row-${realIdx !== -1 ? realIdx : 'sched-' + Math.random().toString(36).substr(2, 5)}" class="touchable-row" data-real-idx="${realIdx !== -1 ? realIdx : ''}" data-row-prefix="txn-row">
            <td data-label="Date">${formatDate(e.date)}</td>
            <td data-label="Category" title="${escHtml(e.category)}">${escHtml(e.category)}</td>
            <td data-label="Note" class="${!e.note && !badges ? 'empty-note' : ''}">
                <div class="note-content">
                    <span class="${!e.note ? 'empty-dash' : ''}">${e.note ? escHtml(e.note) : ''}</span>
                    ${badges ? `<div class="badges-wrapper">${badges}</div>` : ''}
                </div>
            </td>
            <td data-label="Amount" class="${amountClass(e)}">
                ${renderAmountHTML(e)}
            </td>
            <td data-label="Mode" title="${escHtml(e.txnMode)}"><span class="mode-cell">${escHtml(e.txnMode)}</span></td>
            <td data-label="Actions" class="hide-on-mobile">
                ${actionHTML}
            </td>
        </tr>`;
    }).join('');
    tbody.innerHTML = htmlContent;
}

export function renderQuickAdd() {
    const container = $('#dashboard-quick-add');
    if (!container) return;

    const quickAddTemplates = state.scheduledTransactions.filter(st => st.frequency === 'instant' && !st.disabled);
    const pendingSms = state.pendingSmsTransactions || [];
    const pendingScheduled = state.pendingScheduledTransactions || [];
    const todayStr = getLocalDateString();
    const todayPendingSms = pendingSms.filter(txn => txn.date === todayStr);
    const olderPendingSms = pendingSms.filter(txn => txn.date !== todayStr);

    if (quickAddTemplates.length === 0 && todayPendingSms.length === 0 && olderPendingSms.length === 0 && pendingScheduled.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    let html = '';

    if (pendingScheduled.length > 0) {
        html += `
        <button class="btn-quick-add scheduled-review-all" title="Review pending scheduled transactions" style="background: rgba(30, 41, 59, 0.6); border: 1px solid var(--accent); color: var(--text-primary);">
            <span class="qa-note">⚡ Scheduled Txns (${pendingScheduled.length})</span>
            <span class="qa-amount" style="font-size: 0.8rem; opacity: 0.9; color: var(--accent); font-weight: 700;">Action Needed</span>
        </button>
        `;
    }

    quickAddTemplates.forEach(st => {
        const amtColor = st.amount < 0 ? 'var(--green)' : 'var(--amount-negative)';
        const displayType = st.amount < 0 ? '+' : '';
        html += `
        <button class="btn-quick-add" data-id="${st.id}" title="Click to instantly log ${escHtml(st.note || st.category)}">
            <span class="qa-note">⚡ ${escHtml(st.note || st.category)}</span>
            <span class="qa-amount" style="color: ${amtColor}">${displayType}₹${Math.abs(st.amount).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
        </button>
        `;
    });

    if (olderPendingSms.length > 0) {
        html += `
        <button class="btn-quick-add sms-review-all" title="Review all pending SMS & Email transactions" style="background: rgba(30, 41, 59, 0.6); border: 1px solid var(--accent); color: var(--text-primary);">
            <span class="qa-note">📋 SMS/Email Txns (${pendingSms.length})</span>
            <span class="qa-amount" style="font-size: 0.8rem; opacity: 0.9; color: var(--accent); font-weight: 700;">Action Needed</span>
        </button>
        `;
    }

    pendingSms.forEach((txn, i) => {
        if (txn.date !== todayStr) return;
        const title = txn.merchant || txn.source || 'SMS';
        const customRule = findMatchingKeywordRule(txn.merchant) || (txn.source ? findMatchingKeywordRule(txn.source) : null);
        const ruleTxnType = (customRule && customRule.txnType) ? normalizeTxnType(customRule.txnType) : null;
        const isRefund = ruleTxnType ? (ruleTxnType === 'Refund') : isRefundTxn(txn);
        const isIncome = ruleTxnType ? (ruleTxnType === 'Income') : (normalizeTxnType(txn.txnType) === 'Income');
        const isCredit = ruleTxnType ? (ruleTxnType === 'Refund' || ruleTxnType === 'Income') : (isRefund || isIncome || txn.amount < 0);
        const displayType = isCredit ? '+' : '';
        const amtColor = isCredit ? 'var(--green)' : 'var(--amount-negative)';
        const emoji = (txn.source || '').toLowerCase().includes('email') ? '📧' : '💬';
        html += `
        <button class="btn-quick-add sms-quick-add" data-index="${i}" title="Approve: ${escHtml(title)}" style="border: 1px solid var(--accent);">
            <span class="qa-note">${emoji} ${escHtml(title)}</span>
            <span class="qa-amount" style="color: ${amtColor}">${displayType}₹${Math.abs(txn.amount).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
        </button>
        `;
    });

    container.innerHTML = html;

    const schedReviewBtn = $('.scheduled-review-all');
    if (schedReviewBtn) {
        schedReviewBtn.addEventListener('click', () => {
            showScheduledApprovalModal(state.pendingScheduledTransactions || []);
        });
    }

    const reviewBtn = $('.sms-review-all');
    if (reviewBtn) {
        reviewBtn.addEventListener('click', () => {
            showSmsApprovalModal(state.pendingSmsTransactions || []);
        });
    }

    $$('.btn-quick-add:not(.sms-quick-add):not(.sms-review-all):not(.scheduled-review-all)').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = btn.dataset.id;
            const template = quickAddTemplates.find(st => st.id === id);
            if (!template) return;

            const today = getLocalDateString();
            const entry = {
                date: today,
                amount: template.amount,
                currency: template.currency,
                category: template.category,
                txnType: template.txnType || (template.amount < 0 ? 'Refund' : 'Expense'),
                txnMode: template.txnMode,
                note: template.note,
                source: 'Quick Add',
                txnId: '',
                location: template.location || await getCurrentLocationTag()
            };

            if (entry.location) {
                localStorage.setItem('expman_last_location', entry.location);
            }

            state.expenses.unshift(entry);
            state.expenses.sort((a, b) => b.date.localeCompare(a.date));
            const newYear = today.slice(0, 4);

            toast('Quick Add saving...', 'info');
            try {
                await saveYearCSV(newYear);
                toast(`Quick Add: ₹${Math.abs(entry.amount)} logged!`, 'success');
            } catch (err) {
                toast('Error saving to cloud', 'error');
            }
            renderAll();
        });
    });

    $$('.sms-quick-add').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const idx = parseInt(btn.dataset.index);
            const txn = state.pendingSmsTransactions[idx];
            if (!txn) return;

            const customRule = findMatchingKeywordRule(txn.merchant) || (txn.source ? findMatchingKeywordRule(txn.source) : null);
            const ruleTxnType = (customRule && customRule.txnType) ? normalizeTxnType(customRule.txnType) : null;
            let computedType = null;
            if (ruleTxnType) {
                computedType = ruleTxnType;
            } else {
                const isRefund = isRefundTxn(txn);
                const isIncome = normalizeTxnType(txn.txnType) === 'Income';
                computedType = isRefund ? 'Refund' : (isIncome ? 'Income' : (txn.txnType ? normalizeTxnType(txn.txnType) : null));
                if (!computedType) {
                    const expectedType = (txn.amount < 0 || isRefund) ? 'Refund' : 'Expense';
                    computedType = getTxnTypeForMerchant(txn.merchant, expectedType, txn.source);
                }
                if (isRefund) {
                    computedType = 'Refund';
                }
            }
            const finalAmount = (computedType === 'Income' || computedType === 'Refund') ? -Math.abs(txn.amount) : Math.abs(txn.amount);
            let bestMatch = getCategoryForMerchant(txn.merchant, txn.masterCategory, txn.source);

            const today = getLocalDateString();

            const entry = {
                date: txn.date || today,
                amount: finalAmount,
                currency: txn.currency || 'INR',
                category: bestMatch,
                txnType: computedType,
                txnMode: getTxnModeForMerchant(txn.merchant, txn.transactionMode, state.txnModes, txn.source),
                note: txn.merchant || '',
                source: txn.source || 'SMS',
                txnId: txn.transactionId || '',
                location: await getCurrentLocationTag()
            };

            if (entry.location) {
                localStorage.setItem('expman_last_location', entry.location);
            }

            state.expenses.unshift(entry);
            state.expenses.sort((a, b) => b.date.localeCompare(a.date));
            const newYear = entry.date.slice(0, 4);

            const displaySource = (entry.source || '').toLowerCase().includes('email') ? 'Email' : 'SMS';
            toast(`Approving ${displaySource}...`, 'info');

            btn.disabled = true;
            btn.style.opacity = '0.5';

            try {
                await saveYearCSV(newYear);

                consumeRawSmsTransaction(txn);

                if (txn.timestamp) {
                    let maxTs = parseInt(localStorage.getItem('expman_last_sms_date')) || 0;
                    if (txn.timestamp > maxTs) {
                        localStorage.setItem('expman_last_sms_date', txn.timestamp.toString());
                        if (window.Android && typeof window.Android.setLastSmsDate === 'function') {
                            window.Android.setLastSmsDate(txn.timestamp);
                        }
                    }
                }

                toast(`${displaySource}: ₹${Math.abs(entry.amount)} logged!`, 'success');
            } catch (err) {
                const addedIdx = state.expenses.indexOf(entry);
                if (addedIdx > -1) state.expenses.splice(addedIdx, 1);
                btn.disabled = false;
                btn.style.opacity = '1';
                if (err.message === "CONFLICT_DETECTED") {
                    toast('Conflict! Data modified on another device. Please refresh.', 'error');
                } else {
                    toast('Error saving to cloud', 'error');
                }
            }
            renderAll();
        });
    });
}
