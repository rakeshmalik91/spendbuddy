import { state } from "../core/state.js";
import { escHtml, formatDate } from "./date_helpers.js";
import { getDisplayTxnId, getDisplayTxnIdList, getRawSourceList, getDisplaySource, getDisplaySourceList, hasMatchingTxnId, isRefundTxn, txnTypeBadgeHTML } from "./txn_id_helpers.js";
import { txnModeBadgeHTML } from "./category_helpers.js";

/* ══════════════ REFUND LINKING & RENDERING ══════════════ */

/**
 * Groups expense and refund transactions based on shared Txn IDs
 * or exact opposite amounts and matching dates as fallback.
 * Returns array of: { main, refunds: [], totalRefunded, netAmount, merged }
 */
export function mergeRefundTransactions(transactions, allTransactions = null) {
    if (!Array.isArray(transactions)) return [];
    
    // If refund merging is disabled in settings, treat every transaction as an independent standalone entry
    if (state.mergeRefunds === false) {
        return transactions.filter(Boolean).map(t => ({
            main: t,
            refunds: [],
            linkedExpenses: [],
            totalRefunded: 0,
            netAmount: Math.abs(t.amount),
            merged: null
        }));
    }
    
    const pool = Array.isArray(allTransactions) ? allTransactions : transactions;
    const grouped = [];
    const usedFilteredIndices = new Set();

    // Step 1: Create main groups for non-refund transactions in transactions
    for (let i = 0; i < transactions.length; i++) {
        const t = transactions[i];
        if (!t) continue;
        
        if (!isRefundTxn(t)) {
            grouped.push({
                main: t,
                refunds: [],
                linkedExpenses: [],
                totalRefunded: 0,
                netAmount: Math.abs(t.amount),
                merged: null
            });
            usedFilteredIndices.add(i);
        }
    }

    // Step 2: Match refunds to expense groups by shared Txn ID from pool (all loaded transactions)
    const poolRefunds = pool.filter(t => t && isRefundTxn(t));
    
    for (const group of grouped) {
        for (const r of poolRefunds) {
            if (hasMatchingTxnId(group.main, r)) {
                if (!group.refunds.includes(r)) {
                    group.refunds.push(r);
                    group.totalRefunded = Math.round((group.totalRefunded + Math.abs(r.amount)) * 100) / 100;
                    group.netAmount = Math.max(0, Math.round((Math.abs(group.main.amount) - group.totalRefunded) * 100) / 100);
                    if (!group.merged) group.merged = r;
                    
                    const filteredIdx = transactions.indexOf(r);
                    if (filteredIdx >= 0) {
                        usedFilteredIndices.add(filteredIdx);
                    }
                }
            }
        }
    }

    // Step 3: Fallback auto-matching for unlinked refunds within transactions
    for (let i = 0; i < transactions.length; i++) {
        if (usedFilteredIndices.has(i)) continue;
        const t = transactions[i];
        if (!t) continue;

        if (isRefundTxn(t)) {
            let matchedGroup = null;
            let minDiff = 8;
            const d1 = new Date(t.date + 'T00:00:00').getTime();

            for (const group of grouped) {
                if (group.refunds.length > 0) continue;
                if (isRefundTxn(group.main)) continue;
                if (Math.abs(Math.abs(group.main.amount) - Math.abs(t.amount)) < 0.01) {
                    const d2 = new Date(group.main.date + 'T00:00:00').getTime();
                    const diffDays = Math.abs(d1 - d2) / (1000 * 60 * 60 * 24);
                    if (diffDays <= 7 && diffDays < minDiff) {
                        minDiff = diffDays;
                        matchedGroup = group;
                    }
                }
            }

            if (matchedGroup) {
                let expenseRow = matchedGroup.main;
                let refundRow = t;
                if (expenseRow.amount < 0 && refundRow.amount >= 0) {
                    expenseRow = t;
                    refundRow = matchedGroup.main;
                }
                matchedGroup.main = expenseRow;
                if (!matchedGroup.refunds.includes(refundRow)) {
                    matchedGroup.refunds.push(refundRow);
                    matchedGroup.totalRefunded = Math.round((matchedGroup.totalRefunded + Math.abs(refundRow.amount)) * 100) / 100;
                    matchedGroup.netAmount = Math.max(0, Math.round((Math.abs(expenseRow.amount) - matchedGroup.totalRefunded) * 100) / 100);
                    if (!matchedGroup.merged) matchedGroup.merged = refundRow;
                }
                usedFilteredIndices.add(i);
            } else {
                // Find any linked original expenses in pool for this refund
                const poolExpenses = pool.filter(e => e && !isRefundTxn(e));
                const linkedExpenses = [];
                for (const exp of poolExpenses) {
                    if (hasMatchingTxnId(exp, t)) {
                        if (!linkedExpenses.includes(exp)) {
                            linkedExpenses.push(exp);
                        }
                    }
                }

                grouped.push({
                    main: t,
                    refunds: [],
                    linkedExpenses: linkedExpenses,
                    totalRefunded: 0,
                    netAmount: Math.abs(t.amount),
                    merged: null
                });
                usedFilteredIndices.add(i);
            }
        }
    }

    return grouped;
}

