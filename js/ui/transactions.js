import { getFilteredExpenses } from "./filters.js";
import { getDaySeparatorHTML } from "./settings.js";
import { formatDate, escHtml, amountClass, txnTypeBadgeHTML, mergeRefundTransactions, setupInfiniteScroll, buildFrequencyString, isRefundTxn, getDisplayTxnId, getDisplayTxnIdList, getRawSourceList, getDisplaySource, getDisplaySourceList, renderAmountHTML, renderRefundCollapsibleSubrow, isSameDaySameAmountSingleRefund } from "../utils/helpers.js";
import { $ } from "../core/init.js";
import { state } from "../core/state.js";
import { getSelectedTxnIndices, updateBatchActionBar } from "./batch_update.js";

/* ══════════════ TRANSACTIONS TABLE ══════════════ */

export function renderTransactions() {
    let filtered = getFilteredExpenses();

    // Group matching refunds BEFORE sorting
    const grouped = mergeRefundTransactions(filtered, state.expenses);

    grouped.sort((a, b) => {
        let cmp = 0;
        if (state.sortCol === 'date') cmp = a.main.date.localeCompare(b.main.date);
        if (state.sortCol === 'amount') cmp = a.main.amount - b.main.amount;
        return state.sortAsc ? cmp : -cmp;
    });

    // Calculate totals of all filtered entries
    const baseFiltered = filtered.filter(e => !e.txnType || e.txnType === 'Expense' || e.txnType === 'Refund');
    const totalExpense = baseFiltered.filter(e => e.txnType === 'Expense' || (!e.txnType && e.amount > 0)).reduce((s, e) => s + Math.abs(e.amount), 0);
    const totalRefunds = baseFiltered.filter(e => e.txnType === 'Refund' || (!e.txnType && e.amount < 0)).reduce((s, e) => s + Math.abs(e.amount), 0);
    const totalNet = totalExpense - totalRefunds;

    const totalIncome = filtered.filter(e => e.txnType === 'Income').reduce((s, e) => s + Math.abs(e.amount), 0);
    const totalInvestment = filtered.filter(e => e.txnType === 'Investment').reduce((s, e) => s + Math.abs(e.amount), 0);

    const footer = document.querySelector('#view-transactions .table-footer');
    if (footer) {
        const netClass = totalNet >= 0 ? 'amount-positive' : 'amount-negative';
        let extras = '';
        if (totalIncome > 0 || totalInvestment > 0) {
            const parts = [];
            if (totalIncome > 0) parts.push(`Income: <span class="amount-income">₹${totalIncome.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`);
            if (totalInvestment > 0) parts.push(`Investment: <span class="amount-investment">₹${totalInvestment.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`);
            extras = ` | ` + parts.join(', ');
        }
        footer.innerHTML = `<strong>Total Filtered:</strong> Net: <span class="${netClass}">₹${Math.abs(totalNet).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> (Expenses: ₹${totalExpense.toLocaleString('en-IN', { minimumFractionDigits: 2 })}, Refunds: ₹${totalRefunds.toLocaleString('en-IN', { minimumFractionDigits: 2 })})${extras}<div style="font-size: 0.8rem; color: var(--text-dim); margin-top: 4px; font-weight: normal;">* Net excludes Income, Investment, and Transfer transactions.</div>`;
    }

    const isTruncated = grouped.length > state.limitTransactions;
    const itemsToRender = grouped.slice(0, state.limitTransactions);
    const selectedIndices = getSelectedTxnIndices();

    const tbody = $('#all-tbody');
    if (!tbody) return;
    let lastDateAll = null;
    let htmlContent = itemsToRender.map(g => {
        const e = g.main;
        const realIdx = state.expenses.indexOf(e);
        const refundRealIdx = g.merged ? state.expenses.indexOf(g.merged) : -1;

        let sepHTML = '';
        if (state.sortCol === 'date') {
            if (!lastDateAll || lastDateAll.slice(0, 7) !== e.date.slice(0, 7)) {
                const currentMonthStr = e.date.slice(0, 7);
                const mName = new Date(e.date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

                // Monthly totals — only Expense & Refund
                const monthItems = filtered.filter(item => item.date.slice(0, 7) === currentMonthStr);
                const monthBase = monthItems.filter(item => !item.txnType || item.txnType === 'Expense' || item.txnType === 'Refund');
                const mExpense = monthBase.filter(item => item.txnType === 'Expense' || (!item.txnType && item.amount > 0)).reduce((s, item) => s + Math.abs(item.amount), 0);
                const mRefund = monthBase.filter(item => item.txnType === 'Refund' || (!item.txnType && item.amount < 0)).reduce((s, item) => s + Math.abs(item.amount), 0);
                const mNet = mExpense - mRefund;
                const mNetClass = mNet >= 0 ? 'amount-positive' : 'amount-negative';
                const sign = mNet >= 0 ? '' : '+';
                const mNetText = `<span class="${mNetClass}"><span class="amount-main"><span class="amount-sign">${sign ? sign : '&nbsp;'}</span><span class="amount-symbol">₹</span><span class="amount-val">${Math.abs(mNet).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span></span>`;

                const monthIndices = monthItems.map(item => state.expenses.indexOf(item)).filter(i => i >= 0);
                const mSelCount = monthIndices.filter(i => selectedIndices.has(i)).length;
                const mChecked = monthIndices.length > 0 && mSelCount === monthIndices.length;
                const mIndet = mSelCount > 0 && mSelCount < monthIndices.length;

                if (lastDateAll) {
                    sepHTML += `<tr class="month-separator"><td colspan="7"></td></tr>`;
                }
                const mColsAfter = 2;
                sepHTML += `<tr class="month-header">
                    <td class="col-batch-select hide-on-mobile" style="text-align: center;">
                        <input type="checkbox" class="batch-select-checkbox batch-select-month" data-month="${currentMonthStr}" ${mChecked ? 'checked' : ''} ${mIndet ? 'data-indeterminate="true"' : ''} onclick="event.stopPropagation(); window.toggleMonthSelection('${currentMonthStr}', this.checked);">
                    </td>
                    <td colspan="3">${mName}</td>
                    <td class="month-header-total">${mNetText}</td>
                    <td class="month-header-empty" colspan="${mColsAfter}"></td>
                </tr>`;
                sepHTML += getDaySeparatorHTML(e.date, filtered, 7, selectedIndices);
            } else if (lastDateAll && lastDateAll !== e.date) {
                sepHTML = getDaySeparatorHTML(e.date, filtered, 7, selectedIndices);
            }
            lastDateAll = e.date;
        }
        const rawSources = getRawSourceList(e.source);
        const displaySources = getDisplaySourceList(e.source);
        let sourceBadge = '';
        if (rawSources.length > 0) {
            const fullBadges = rawSources.map(s => `<span class="badge-source hide-on-mobile" title="${escHtml(s)}">${escHtml(s)}</span>`).join('');
            const shortBadges = displaySources.map(s => `<span class="badge-source hide-on-desktop" title="${escHtml(e.source)}">${escHtml(s)}</span>`).join('');
            sourceBadge = fullBadges + shortBadges;
        }
        const displayTxnIds = getDisplayTxnIdList(e);
        let txnBadge = displayTxnIds.map(id => `<span class="badge-txn">#${escHtml(id)}</span>`).join('');
        let typeBadge = txnTypeBadgeHTML(e.txnType);
        let modeBadge = e.txnMode ? `<span class="badge-mode" title="${escHtml(e.txnMode)}">${escHtml(e.txnMode)}</span>` : '';
        let tagBadge = e.tag ? `<span class="badge-tag" title="Tag: ${escHtml(e.tag)}">🏷️ ${escHtml(e.tag)}</span>` : '';
        let badges = typeBadge + modeBadge + tagBadge + sourceBadge + txnBadge;

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
            <span class="badge-txn type-investment hide-on-mobile badge-refund-toggle" onclick="toggleRefundCollapsible('txn-row-${realIdx}', event)" title="Click to toggle linked refund details" style="cursor: pointer; user-select: none;">
                Refunded (${refunds.length}) <span class="toggle-arrow" style="display: inline-block; transition: transform 0.2s ease; font-size: 0.7rem; margin-left: 2px; transform: rotate(${arrowRotate});">▼</span>
            </span>
            <span class="badge-txn type-investment hide-on-desktop" title="${refunds.length} linked refund(s): ₹${totalRefunded}">
                Refunded (${refunds.length})
            </span>`;
        } else if (hasLinkedExpenses) {
            const arrowRotate = isCollapsedByDefault ? '0deg' : '180deg';
            badges += `
            <span class="badge-txn type-income hide-on-mobile badge-refund-toggle" onclick="toggleRefundCollapsible('txn-row-${realIdx}', event)" title="Click to toggle linked original expense details" style="cursor: pointer; user-select: none;">
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

        const isExpense = !e.txnType || e.txnType === 'Expense' || e.amount > 0;

        let actionsHtml = `
            <td data-label="Actions">
                <div class="row-actions action-dropdown-wrap">
                    <button class="row-btn action-dropdown-btn hide-on-mobile" onclick="toggleActionDropdown(event, ${realIdx})" title="Actions">⋮</button>
                    <div class="action-dropdown-menu hide-on-mobile" id="action-dropdown-${realIdx}">
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
                    <button class="row-btn hide-on-desktop mobile-menu-btn" onclick="openMobileTxnMenu(${realIdx})" title="Options">⋮</button>
                </div>
            </td>
        `;

        const hasSubrow = hasRefunds || hasLinkedExpenses;
        const isExpandedClass = hasSubrow && !isCollapsedByDefault ? 'refund-expanded' : '';
        const isSelected = selectedIndices.has(realIdx);
        const mainRowHtml = `
        <tr id="txn-row-${realIdx}" class="${g.merged ? 'merged-row' : ''} ${isExpandedClass} touchable-row ${isSelected ? 'row-selected' : ''}" data-real-idx="${realIdx}" data-refund-idx="${refundRealIdx || -1}" data-merged="${g.merged ? 'true' : 'false'}">
            <td class="col-batch-select hide-on-mobile" style="text-align: center;">
                <input type="checkbox" class="batch-select-checkbox" data-real-idx="${realIdx}" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); window.toggleTxnSelection(${realIdx}, this.checked);">
            </td>
            <td data-label="Date">
                <div style="display: flex; flex-direction: row; align-items: center; gap: 6px; white-space: nowrap; overflow: hidden; width: 100%;">
                    <div style="flex-shrink: 0;">📅 ${formatDate(e.date)}</div>
                    ${e.location ? `<div style="font-size: 0.75rem; color: var(--text-muted); display: flex; align-items: center; gap: 2px; overflow: hidden; min-width: 0;" title="${escHtml(e.location)}"><span>📍</span><span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escHtml(e.location)}</span></div>` : ''}
                </div>
            </td>
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

        const subrowHtml = renderRefundCollapsibleSubrow('txn-row', realIdx, refunds, totalRefunded, netAmt, 7, linkedExpenses);

        return sepHTML + mainRowHtml + subrowHtml;
    }).join('');
    
    if (isTruncated) {
        htmlContent += `<tr id="infinite-scroll-txns"><td colspan="7" style="text-align: center; padding: 16px; color: var(--text-muted); font-size: 0.85rem;">Loading more...</td></tr>`;
    }
    
    tbody.innerHTML = htmlContent;

    tbody.querySelectorAll('[data-indeterminate="true"]').forEach(el => {
        el.indeterminate = true;
    });

    if (isTruncated) {
        setupInfiniteScroll('infinite-scroll-txns', 'transactions', renderTransactions);
    }

    updateBatchActionBar();
}



// --- Mobile Action Menu & Long Press ---
let longPressTimer;
const LONG_PRESS_DURATION = 500;

let activeTouchRow = null;

document.addEventListener('touchstart', (e) => {
    const row = e.target.closest('.touchable-row');
    if (!row) return;
    
    // Check if the target is a button, don't trigger long press if clicking a button
    if (e.target.closest('.row-btn') || e.target.closest('button')) return;

    activeTouchRow = row;
    row.classList.add('row-holding');

    longPressTimer = setTimeout(() => {
        const realIdx = parseInt(row.getAttribute('data-real-idx'));
        const schedIdx = parseInt(row.getAttribute('data-sched-idx'));
        
        if (!isNaN(realIdx)) {
            const prefix = row.getAttribute('data-row-prefix') || 'txn-row';
            window.openMobileTxnMenu(realIdx, prefix);
            if (navigator.vibrate) navigator.vibrate(50);
        } else if (!isNaN(schedIdx)) {
            if (window.openScheduledMobileMenu) window.openScheduledMobileMenu(schedIdx);
            if (navigator.vibrate) navigator.vibrate(50);
        }
    }, LONG_PRESS_DURATION);
}, { passive: true });

function clearTouchState() {
    clearTimeout(longPressTimer);
    if (activeTouchRow) {
        activeTouchRow.classList.remove('row-holding');
        activeTouchRow = null;
    }
}

document.addEventListener('touchend', clearTouchState);
document.addEventListener('touchmove', clearTouchState);
document.addEventListener('touchcancel', clearTouchState);

window.openMobileTxnMenu = function (realIdx, prefix = 'txn-row') {
    clearTouchState();
    const e = state.expenses[realIdx];
    if (!e) return;

    let row = document.getElementById(`${prefix}-${realIdx}`)
           || document.getElementById(`txn-row-${realIdx}`)
           || document.getElementById(`dash-row-${realIdx}`)
           || document.querySelector(`[data-real-idx="${realIdx}"]`);

    const overlay = document.getElementById('mobile-txn-menu-overlay');
    if (!overlay) return;

    // Find if transaction belongs to a group with linked refund(s)
    const groups = mergeRefundTransactions(state.expenses);
    const group = groups.find(g => g.main === e || (g.refunds && g.refunds.includes(e)));
    const hasRefunds = group && group.refunds && group.refunds.length > 0;
    const isTargetRefund = isRefundTxn(e);

    const detailsContainer = document.getElementById('mobile-txn-details');
    if (detailsContainer) {
        let renderTxnBlock = (txn, titlePrefix = '', showInlineActions = false) => {
            const itemRealIdx = state.expenses ? state.expenses.indexOf(txn) : -1;
            let amtHtml = `<div class="mobile-txn-details-amount ${amountClass(txn)}">${renderAmountHTML(txn)}</div>`;
            
            let typeBadge = txnTypeBadgeHTML(txn.txnType) || '';
            let modeBadge = txn.txnMode ? `<span class="badge-mode" title="${escHtml(txn.txnMode)}">${escHtml(txn.txnMode)}</span>` : '';
            let displaySources = getDisplaySourceList(txn.source);
            let sourceBadge = displaySources.map(s => `<span class="badge-source" title="${escHtml(txn.source)}">${escHtml(s)}</span>`).join('');
            const displayTxnIds = getDisplayTxnIdList(txn);
            let txnBadge = displayTxnIds.map(id => `<span class="badge-txn">#${escHtml(id)}</span>`).join('');
            let badgesHtml = (typeBadge || modeBadge || sourceBadge || txnBadge) ? `<div class="badges-wrapper" style="justify-content: flex-start; margin: 0; padding-top: 4px;">${typeBadge}${modeBadge}${sourceBadge}${txnBadge}</div>` : '';

            let metaHtml = `<div class="mobile-txn-details-meta">
                <span>📅 ${formatDate(txn.date)}</span>
                <span>${escHtml(txn.txnMode)}</span>
                ${txn.location ? `<span>📍 ${escHtml(txn.location)}</span>` : ''}
            </div>`;

            let blockActionsHtml = '';
            if (showInlineActions && itemRealIdx !== -1) {
                blockActionsHtml = `
                    <div class="mobile-block-actions" style="display: flex; gap: 6px; align-items: center; margin-top: 4px;">
                        <button type="button" class="btn-block-action" onclick="event.stopPropagation(); if (typeof window.closeMobileActionSheet === 'function') window.closeMobileActionSheet(); window.editEntry(${itemRealIdx});" title="Edit this item" style="padding: 3px 8px; font-size: 0.75rem; border-radius: var(--radius-xs, 4px); border: 1px solid var(--border-subtle, rgba(255,255,255,0.15)); background: rgba(255, 255, 255, 0.06); color: var(--text-main, #fff); cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">✏️ Edit</button>
                        <button type="button" class="btn-block-action btn-block-delete" onclick="event.stopPropagation(); if (typeof window.closeMobileActionSheet === 'function') window.closeMobileActionSheet(); window.openDeleteModal(${itemRealIdx});" title="Delete this item" style="padding: 3px 8px; font-size: 0.75rem; border-radius: var(--radius-xs, 4px); border: 1px solid rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.12); color: #ff453a; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">🗑️ Delete</button>
                    </div>
                `;
            }

            return `
                <div class="mobile-txn-details-block" style="${titlePrefix ? 'margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);' : ''}">
                    <div class="mobile-txn-details-header" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                        <div class="mobile-txn-details-title" style="flex: 1;">${titlePrefix}${escHtml(txn.category)}</div>
                        <div style="display: flex; flex-direction: column; align-items: flex-end;">
                            ${amtHtml}
                            ${blockActionsHtml}
                        </div>
                    </div>
                    ${txn.note ? `<div class="mobile-txn-details-note">${escHtml(txn.note)}</div>` : ''}
                    ${metaHtml}
                    ${badgesHtml}
                </div>
            `;
        };

        if (group && hasRefunds) {
            if (!isTargetRefund) {
                // Main expense (Original Txn):
                // - Don't show inline buttons for Original Txn block (handled by bottom buttons)
                // - Show inline buttons for Refund blocks ONLY IF there are more than 1 refunds
                let blocksHtml = renderTxnBlock(group.main, 'Original: ', false);
                const showRefundInlineButtons = group.refunds.length > 1;
                group.refunds.forEach((r, rIdx) => {
                    const rLabel = group.refunds.length > 1 ? `Refund ${rIdx + 1}: ` : 'Refund: ';
                    blocksHtml += renderTxnBlock(r, rLabel, showRefundInlineButtons);
                });
                detailsContainer.innerHTML = blocksHtml;
            } else {
                // Target is a Refund:
                // - Show inline buttons ONLY for Original Txn block
                // - Don't show inline buttons on Refund block (handled by bottom buttons)
                detailsContainer.innerHTML = renderTxnBlock(group.main, 'Original: ', true) + renderTxnBlock(e, 'Refund: ', false);
            }
        } else {
            detailsContainer.innerHTML = renderTxnBlock(e, '', false);
        }
        detailsContainer.classList.remove('hidden');
    }
    
    // Bind buttons
    const btnEdit = document.getElementById('btn-mobile-edit');
    const btnRefund = document.getElementById('btn-mobile-refund');
    const btnDelete = document.getElementById('btn-mobile-delete');
    const btnDeleteRefund = document.getElementById('btn-mobile-delete-refund');
    const btnToggle = document.getElementById('btn-mobile-toggle');
    const btnLink = document.getElementById('btn-mobile-link');
    const btnCancel = document.getElementById('btn-mobile-cancel');

    // Reset handlers by cloning
    const cleanEdit = btnEdit.cloneNode(true);
    const cleanRefund = btnRefund.cloneNode(true);
    const cleanDelete = btnDelete.cloneNode(true);
    const cleanDeleteRefund = btnDeleteRefund.cloneNode(true);
    const cleanLink = btnLink ? btnLink.cloneNode(true) : null;
    const cleanCancel = btnCancel.cloneNode(true);
    
    btnEdit.replaceWith(cleanEdit);
    btnRefund.replaceWith(cleanRefund);
    btnDelete.replaceWith(cleanDelete);
    btnDeleteRefund.replaceWith(cleanDeleteRefund);
    if (btnLink && cleanLink) btnLink.replaceWith(cleanLink);
    btnCancel.replaceWith(cleanCancel);

    const closeModal = () => {
        overlay.classList.remove('open');
        document.body.classList.remove('modal-open');
        document.documentElement.classList.remove('modal-open');
    };
    window.closeMobileActionSheet = closeModal;
    if (btnToggle) btnToggle.style.display = 'none';

    if (cleanLink) {
        cleanLink.style.display = 'flex';
        cleanLink.innerHTML = isTargetRefund ? '<span>🔗</span> Link Original Expense' : '<span>🔗</span> Link Refunds';
        cleanLink.onclick = () => { closeModal(); window.openRefundLinkingModal(realIdx); };
    }

    if (hasRefunds && !isTargetRefund) {
        cleanEdit.innerHTML = '<span>✏️</span> Edit Original';
        cleanDelete.innerHTML = '<span>🗑️</span> Delete Original';
        cleanDeleteRefund.style.display = 'flex';
        const refundCount = group.refunds.length;
        cleanDeleteRefund.innerHTML = `<span>↩️🗑️</span> Delete ${refundCount > 1 ? `All Linked Refunds (${refundCount})` : 'Linked Refund'}`;
        cleanRefund.style.display = 'none';

        const refundIndices = group.refunds.map(r => state.expenses.indexOf(r)).filter(i => i >= 0);
        cleanDeleteRefund.onclick = () => {
            closeModal();
            if (refundIndices.length === 1) {
                window.openDeleteModal(refundIndices[0]);
            } else if (refundIndices.length > 1) {
                if (typeof window.openDeleteMultipleModal === 'function') {
                    window.openDeleteMultipleModal(
                        refundIndices,
                        `Delete ${refundIndices.length} Linked Refunds?`,
                        `Are you sure you want to delete all ${refundIndices.length} linked refunds for "${group.main.category}"?`
                    );
                }
            }
        };
    } else if (isTargetRefund) {
        cleanEdit.innerHTML = '<span>✏️</span> Edit Refund';
        cleanDelete.innerHTML = '<span>🗑️</span> Delete Refund';
        cleanDeleteRefund.style.display = 'none';
        cleanRefund.style.display = 'none';
    } else {
        cleanEdit.innerHTML = '<span>✏️</span> Edit Transaction';
        cleanDelete.innerHTML = '<span>🗑️</span> Delete Transaction';
        cleanDeleteRefund.style.display = 'none';
        cleanRefund.style.display = 'flex';
        cleanRefund.onclick = () => { closeModal(); window.generateRefund(realIdx); };
    }

    cleanEdit.onclick = () => { closeModal(); window.editEntry(realIdx); };
    cleanDelete.onclick = () => { closeModal(); window.openDeleteModal(realIdx); };
    cleanCancel.onclick = () => { closeModal(); };

    // Also close on overlay click
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            closeModal();
        }
    };

    overlay.classList.add('open');
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
};

