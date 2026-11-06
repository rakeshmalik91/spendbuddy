import { getFilteredExpenses } from "./filters.js";
import { getDaySeparatorHTML } from "./settings.js";
import { formatDate, escHtml, amountClass, txnTypeBadgeHTML, txnModeBadgeHTML, mergeRefundTransactions, setupInfiniteScroll, buildFrequencyString, isRefundTxn, getDisplayTxnId, getDisplayTxnIdList, getRawSourceList, getDisplaySource, getDisplaySourceList, getScheduleIdFromTxnId, isScheduleGeneratedTxn, TXN_SOURCE_SCHEDULE, renderAmountHTML, renderRefundCollapsibleSubrow, isSameDaySameAmountSingleRefund, toast } from "../utils/helpers.js";
import { $ } from "../core/init.js";
import { state } from "../core/state.js";
import { getSelectedTxnIndices, updateBatchActionBar } from "./batch_update.js";
import { evaluateExpression, saveYearCSV, editEntry } from "./form.js";
import { roundAmount } from "../services/storage.js";

/* ══════════════ TRANSACTIONS TABLE ══════════════ */

export function isInlineEditModified(realIdx) {
    if (realIdx === null || realIdx === undefined || !state.expenses) return false;
    const targetTxn = state.expenses[realIdx];
    if (!targetTxn) return false;

    const amtInput = document.getElementById(`inline-edit-amount-${realIdx}`);
    const catSelect = document.getElementById(`inline-edit-category-${realIdx}`);
    const noteInput = document.getElementById(`inline-edit-note-${realIdx}`);
    if (!amtInput && !catSelect && !noteInput) return false;

    const initialAmtStr = targetTxn.amountExpression || (
        Math.abs(targetTxn.amount) % 1 === 0 
            ? Math.abs(targetTxn.amount).toString() 
            : Math.abs(targetTxn.amount).toFixed(2)
    );
    const initialCategory = targetTxn.category || '';
    const initialNote = targetTxn.note || '';

    const currentAmtStr = amtInput ? amtInput.value.trim() : '';
    const currentCategory = catSelect ? catSelect.value : '';
    const currentNote = noteInput ? noteInput.value : '';

    return (currentAmtStr !== initialAmtStr.trim()) ||
           (currentCategory !== initialCategory) ||
           (currentNote !== initialNote);
}

export function startInlineEdit(realIdx) {
    if (typeof window !== 'undefined' && window.innerWidth <= 860) {
        if (typeof editEntry === 'function') editEntry(realIdx);
        return;
    }
    state.inlineEditTxnIdx = realIdx;
    state.inlineEditStartedAt = Date.now();
    renderTransactions();
}

export function cancelInlineEdit() {
    state.inlineEditTxnIdx = null;
    state.inlineEditStartedAt = null;
    renderTransactions();
}

export async function saveInlineEdit(realIdx) {
    if (state.cloudSyncInProgress) {
        toast('Please wait for cloud sync to complete...', 'error');
        return;
    }
    const targetTxn = state.expenses[realIdx];
    if (!targetTxn) return;

    const amtInput = document.getElementById(`inline-edit-amount-${realIdx}`);
    const catSelect = document.getElementById(`inline-edit-category-${realIdx}`);
    const noteInput = document.getElementById(`inline-edit-note-${realIdx}`);
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

    const isNegative = targetTxn.txnType === 'Refund' || targetTxn.txnType === 'Income' || (targetTxn.amount < 0 && !targetTxn.txnType);
    const finalAmount = isNegative ? -Math.abs(parsedAmt) : Math.abs(parsedAmt);
    const hasOperators = rawAmount.split(/[-+*]/).filter(Boolean).length > 1;
    const finalExpression = hasOperators ? rawAmount : '';
    const finalCategory = catSelect ? catSelect.value.trim() : targetTxn.category;
    const finalNote = noteInput ? noteInput.value.trim() : targetTxn.note;

    targetTxn.category = finalCategory;
    targetTxn.amount = finalAmount;
    targetTxn.amountExpression = finalExpression;
    targetTxn.note = finalNote;

    state.inlineEditTxnIdx = null;
    state.inlineEditStartedAt = null;
    toast('Saving changes...', 'info');

    try {
        const year = (targetTxn.date || '').split('-')[0] || new Date().getFullYear().toString();
        await saveYearCSV(year);
        toast('Transaction updated!', 'success');
        renderTransactions();

        setTimeout(() => {
            const row = document.getElementById(`txn-row-${realIdx}`);
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
        console.error('Inline edit save failed:', err);
        toast('Error saving transaction to cloud', 'error');
        renderTransactions();
    }
}

function attachInlineEventListeners(realIdx) {
    const amtInput = document.getElementById(`inline-edit-amount-${realIdx}`);
    const noteInput = document.getElementById(`inline-edit-note-${realIdx}`);
    const catSelect = document.getElementById(`inline-edit-category-${realIdx}`);
    const previewPill = document.getElementById(`inline-edit-preview-${realIdx}`);
    if (!amtInput) return;

    const targetTxn = state.expenses[realIdx];
    const isNegative = targetTxn && (targetTxn.txnType === 'Refund' || targetTxn.txnType === 'Income' || (targetTxn.amount < 0 && !targetTxn.txnType));

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
    updatePreview();

    function handleKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveInlineEdit(realIdx);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelInlineEdit();
        }
    }

    amtInput.addEventListener('keydown', handleKeydown);
    if (noteInput) noteInput.addEventListener('keydown', handleKeydown);
    if (catSelect) catSelect.addEventListener('keydown', handleKeydown);

    setTimeout(() => {
        amtInput.focus();
        amtInput.select();
    }, 50);
}