export function isSameDaySameAmountSingleRefund(mainTxn, subItems) {
    if (!mainTxn || !Array.isArray(subItems) || subItems.length !== 1) return false;
    const sub = subItems[0];
    if (!sub) return false;
    return sub.date === mainTxn.date && Math.abs(Math.abs(sub.amount) - Math.abs(mainTxn.amount)) < 0.01;
}

export function renderRefundCollapsibleSubrow(prefix, realIdx, refunds = [], totalRefunded = 0, netAmt = 0, colspan = 6, linkedExpenses = []) {
    const hasRefunds = refunds && refunds.length > 0;
    const hasLinkedExpenses = linkedExpenses && linkedExpenses.length > 0;
    if (!hasRefunds && !hasLinkedExpenses) return '';

    const mainTxn = state.expenses && realIdx >= 0 ? state.expenses[realIdx] : null;
    let isCollapsedByDefault = false;
    if (mainTxn) {
        if (hasRefunds && isSameDaySameAmountSingleRefund(mainTxn, refunds)) isCollapsedByDefault = true;
        if (hasLinkedExpenses && isSameDaySameAmountSingleRefund(mainTxn, linkedExpenses)) isCollapsedByDefault = true;
    }

    const items = hasRefunds ? refunds : linkedExpenses;
    const isExpenseTarget = hasRefunds; // true when subrow items are refunds
    const headerTitle = isExpenseTarget 
        ? `↩️ Linked Refund${items.length > 1 ? 's' : ''} (${items.length})` 
        : `🛒 Linked Original Expense`;

    const summaryNetHtml = isExpenseTarget 
        ? `Total Refunded: <span class="amount-negative">+₹${totalRefunded.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> &bull; Net Expense: <span class="${netAmt === 0 ? 'amount-negative net-zero' : 'amount-positive'}">₹${netAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`
        : `Original Amount: <span class="amount-positive">₹${items.reduce((sum, item) => sum + Math.abs(item.amount), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;

    const itemsListHtml = items.map((item, itemIdx) => {
        const itemRealIdx = state.expenses ? state.expenses.indexOf(item) : -1;
        const itemDisplayTxnIds = getDisplayTxnIdList(item);
        const itemDisplaySources = getDisplaySourceList(item.source);
        const itemRawSources = getRawSourceList(item.source);
        let typeBadge = txnTypeBadgeHTML(item.txnType) || '';
        const isCompact = prefix !== 'dash-row' ? state.hideSourceTxnId : false;
        let modeBadge = txnModeBadgeHTML(item.txnMode, isCompact);
        let sourceBadge = '';
        if (itemDisplaySources.length > 0) {
            if (prefix !== 'dash-row' && !state.hideSourceTxnId) {
                const fullBadges = itemRawSources.map(s => `<span class="badge-source hide-on-mobile" title="${escHtml(s)}">${escHtml(s)}</span>`).join('');
                const shortBadges = itemDisplaySources.map(s => `<span class="badge-source hide-on-desktop" title="${escHtml(item.source)}">${escHtml(s)}</span>`).join('');
                sourceBadge = fullBadges + shortBadges;
            } else {
                // Shortened on dashboard or in compact view
                sourceBadge = itemDisplaySources.map(s => `<span class="badge-source" title="${escHtml(item.source)}">${escHtml(s)}</span>`).join('');
            }
        }
        let txnBadge = '';
        if (itemDisplayTxnIds.length > 0) {
            if (prefix !== 'dash-row' && !state.hideSourceTxnId) {
                txnBadge = itemDisplayTxnIds.map(id => `<span class="badge-txn" title="#${escHtml(id)}">#${escHtml(id)}</span>`).join('');
            } else {
                // Shortened / hidden on mobile on dashboard or in compact view
                txnBadge = itemDisplayTxnIds.map(id => `<span class="badge-txn hide-on-mobile" title="#${escHtml(id)}">#${escHtml(id)}</span>`).join('');
            }
        }
        let tagBadge = (prefix !== 'dash-row' && item.tag) ? `<span class="badge-tag" title="Tag: ${escHtml(item.tag)}">🏷️ ${escHtml(item.tag)}</span>` : '';
        let itemBadges = typeBadge + modeBadge + tagBadge + sourceBadge + txnBadge;

        const isItemRefund = isRefundTxn(item);
        const amountClassStr = isItemRefund ? 'amount-negative' : 'amount-positive';
        const showActions = true;
        const subDropdownKey = `sub-${prefix}-${realIdx}-${itemIdx}`;

        return `
        <div class="refund-item-card">
            <div class="refund-item-left">
                <span class="refund-item-date">${formatDate(item.date)}</span>
                <span class="refund-item-category">${escHtml(item.category)}</span>
                ${item.note ? `<span class="refund-item-note">${escHtml(item.note)}</span>` : ''}
                ${itemBadges ? `<div class="badges-wrapper">${itemBadges}</div>` : ''}
            </div>
            <div class="refund-item-right">
                <span class="${amountClassStr}"><span class="amount-main"><span class="amount-sign">${isItemRefund ? '+' : '&nbsp;'}</span><span class="amount-symbol">₹</span><span class="amount-val">${Math.abs(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span></span>
                ${itemRealIdx !== -1 && showActions ? `
                <div class="row-actions action-dropdown-wrap" style="margin-left: 8px;">
                    <button class="row-btn action-dropdown-btn" onclick="toggleActionDropdown(event, '${subDropdownKey}')" title="Actions">⋮</button>
                    <div class="action-dropdown-menu" id="action-dropdown-${subDropdownKey}">
                        <button class="action-dropdown-item" onclick="openRefundLinkingModal(${itemRealIdx}); closeAllActionDropdowns();">
                            <span class="action-icon">🔗</span> ${isItemRefund ? 'Link Original Expense' : 'Link Refunds'}
                        </button>
                        <button class="action-dropdown-item" onclick="editEntry(${itemRealIdx}); closeAllActionDropdowns();">
                            <span class="action-icon">✏️</span> Edit
                        </button>
                        <button class="action-dropdown-item delete" onclick="openDeleteModal(${itemRealIdx}); closeAllActionDropdowns();">
                            <span class="action-icon">🗑️</span> Delete
                        </button>
                    </div>
                </div>` : ''}
            </div>
        </div>`;
    }).join('');

    const collapsedClass = isCollapsedByDefault ? ' hidden' : '';
    return `
    <tr id="${prefix}-${realIdx}-refunds" class="refund-collapsible-row hide-on-mobile${collapsedClass}" data-parent-id="${prefix}-${realIdx}">
        <td colspan="${colspan}">
            <div class="refund-collapsible-container">
                <div class="refund-collapsible-header">
                    <span>${headerTitle}</span>
                    <span class="refund-summary-net">${summaryNetHtml}</span>
                </div>
                <div class="refund-items-list">
                    ${itemsListHtml}
                </div>
            </div>
        </td>
    </tr>`;
}

if (typeof window !== 'undefined') {
    window.toggleRefundCollapsible = function (rowId, event) {
        if (event) event.stopPropagation();
        const subrow = document.getElementById(`${rowId}-refunds`);
        const mainRow = document.getElementById(rowId);
        if (!subrow) return;

        const isHidden = subrow.classList.contains('hidden');
        if (isHidden) {
            subrow.classList.remove('hidden');
            if (mainRow) mainRow.classList.add('refund-expanded');
            const arrow = mainRow ? mainRow.querySelector('.toggle-arrow') : null;
            if (arrow) arrow.style.transform = 'rotate(180deg)';
        } else {
            subrow.classList.add('hidden');
            if (mainRow) mainRow.classList.remove('refund-expanded');
            const arrow = mainRow ? mainRow.querySelector('.toggle-arrow') : null;
            if (arrow) arrow.style.transform = 'rotate(0deg)';
        }
    };
}