window.openScheduledMobileMenu = function (idx) {
    clearTouchState();
    const row = document.getElementById(`sched-row-${idx}`);
    if (!row) return;

    const st = state.scheduledTransactions[idx];
    const overlay = document.getElementById('mobile-txn-menu-overlay');
    const detailsContainer = document.getElementById('mobile-txn-details');
    if (detailsContainer && st) {
        let amtHtml = `<div class="mobile-txn-details-amount ${amountClass(st)}">${renderAmountHTML(st)}</div>`;
        let typeBadge = txnTypeBadgeHTML(st.txnType);
        let badgesHtml = typeBadge ? `<div class="badges-wrapper" style="justify-content: flex-start; margin: 0; padding-top: 4px;">${typeBadge}</div>` : '';

        let nextRunHtml = st.frequency === 'instant' ? '' : `<span>📅 Next: ${formatDate(st.next_run_date)}</span>`;
        let metaHtml = `<div class="mobile-txn-details-meta">
            <span style="text-transform: capitalize;">🔄 ${escHtml(buildFrequencyString(st, formatDate))}</span>
            ${nextRunHtml}
        </div>`;
        
        let disabledHtml = st.disabled ? `<div style="color: var(--danger); font-size: 0.85rem; font-weight: 600; padding: 6px 10px; background: rgba(239, 68, 68, 0.1); border-radius: var(--radius-sm); border: 1px solid rgba(239, 68, 68, 0.2); display: inline-flex; align-items: center; gap: 6px; width: fit-content; margin-top: 2px;">⚠️ Disabled</div>` : '';

        detailsContainer.innerHTML = `
            <div class="mobile-txn-details-block">
                <div class="mobile-txn-details-header">
                    <div class="mobile-txn-details-title">${escHtml(st.category)}</div>
                    ${amtHtml}
                </div>
                ${st.note ? `<div class="mobile-txn-details-note">${escHtml(st.note)}</div>` : ''}
                ${metaHtml}
                ${badgesHtml}
                ${disabledHtml}
            </div>
        `;
        detailsContainer.classList.remove('hidden');
    }

    const btnEdit = document.getElementById('btn-mobile-edit');
    const btnRefund = document.getElementById('btn-mobile-refund');
    const btnDelete = document.getElementById('btn-mobile-delete');
    const btnDeleteRefund = document.getElementById('btn-mobile-delete-refund');
    const btnToggle = document.getElementById('btn-mobile-toggle');
    const btnLink = document.getElementById('btn-mobile-link');
    const btnCancel = document.getElementById('btn-mobile-cancel');

    const cleanEdit = btnEdit.cloneNode(true);
    const cleanRefund = btnRefund.cloneNode(true);
    const cleanDelete = btnDelete.cloneNode(true);
    const cleanDeleteRefund = btnDeleteRefund.cloneNode(true);
    const cleanToggle = btnToggle.cloneNode(true);
    const cleanCancel = btnCancel.cloneNode(true);

    btnEdit.replaceWith(cleanEdit);
    btnRefund.replaceWith(cleanRefund);
    btnDelete.replaceWith(cleanDelete);
    btnDeleteRefund.replaceWith(cleanDeleteRefund);
    btnToggle.replaceWith(cleanToggle);
    btnCancel.replaceWith(cleanCancel);

    const closeModal = () => {
        overlay.classList.remove('open');
        document.body.classList.remove('modal-open');
        document.documentElement.classList.remove('modal-open');
    };

    if (btnLink) btnLink.style.display = 'none';
    cleanRefund.style.display = 'none';
    cleanDeleteRefund.style.display = 'none';
    cleanToggle.style.display = 'flex';
    
    if (st.frequency === 'instant') {
        cleanToggle.innerHTML = st.disabled ? '<span>▶️</span> Enable Quick Add' : '<span>⏸️</span> Disable Quick Add';
        cleanEdit.innerHTML = '<span>✏️</span> Edit Quick Add';
        cleanDelete.innerHTML = '<span>🗑️</span> Delete Quick Add';
    } else {
        cleanToggle.innerHTML = st.disabled ? '<span>▶️</span> Enable Schedule' : '<span>⏸️</span> Disable Schedule';
        cleanEdit.innerHTML = '<span>✏️</span> Edit Schedule';
        cleanDelete.innerHTML = '<span>🗑️</span> Delete Schedule';
    }

    cleanToggle.onclick = () => {
        closeModal();
        const toggleBtn = row.querySelector('.btn-toggle-disable');
        if (toggleBtn) toggleBtn.click();
    };
    
    cleanEdit.onclick = () => {
        closeModal();
        window.editScheduledTransaction(idx);
    };

    cleanDelete.onclick = () => {
        closeModal();
        const delBtn = row.querySelector('.btn-del');
        if (delBtn) delBtn.click();
    };

    cleanCancel.onclick = closeModal;
    overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

    overlay.classList.add('open');
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
};