export function renderTransactions() {
    const toggleMergeRefundsTxn = $('#toggle-merge-refunds-txn');
    if (toggleMergeRefundsTxn && toggleMergeRefundsTxn.checked !== (state.mergeRefunds !== false)) {
        toggleMergeRefundsTxn.checked = state.mergeRefunds !== false;
    }

    const toggleHideSourceTxnId = $('#toggle-hide-source-txnid');
    if (toggleHideSourceTxnId && toggleHideSourceTxnId.checked !== (state.hideSourceTxnId === true)) {
        toggleHideSourceTxnId.checked = state.hideSourceTxnId === true;
    }

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
                    sepHTML += `<tr class="month-separator"><td colspan="5"></td></tr>`;
                }
                const mColsAfter = 1;
                sepHTML += `<tr class="month-header">
                    <td class="col-batch-select hide-on-mobile" style="text-align: center;">
                        <input type="checkbox" class="batch-select-checkbox batch-select-month" data-month="${currentMonthStr}" ${mChecked ? 'checked' : ''} ${mIndet ? 'data-indeterminate="true"' : ''} onclick="event.stopPropagation(); window.toggleMonthSelection('${currentMonthStr}', this.checked);">
                    </td>
                    <td colspan="2">${mName}</td>
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
        if (displaySources.length > 0) {
            // Desktop-only jump target, decided per badge LABEL: a badge reading exactly
            // 'Schedule' is clickable. A composite source is split into separate
            // badges on desktop, so its standalone 'Schedule' badge still links;
            // only the combined label ('Schedule & Email') is excluded.
            // The schedule is resolved at click time from the transaction itself, so
            // rows generated before the __SCHEDULER_ id scheme still work.
            // Original visibility classes are preserved; the click handler itself is
            // desktop-guarded, and the pointer/hover affordance is media-scoped in CSS.
            const schedLinkId = getScheduleIdFromTxnId(e.txnId || e.transactionId);
            const linkAttrs = (baseClass, label) => label === TXN_SOURCE_SCHEDULE
                ? ` class="${baseClass} badge-schedule-link" data-txn-idx="${realIdx}"${schedLinkId ? ` data-sched-id="${escHtml(schedLinkId)}"` : ''} onclick="openScheduleFromBadge(${realIdx}, event)"`
                : ` class="${baseClass}"`;
            const linkTitle = (baseTitle, label) => label === TXN_SOURCE_SCHEDULE
                ? `${escHtml(baseTitle)} — click to open this schedule`
                : escHtml(baseTitle);
            if (state.hideSourceTxnId) {
                // In compact view, shorten sources similar to dashboard
                sourceBadge = displaySources.map(s => `<span${linkAttrs('badge-source', s)} title="${linkTitle(e.source, s)}">${escHtml(s)}</span>`).join('');
            } else {
                const fullBadges = rawSources.map(s => `<span${linkAttrs('badge-source hide-on-mobile', s)} title="${linkTitle(s, s)}">${escHtml(s)}</span>`).join('');
                const shortBadges = displaySources.map(s => `<span class="badge-source hide-on-desktop" title="${escHtml(e.source)}">${escHtml(s)}</span>`).join('');
                sourceBadge = fullBadges + shortBadges;
            }
        }
        let locationBadge = e.location ? `<span class="badge-location" title="${escHtml(e.location)}">📍 ${escHtml(e.location)}</span>` : '';
        const displayTxnIds = getDisplayTxnIdList(e);
        let txnBadge = '';
        if (displayTxnIds.length > 0) {
            if (state.hideSourceTxnId) {
                // In compact view, show txn ID on desktop and hide on mobile similar to dashboard
                txnBadge = displayTxnIds.map(id => `<span class="badge-txn hide-on-mobile" title="#${escHtml(id)}">#${escHtml(id)}</span>`).join('');
            } else {
                txnBadge = displayTxnIds.map(id => `<span class="badge-txn" title="#${escHtml(id)}">#${escHtml(id)}</span>`).join('');
            }
        }
        let typeBadge = txnTypeBadgeHTML(e.txnType);
        let modeBadge = txnModeBadgeHTML(e.txnMode, state.hideSourceTxnId);
        let tagBadge = e.tag ? `<span class="badge-tag" title="Tag: ${escHtml(e.tag)}">🏷️ ${escHtml(e.tag)}</span>` : '';
        let dateBadge = state.sortCol !== 'date' ? `<span class="badge-txn" title="Date: ${formatDate(e.date)}">${formatDate(e.date)}</span>` : '';
        let badges = dateBadge + locationBadge + modeBadge + tagBadge + typeBadge + sourceBadge + txnBadge;

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
        const isInlineEditing = (state.inlineEditTxnIdx === realIdx);

        let catHtml = `<td data-label="Category" title="${escHtml(e.category)}">${escHtml(e.category)}</td>`;
        let noteHtml = `
            <td data-label="Note" class="${!e.note && !badges ? 'empty-note' : ''}">
                <div class="note-content">
                    <span class="${!e.note ? 'empty-dash' : ''}">${e.note ? escHtml(e.note) : ''}</span>
                    ${badges ? `<div class="badges-wrapper">${badges}</div>` : ''}
                </div>
            </td>`;
        let actionsHtml = '';

        if (isInlineEditing) {
            const distinctCategories = Array.from(new Set([
                ...(state.categories || []),
                ...state.expenses.map(ex => ex.category).filter(Boolean)
            ])).sort();
            if (e.category && !distinctCategories.includes(e.category)) {
                distinctCategories.unshift(e.category);
            }
            catHtml = `
            <td data-label="Category" class="inline-edit-cell">
                <select id="inline-edit-category-${realIdx}" class="inline-edit-input inline-edit-select">
                    ${distinctCategories.map(c => `<option value="${escHtml(c)}" ${c === e.category ? 'selected' : ''}>${escHtml(c)}</option>`).join('')}
                </select>
            </td>`;

            noteHtml = `
            <td data-label="Note" class="inline-edit-cell">
                <div class="inline-edit-note-wrap">
                    <input type="text" id="inline-edit-note-${realIdx}" class="inline-edit-input inline-edit-note-input" value="${escHtml(e.note || '')}" placeholder="Note..." autocomplete="off" />
                    ${badges ? `<div class="badges-wrapper">${badges}</div>` : ''}
                </div>
            </td>`;

            const initialAmtVal = e.amountExpression || (
                Math.abs(e.amount) % 1 === 0 
                    ? Math.abs(e.amount).toString() 
                    : Math.abs(e.amount).toFixed(2)
            );
            amountHtml = `
            <td data-label="Amount" class="inline-edit-cell">
                <div class="inline-edit-amount-wrap">
                    <input type="text" id="inline-edit-amount-${realIdx}" class="inline-edit-input inline-edit-amount-input" value="${escHtml(initialAmtVal)}" placeholder="Amount / expr" autocomplete="off" />
                    <span id="inline-edit-preview-${realIdx}" class="inline-edit-preview-pill" style="display: none;"></span>
                </div>
            </td>`;

            actionsHtml = `
            <td data-label="Actions" class="inline-edit-cell">
                <div class="row-actions inline-edit-actions">
                    <button type="button" class="row-btn inline-btn-save" onclick="saveInlineEdit(${realIdx})" title="Save (Enter)">✓</button>
                    <button type="button" class="row-btn inline-btn-cancel" onclick="cancelInlineEdit()" title="Cancel (Esc)">✕</button>
                </div>
            </td>`;
        } else {
            actionsHtml = `
            <td data-label="Actions">
                <div class="row-actions action-dropdown-wrap">
                    <button class="row-btn action-dropdown-btn hide-on-mobile" onclick="toggleActionDropdown(event, ${realIdx})" title="Actions">⋮</button>
                    <div class="action-dropdown-menu hide-on-mobile" id="action-dropdown-${realIdx}">
                        <button class="action-dropdown-item action-quick-edit show-on-ipad" onclick="startInlineEdit(${realIdx}); closeAllActionDropdowns();">
                            <span class="action-icon">⚡</span> Quick Edit
                        </button>
                        <button class="action-dropdown-item" onclick="openRefundLinkingModal(${realIdx}); closeAllActionDropdowns();">
                            <span class="action-icon">🔗</span> ${isExpense ? 'Link Refunds' : 'Link Original Expense'}
                        </button>
                        ${isScheduleGeneratedTxn(e) ? `
                        <button class="action-dropdown-item" onclick="openScheduleFromBadge(${realIdx}, event); closeAllActionDropdowns();">
                            <span class="action-icon">🗓️</span> Go to Schedule
                        </button>` : ''}
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
        }

        const hasSubrow = hasRefunds || hasLinkedExpenses;
        const isExpandedClass = hasSubrow && !isCollapsedByDefault ? 'refund-expanded' : '';
        const isSelected = selectedIndices.has(realIdx);
        const mainRowHtml = `
        <tr id="txn-row-${realIdx}" class="${g.merged ? 'merged-row' : ''} ${isExpandedClass} touchable-row ${isSelected ? 'row-selected' : ''} ${isInlineEditing ? 'quick-editing' : ''}" data-real-idx="${realIdx}" data-refund-idx="${refundRealIdx || -1}" data-merged="${g.merged ? 'true' : 'false'}" ondblclick="if (window.innerWidth > 860 && !event.target.closest('input, select, button, a, .action-dropdown-wrap, .badge-schedule-link')) startInlineEdit(${realIdx});">
            <td class="col-batch-select hide-on-mobile" style="text-align: center;">
                <input type="checkbox" class="batch-select-checkbox" data-real-idx="${realIdx}" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); window.toggleTxnSelection(${realIdx}, this.checked);">
            </td>
            <td data-label="Date">
                <div style="display: flex; flex-direction: row; align-items: center; gap: 6px; white-space: nowrap; overflow: hidden; width: 100%;">
                    <div class="txn-date-text hide-on-mobile" style="flex-shrink: 0;">${formatDate(e.date)}</div>
                    ${e.location ? `<div style="font-size: 0.75rem; color: var(--text-muted); display: flex; align-items: center; gap: 2px; overflow: hidden; min-width: 0;" title="${escHtml(e.location)}"><span>📍</span><span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escHtml(e.location)}</span></div>` : ''}
                </div>
            </td>
            ${catHtml}
            ${noteHtml}
            ${amountHtml}
            <td data-label="Mode" title="${escHtml(e.txnMode)}"><span class="mode-cell">${escHtml(e.txnMode)}</span></td>
            ${actionsHtml}
        </tr>`;

        const subrowHtml = renderRefundCollapsibleSubrow('txn-row', realIdx, refunds, totalRefunded, netAmt, 5, linkedExpenses);

        return sepHTML + mainRowHtml + subrowHtml;
    }).join('');
    
    if (isTruncated) {
        htmlContent += `<tr id="infinite-scroll-txns"><td colspan="5" style="text-align: center; padding: 16px; color: var(--text-muted); font-size: 0.85rem;">Loading more...</td></tr>`;
    }
    
    tbody.innerHTML = htmlContent;

    tbody.querySelectorAll('[data-indeterminate="true"]').forEach(el => {
        el.indeterminate = true;
    });

    if (isTruncated) {
        setupInfiniteScroll('infinite-scroll-txns', 'transactions', renderTransactions);
    }

    if (state.inlineEditTxnIdx !== null && state.inlineEditTxnIdx !== undefined) {
        attachInlineEventListeners(state.inlineEditTxnIdx);
    }

    updateBatchActionBar();
}



// --- Mobile Action Menu & Long Press ---
let longPressTimer;
const LONG_PRESS_DURATION = 500;
const LONG_PRESS_SLOP_PX = 10;

let activeTouchRow = null;
let touchStartX = 0;
let touchStartY = 0;
let longPressTriggered = false;

document.addEventListener('touchstart', (e) => {
    const row = e.target.closest('.touchable-row');
    if (!row) return;
    
    // Check if the target is a button, don't trigger long press if clicking a button
    if (e.target.closest('.row-btn') || e.target.closest('button') || e.target.closest('.badge-schedule-link')) return;

    activeTouchRow = row;
    longPressTriggered = false;
    if (e.touches && e.touches.length > 0) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }
    row.classList.add('row-holding');

    longPressTimer = setTimeout(() => {
        longPressTriggered = true;
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

document.addEventListener('touchmove', (e) => {
    if (!activeTouchRow) return;
    if (e.touches && e.touches.length > 0) {
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        if (Math.hypot(dx, dy) > LONG_PRESS_SLOP_PX) {
            clearTouchState();
        }
    } else {
        clearTouchState();
    }
}, { passive: true });

document.addEventListener('touchend', (e) => {
    if (longPressTriggered) {
        if (e.cancelable) e.preventDefault();
        longPressTriggered = false;
    }
    clearTouchState();
});
document.addEventListener('touchcancel', () => {
    longPressTriggered = false;
    clearTouchState();
});

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
            let modeBadge = txnModeBadgeHTML(txn.txnMode, false);
            let tagBadge = txn.tag ? `<span class="badge-tag" title="${escHtml(txn.tag)}">🏷️ ${escHtml(txn.tag)}</span>` : '';
            let rawSources = getRawSourceList(txn.source);
            let sourceBadge = rawSources.map(s => `<span class="badge-source" title="${escHtml(s)}">${escHtml(s)}</span>`).join('');
            const displayTxnIds = getDisplayTxnIdList(txn);
            let txnBadge = displayTxnIds.map(id => `<span class="badge-txn">#${escHtml(id)}</span>`).join('');
            let badgesHtml = (typeBadge || modeBadge || tagBadge || sourceBadge || txnBadge) ? `<div class="badges-wrapper" style="justify-content: flex-start; margin: 0; padding-top: 4px;">${typeBadge}${modeBadge}${tagBadge}${sourceBadge}${txnBadge}</div>` : '';

            let metaHtml = `<div class="mobile-txn-details-meta">
                <span>${formatDate(txn.date)}</span>
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
    const btnGoSchedule = document.getElementById('btn-mobile-go-schedule');
    const btnCancel = document.getElementById('btn-mobile-cancel');

    // Reset handlers by cloning
    const cleanEdit = btnEdit.cloneNode(true);
    const cleanRefund = btnRefund.cloneNode(true);
    const cleanDelete = btnDelete.cloneNode(true);
    const cleanDeleteRefund = btnDeleteRefund.cloneNode(true);
    const cleanLink = btnLink ? btnLink.cloneNode(true) : null;
    const cleanGoSchedule = btnGoSchedule ? btnGoSchedule.cloneNode(true) : null;
    const cleanCancel = btnCancel.cloneNode(true);

    btnEdit.replaceWith(cleanEdit);
    btnRefund.replaceWith(cleanRefund);
    btnDelete.replaceWith(cleanDelete);
    btnDeleteRefund.replaceWith(cleanDeleteRefund);
    if (btnLink && cleanLink) btnLink.replaceWith(cleanLink);
    if (btnGoSchedule && cleanGoSchedule) btnGoSchedule.replaceWith(cleanGoSchedule);
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

    if (cleanGoSchedule) {
        // Only offered for entries the scheduler generated.
        if (isScheduleGeneratedTxn(e)) {
            cleanGoSchedule.style.display = 'flex';
            cleanGoSchedule.innerHTML = '<span>🗓️</span> Go to Schedule';
            cleanGoSchedule.onclick = () => { closeModal(); window.openScheduleFromBadge(realIdx, null, true); };
        } else {
            cleanGoSchedule.style.display = 'none';
            cleanGoSchedule.onclick = null;
        }
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

        let nextRunHtml = st.frequency === 'instant' ? '' : `<span>Next: ${formatDate(st.next_run_date)}</span>`;
        let modeHtml = st.txnMode ? `<span>💳 ${escHtml(st.txnMode)}</span>` : '';
        let metaHtml = `<div class="mobile-txn-details-meta">
            <span style="text-transform: capitalize;">🔄 ${escHtml(buildFrequencyString(st, formatDate))}</span>
            ${modeHtml}
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

    if (state.inlineEditTxnIdx !== null && state.inlineEditTxnIdx !== undefined) {
        if (state.inlineEditStartedAt && (Date.now() - state.inlineEditStartedAt < 50)) {
            return;
        }
        const editIdx = state.inlineEditTxnIdx;
        const editContainer = document.getElementById(`txn-row-${editIdx}`)
            || document.querySelector(`[data-real-idx="${editIdx}"].quick-editing`)
            || document.querySelector('.refund-item-card.quick-editing');

        if (editContainer && !editContainer.contains(e.target)) {
            if (!isInlineEditModified(editIdx)) {
                cancelInlineEdit();
            }
        }
    }
});

