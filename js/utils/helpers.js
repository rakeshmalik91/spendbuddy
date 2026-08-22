import { state } from "../core/state.js";

/* ══════════════ RE-EXPORTS FROM SPLIT MODULES ══════════════
 * All consumer files continue to import from helpers.js unchanged.
 * The actual implementations now live in focused modules.
 * ════════════════════════════════════════════════════════════ */
export { parseLocalDate, getLocalDateString, formatMonth, formatDate, escHtml } from "./date_helpers.js";
export { getTxnIdList, SYSTEM_TXN_ID_PREFIXES, SYSTEM_TXN_SOURCES, TXN_SOURCE_SCHEDULE, TXN_SOURCE_QUICK_ADD, TXN_SOURCE_SMS_PREFIX, TXN_SOURCE_EMAIL_PREFIX, isSystemTxnId, getRealTxnIdList, getDisplayTxnId, getDisplayTxnIdList, getRawSourceList, getDisplaySource, getDisplaySourceList, hasMatchingTxnId, isRefundTxn, isTxnIdInOtherTxn, getSourceProvider, getSourceProvidersList, txnTypeBadgeHTML } from "./txn_id_helpers.js";
export { getDistance, getLastLocation, getCurrentLocationTag, resetLocationPermissionDenied } from "./location_helpers.js";
export { getCategoryForMerchant, getTxnTypeForMerchant, stripEmojiPrefix, mapTxnMode } from "./category_helpers.js";
export { calculateNextRunDate, buildFrequencyString } from "./scheduling_helpers.js";
export { mergeRefundTransactions, renderRefundCollapsibleSubrow, isSameDaySameAmountSingleRefund } from "./refund_helpers.js";
export {
    touchStartX, touchStartY, isSwiping1to1, isAnimatingSwipe,
    swipeCurrentNode, swipePrevNode, swipeNextNode, swipeTargetName,
    swipeDeltaX, isPullingDown, ptrDeltaY,
    handleSwipeEnd, cleanupSwipe
} from "./swipe_navigation.js";

// Import date & txn helpers locally for use by functions defined in this file
import { parseLocalDate, escHtml } from "./date_helpers.js";
import { isRefundTxn } from "./txn_id_helpers.js";

/* ══════════════ AMOUNT & DISPLAY HELPERS ══════════════ */

/**
 * Returns the CSS class to use for amount colouring based on txnType.
 * Income → cyan, Investment → purple, Transfer → muted grey,
 * Refund/negative → green, Expense/positive → red.
 */
export function amountClass(e) {
    const t = e.txnType;
    if (t === 'Income') return 'amount-income';
    if (t === 'Investment') return 'amount-investment';
    if (t === 'Transfer') return 'amount-transfer';
    return e.amount >= 0 ? 'amount-positive' : 'amount-negative';
}

/**
 * Inverts the signs of numbers in a mathematical expression string so that negative
 * expressions (e.g. "-55204-149") present positively (e.g. "55204+149") for refunds.
 */
export function invertExpression(expr) {
    if (!expr) return '';
    const tokens = expr.match(/([+-]?\s*\d+\.?\d*)/g);
    if (!tokens) return expr;

    const invertedTokens = tokens.map((token, idx) => {
        const trimmed = token.trim();
        if (trimmed.startsWith('-')) {
            const num = trimmed.slice(1).trim();
            return (idx === 0 ? '' : '+') + num;
        } else if (trimmed.startsWith('+')) {
            const num = trimmed.slice(1).trim();
            return '-' + num;
        } else {
            return (idx === 0 ? '-' : '-') + trimmed;
        }
    });

    let result = invertedTokens.join('');
    if (result.startsWith('+')) {
        result = result.slice(1);
    }
    if (result.startsWith('-')) {
        const reTokens = result.match(/([+-]?\s*\d+\.?\d*)/g);
        if (reTokens) {
            result = reTokens.map((t, i) => {
                const tr = t.trim();
                if (tr.startsWith('-')) {
                    const n = tr.slice(1).trim();
                    return (i === 0 ? '' : '+') + n;
                } else if (tr.startsWith('+')) {
                    return '-' + tr.slice(1).trim();
                } else {
                    return (i === 0 ? '' : '+') + tr;
                }
            }).join('');
            if (result.startsWith('+')) result = result.slice(1);
        }
    }
    return result;
}

/**
 * Renders the HTML representation of a transaction amount, keeping the sign and amount
 * strictly together on one line (.amount-main), while letting the amount expression
 * (.amount-expr) wrap onto the line below when overflowing in tight spaces.
 */
export function renderAmountHTML(e) {
    if (!e) return '';
    const isRefund = isRefundTxn(e) || e.txnType === 'Refund' || e.amount < 0;
    const sign = (e.txnType === 'Transfer' || e.amount >= 0) ? '' : '+';
    const symbol = (e.currency && e.currency !== 'INR') ? `${escHtml(e.currency)} ` : '₹';
    const formattedAmt = Math.abs(e.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    let exprStr = e.amountExpression || '';
    if (exprStr && isRefund) {
        exprStr = invertExpression(exprStr);
    }
    
    const exprHtml = exprStr ? `<span class="amount-expr">(${escHtml(exprStr)})</span>` : '';
    const signHtml = `<span class="amount-sign">${sign ? sign : '&nbsp;'}</span>`;
    return `<div class="amount-cell-wrap"><span class="amount-main">${signHtml}<span class="amount-symbol">${symbol}</span><span class="amount-val">${formattedAmt}</span></span>${exprHtml}</div>`;
}



/* ══════════════ MISC UTILITIES ══════════════ */

export function validatePasswordStrength(password) {
    if (password.length < 8) return "Password must be at least 8 characters long.";
    if (!/\d/.test(password)) return "Password must contain at least one number.";
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return "Password must contain at least one special character.";
    return null;
}

export function isMobileView() {
    return (typeof window !== 'undefined') && (window.innerWidth <= 768 || Boolean(window.Android));
}

export function toast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

export function setupInfiniteScroll(sentinelId, viewName, renderFn) {
    const sentinel = document.getElementById(sentinelId);
    if (!sentinel) return;

    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            observer.disconnect();
            if (viewName === 'dashboard') {
                state.limitDashboard += 20;
            } else if (viewName === 'transactions') {
                state.limitTransactions += 20;
            }
            renderFn();
        }
    }, { rootMargin: '200px' });

    observer.observe(sentinel);
}