/* ══════════════ GLOBAL ACTION DROPDOWN HANDLERS ══════════════ */
window.toggleActionDropdown = function (event, id) {
    if (event) event.stopPropagation();
    const targetMenu = document.getElementById(`action-dropdown-${id}`);
    if (!targetMenu) return;

    const isOpen = targetMenu.classList.contains('show');
    window.closeAllActionDropdowns();

    if (!isOpen) {
        targetMenu.classList.remove('drop-up');
        targetMenu.classList.add('show');

        // Check if menu overflows bottom of window or table/card scroll container
        const btn = event ? (event.currentTarget || (event.target && event.target.closest ? event.target.closest('.action-dropdown-btn') : null)) : null;
        if (btn) {
            const btnRect = btn.getBoundingClientRect();
            const menuHeight = targetMenu.offsetHeight || 140;
            const viewportSpaceBelow = window.innerHeight - btnRect.bottom;

            const container = btn.closest('.table-wrap') || btn.closest('.card') || btn.closest('.refund-collapsible-container');
            let containerSpaceBelow = viewportSpaceBelow;
            if (container) {
                const containerRect = container.getBoundingClientRect();
                containerSpaceBelow = containerRect.bottom - btnRect.bottom;
            }

            if (viewportSpaceBelow < menuHeight + 12 || containerSpaceBelow < menuHeight + 12) {
                targetMenu.classList.add('drop-up');
            }
        }
    }
};

window.closeAllActionDropdowns = function () {
    document.querySelectorAll('.action-dropdown-menu.show').forEach(menu => {
        menu.classList.remove('show');
    });
};

document.addEventListener('click', (e) => {
    if (!e.target.closest('.action-dropdown-wrap')) {
        window.closeAllActionDropdowns();
    }
});

document.addEventListener('scroll', () => window.closeAllActionDropdowns(), true);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.closeAllActionDropdowns();
});