document.addEventListener('scroll', () => window.closeAllActionDropdowns(), true);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.closeAllActionDropdowns();
        if (state.inlineEditTxnIdx !== null && state.inlineEditTxnIdx !== undefined) {
            cancelInlineEdit();
        }
    }
});

// Re-attach inline quick edit globals for table markup handlers
if (typeof window !== 'undefined') {
    window.startInlineEdit = startInlineEdit;
    window.saveInlineEdit = saveInlineEdit;
    window.cancelInlineEdit = cancelInlineEdit;
    window.openQuickEditModal = startInlineEdit;
    window.isInlineEditModified = isInlineEditModified;
}

/**
 * Resolves the schedule a generated transaction came from.
 * Primary path parses the `__SCHEDULER_<id>_<date>` system txn ID. Transactions
 * created before that ID scheme existed carry no schedule reference, so those fall
 * back to matching the schedule that last produced a run on the same date with the
 * same amount (and note, when both are present). The fallback only accepts a unique
 * match to avoid jumping to the wrong schedule.
 * @param {object} txn
 * @param {Array} schedules
 * @returns {number} Index into `schedules`, or -1 when it cannot be resolved.
 */
function resolveScheduleIndexForTxn(txn, schedules) {
    if (!txn || !Array.isArray(schedules) || schedules.length === 0) return -1;

    const schedId = getScheduleIdFromTxnId(txn.txnId || txn.transactionId);
    if (schedId) {
        const byId = schedules.findIndex(st => st && st.id !== undefined && st.id !== null && String(st.id) === schedId);
        if (byId !== -1) return byId;
    }

    const amt = Number(txn.amount);
    const note = (txn.note || '').trim().toLowerCase();
    const candidates = schedules.filter(st => {
        if (!st || st.last_run_date !== txn.date) return false;
        if (Number.isNaN(amt) || Number.isNaN(Number(st.amount))) return false;
        if (Number(st.amount) !== amt) return false;
        const stNote = (st.note || '').trim().toLowerCase();
        if (note && stNote && note !== stNote) return false;
        return true;
    });
    return candidates.length === 1 ? schedules.indexOf(candidates[0]) : -1;
}