/**
 * Populates the add/edit form with a scheduled transaction's data for editing.
 * Uses dynamic imports for UI modules to avoid circular dependency chains.
 */
export async function editScheduledTransaction(idx) {
    const { amountToStr } = await import("../services/storage.js");
    const { updateFormActionButtons } = await import("../ui/form.js");
    const { syncChips, renderCalendar } = await import("../ui/form_dropdowns.js");
    const { switchView } = await import("../ui/navigation.js");

    const $ = (sel) => document.querySelector(sel);

    state.editOriginView = window.location.hash.replace('#', '') || 'dashboard';
    const st = state.scheduledTransactions[idx];
    if (!st) return;

    if ($('#edit-scheduled-index')) $('#edit-scheduled-index').value = idx;
    $('#edit-index').value = -1;

    // Show expression if it exists, otherwise show the calculated amount
    $('#input-amount').value = st.amountExpression || amountToStr(Math.abs(st.amount));
    $('#input-currency').value = st.currency || 'INR';
    const scheduleDate = st.start_date || st.next_run_date;
    if (scheduleDate) {
        $('#input-date').value = scheduleDate;
        state.calViewDate = parseLocalDate(scheduleDate);
        if ($('#cal-days-container')) renderCalendar();
    }
    $('#input-category').value = st.category || '';
    $('#input-txn-type').value = st.txnMode || '';
    $('#input-note').value = st.note || '';
    if ($('#input-location')) $('#input-location').value = st.location || '';
    if ($('#input-tag')) $('#input-tag').value = st.tag || '';
    if (document.querySelectorAll) {
        document.querySelectorAll('#tag-suggestions .chip').forEach(c => c.classList.toggle('active', c.dataset.value === (st.tag || '')));
    }

    if ($('#input-frequency')) {
        $('#input-frequency').value = st.frequency || 'one-off';
        $('#input-frequency').dispatchEvent(new Event('change'));

        if (!isNaN(st.recur_month) && st.recur_month !== null) $('#input-freq-month').value = st.recur_month;
        if (!isNaN(st.recur_day) && st.recur_day !== null) {
            if (['monthly', 'bimonthly', 'quarterly'].includes(st.frequency)) {
                $('#input-freq-day').value = st.recur_day;
            } else {
                $('#input-freq-yearly-day').value = st.recur_day;
            }
        }
        if ((st.recur_weekdays && st.recur_weekdays.length > 0) || (!isNaN(st.recur_weekday) && st.recur_weekday !== null)) {
            document.querySelectorAll('.weekday-btn').forEach(b => b.classList.remove('selected'));
            let daysToSelect = (st.recur_weekdays && st.recur_weekdays.length > 0) ? st.recur_weekdays : [st.recur_weekday];
            daysToSelect.forEach(w => {
                let btn = document.querySelector(`.weekday-btn[data-val="${w}"]`);
                if (btn) btn.classList.add('selected');
            });
        }

        if ($('#input-end-enable')) {
            const isEnabled = st.end_condition !== 'never' && st.end_condition !== undefined && st.end_condition !== null;
            $('#input-end-enable').checked = isEnabled;
            if (st.end_date) {
                $('#input-end-date').type = 'date';
                $('#input-end-date').value = st.end_date;
            } else {
                $('#input-end-date').type = 'text';
                $('#input-end-date').value = '';
            }
            if (!isNaN(st.max_occurrences)) $('#input-max-occurrences').value = st.max_occurrences;
            $('#input-end-enable').dispatchEvent(new Event('change'));
        }
    }

    syncChips('#category-chips', st.category);
    syncChips('#txnmode-chips', st.txnMode);

    $('#form-title').textContent = 'Edit Scheduled Transaction';
    $('#btn-submit').style.display = 'inline-block';
    $('#btn-cancel').style.display = 'inline-block';
    updateFormActionButtons();

    switchView('add');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ══════════════ WINDOW GLOBAL BINDINGS ══════════════
 * Deferred via dynamic import() to avoid circular dependency chains at module load time.
 * These are only needed at runtime when the user interacts with inline HTML handlers.
 * ════════════════════════════════════════════════════ */
if (typeof window !== 'undefined') {
    // Register scheduling helper directly (defined in this file with lazy deps)
    window.editScheduledTransaction = editScheduledTransaction;

    // Lazy-load UI modules to avoid helpers.js ↔ settings.js/form.js/modal.js circular chains
    import("../ui/settings.js").then(({ editCategory, deleteCategory, editTxnMode, deleteTxnMode }) => {
        window.editCategory = editCategory;
        window.deleteCategory = deleteCategory;
        window.editTxnMode = editTxnMode;
        window.deleteTxnMode = deleteTxnMode;
    });

    import("../ui/form.js").then(({ editEntry, generateRefund }) => {
        window.editEntry = editEntry;
        window.generateRefund = generateRefund;
    });

    import("../ui/modal.js").then(({ openDeleteModal, openDeleteMultipleModal }) => {
        window.openDeleteModal = openDeleteModal;
        window.openDeleteMultipleModal = openDeleteMultipleModal;
    });
}