/**
 * Desktop-only: jumps from a transaction's "Schedule" source badge to the schedule
 * list and flashes the originating row. Mirrors the post-save focus pattern in form.js
 * (switchView -> deferred lookup -> scrollIntoView -> temporary tint).
 * @param {number} txnIdx Index into state.expenses.
 * @param {Event} [event]
 */
if (typeof window !== 'undefined') {
    window.openScheduleFromBadge = function (txnIdx, event, allowMobile) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        // The source badge is desktop-only; the row action menus call this with
        // allowMobile so the same jump works from the mobile hold sheet.
        if (!allowMobile && window.innerWidth <= 860) return;

        const txn = state.expenses ? state.expenses[txnIdx] : null;
        if (!txn) {
            toast('Could not find that transaction.', 'error');
            return;
        }

        const idx = resolveScheduleIndexForTxn(txn, state.scheduledTransactions || []);
        if (idx === -1) {
            toast('Could not match this entry to a schedule. It may predate your current schedule list.', 'error');
            return;
        }

        if (typeof window.switchView === 'function') window.switchView('scheduled');

        setTimeout(() => {
            const row = document.getElementById(`sched-row-${idx}`);
            if (!row) {
                toast('Could not highlight the schedule row.', 'error');
                return;
            }
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const oldBg = row.style.backgroundColor;
            row.style.transition = 'background-color 0.5s ease';
            row.style.backgroundColor = 'rgba(99, 138, 255, 0.3)';
            setTimeout(() => { row.style.backgroundColor = oldBg; }, 1500);
        }, 100);
    };
}


