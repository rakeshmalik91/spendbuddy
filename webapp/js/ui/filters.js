import { renderTransactions } from "./transactions.js";
import { $$, $ } from "../core/init.js";
import { escHtml } from "../utils/helpers.js";
import { getGlobalFilteredExpenses } from "./time_filter.js";
import { state } from "../core/state.js";

export function hasActiveFilters() {
    const filterIds = ['filter-category', 'filter-type', 'filter-transaction-type', 'filter-location', 'filter-tag'];
    const hasDropdown = filterIds.some(id => {
        const el = $(`#${id}`);
        return el && el.value !== '';
    });
    const searchEl = $('#filter-search');
    const hasSearch = searchEl && searchEl.value.trim() !== '';
    return hasDropdown || Boolean(hasSearch);
}

export function updateClearFiltersBtnState() {
    const clearBtn = $('#btn-clear-filters');
    if (!clearBtn) return;
    clearBtn.disabled = !hasActiveFilters();
}

export function clearAllFilters() {
    ['filter-category', 'filter-type', 'filter-transaction-type', 'filter-location', 'filter-tag'].forEach(id => {
        const el = $(`#${id}`);
        if (el) el.value = '';
    });
    const searchEl = $('#filter-search');
    if (searchEl) searchEl.value = '';

    state.sortCol = 'date';
    state.sortAsc = false;

    updateClearFiltersBtnState();
    renderTransactions();
}

if (typeof window !== 'undefined') {
    window.clearAllFilters = clearAllFilters;
}

export function setupFilters() {
    ['filter-category', 'filter-type', 'filter-transaction-type', 'filter-location', 'filter-tag'].forEach(id => {
        const el = $(`#${id}`);
        if (el) {
            el.addEventListener('change', () => {
                updateClearFiltersBtnState();
                renderTransactions();
            });
        }
    });
    const searchEl = $('#filter-search');
    if (searchEl) {
        searchEl.addEventListener('input', () => {
            updateClearFiltersBtnState();
            renderTransactions();
        });
    }

    const clearBtn = $('#btn-clear-filters');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearAllFilters);
    }
    updateClearFiltersBtnState();

    const toggleMergeRefundsTxn = $('#toggle-merge-refunds-txn');
    if (toggleMergeRefundsTxn) {
        toggleMergeRefundsTxn.checked = state.mergeRefunds !== false;
        toggleMergeRefundsTxn.addEventListener('change', async (e) => {
            const isEnabled = e.target.checked;
            state.mergeRefunds = isEnabled;
            localStorage.setItem('expman_merge_refunds', isEnabled ? 'true' : 'false');

            const settingsToggle = $('#toggle-merge-refunds');
            if (settingsToggle) settingsToggle.checked = isEnabled;

            try {
                const { updateUserSettings } = await import('../services/user_settings.js');
                await updateUserSettings({ ui: { mergeRefunds: state.mergeRefunds } });
            } catch(err) {
                console.error('Failed to sync mergeRefunds to cloud', err);
            }

            const { toast } = await import('../utils/helpers.js');
            toast(isEnabled ? 'Refund merging enabled' : 'Refund merging disabled', 'info');
            renderTransactions();
            try {
                const { renderDashboard } = await import('./dashboard.js');
                if (typeof renderDashboard === 'function') renderDashboard();
            } catch (err) {
                // ignore
            }
        });
    }

    const toggleHideSourceTxnId = $('#toggle-hide-source-txnid');
    if (toggleHideSourceTxnId) {
        toggleHideSourceTxnId.checked = state.hideSourceTxnId === true;
        toggleHideSourceTxnId.addEventListener('change', async (e) => {
            const isEnabled = e.target.checked;
            state.hideSourceTxnId = isEnabled;
            localStorage.setItem('expman_hide_source_txnid', isEnabled ? 'true' : 'false');

            const settingsToggle = $('#toggle-hide-source-txnid-settings');
            if (settingsToggle) settingsToggle.checked = isEnabled;

            const { toast } = await import('../utils/helpers.js');
            toast(isEnabled ? 'Compact view enabled' : 'Compact view disabled', 'info');
            renderTransactions();
            try {
                const { renderDashboard } = await import('./dashboard.js');
                if (typeof renderDashboard === 'function') renderDashboard();
            } catch (_) {}
        });
    }

    const toggleBtn = $('#filter-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const bar = $('#transaction-filter-bar');
            if (bar) bar.classList.toggle('open');
        });
    }

    const txnMenuBtn = $('#txn-menu-btn');
    const txnMenuDropdown = $('#txn-menu-dropdown');
    if (txnMenuBtn && txnMenuDropdown) {
        txnMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            txnMenuDropdown.classList.toggle('show');
            txnMenuBtn.classList.toggle('active', txnMenuDropdown.classList.contains('show'));
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#txn-header-actions')) {
                txnMenuDropdown.classList.remove('show');
                txnMenuBtn.classList.remove('active');
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                txnMenuDropdown.classList.remove('show');
                txnMenuBtn.classList.remove('active');
            }
        });
    }

    const exportCsvBtn = $('#btn-export-filtered-csv');
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', async () => {
            if (txnMenuDropdown) txnMenuDropdown.classList.remove('show');
            if (txnMenuBtn) txnMenuBtn.classList.remove('active');
            const { exportFilteredTransactionsToCSV } = await import('../services/export.js');
            exportFilteredTransactionsToCSV();
        });
    }
}

export function setupSort() {
    $$('.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (state.sortCol === col) {
                if (col === 'amount') {
                    if (state.sortAsc) {
                        state.sortCol = 'date';
                        state.sortAsc = false;
                    } else {
                        state.sortAsc = true;
                    }
                } else {
                    state.sortAsc = !state.sortAsc;
                }
            } else {
                state.sortCol = col;
                state.sortAsc = false;
            }
            renderTransactions();
        });
    });
}

export function getFilteredExpenses() {
    const currentExpenses = getGlobalFilteredExpenses();
    const category = $('#filter-category')?.value || '';
    const txnMode = $('#filter-type')?.value || '';
    const txnType = $('#filter-transaction-type')?.value || '';
    const location = $('#filter-location')?.value || '';
    const tag = $('#filter-tag')?.value || '';
    const search = $('#filter-search')?.value?.toLowerCase() || '';

    return currentExpenses.filter(e => {
        if (category && e.category !== category) return false;
        if (txnMode && e.txnMode !== txnMode) return false;
        if (location && e.location !== location) return false;
        if (tag && (!e.tag || e.tag !== tag)) return false;
        
        // Match the transaction type if filter is active
        if (txnType) {
            let actualType = e.txnType;
            if (!actualType) {
                // fallback for older local unmigrated rows if any
                actualType = e.amount < 0 ? 'Refund' : 'Expense';
            }
            if (actualType !== txnType) return false;
        }

        if (search && !e.note.toLowerCase().includes(search) && !e.category.toLowerCase().includes(search) && !(e.tag && e.tag.toLowerCase().includes(search))) return false;
        return true;
    });
}

export function populateFilterOptions() {
    const catSel = $('#filter-category');
    if (catSel) {
        const currentCat = catSel.value;
        catSel.innerHTML = '<option value="">All</option>' +
            state.categories.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
        catSel.value = currentCat;
    }

    const typeSel = $('#filter-type');
    if (typeSel) {
        const currentType = typeSel.value;
        typeSel.innerHTML = '<option value="">All</option>' +
            state.txnModes.map(t => `<option value="${escHtml(t)}">${escHtml(t)}</option>`).join('');
        typeSel.value = currentType;
    }

    // Txn types (Expense, Refund, etc) from state.expenses dynamically
    const txnTypeSel = $('#filter-transaction-type');
    if (txnTypeSel) {
        const currentTxnType = txnTypeSel.value;
        let uniqueTxnTypes = [...new Set(state.expenses.map(e => e.txnType).filter(t => t))].sort();
        if (uniqueTxnTypes.length === 0) uniqueTxnTypes = ['Expense', 'Refund', 'Income', 'Investment', 'Transfer'];
        
        uniqueTxnTypes = uniqueTxnTypes.filter(t => {
            if (t === 'Income' && state.hideIncome) return false;
            if (t === 'Investment' && state.hideInvestment) return false;
            if (t === 'Transfer' && state.hideTransfer) return false;
            return true;
        });

        txnTypeSel.innerHTML = '<option value="">All</option>' +
            uniqueTxnTypes.map(t => `<option value="${escHtml(t)}">${escHtml(t)}</option>`).join('');
        txnTypeSel.value = currentTxnType;
    }

    const locSel = $('#filter-location');
    if (locSel) {
        const currentLoc = locSel.value;
        const uniqueLocations = [...new Set(state.expenses.map(e => e.location).filter(l => l && l.trim() !== ''))].sort();
        locSel.innerHTML = '<option value="">All</option>' +
            uniqueLocations.map(l => `<option value="${escHtml(l)}">${escHtml(l)}</option>`).join('');
        locSel.value = currentLoc;
    }

    const tagSel = $('#filter-tag');
    if (tagSel) {
        const currentTag = tagSel.value;
        const tagLatestDateMap = new Map();
        if (Array.isArray(state.expenses)) {
            state.expenses.forEach(e => {
                const tag = (e.tag || '').trim();
                if (!tag) return;
                const existingDate = tagLatestDateMap.get(tag) || '';
                const itemDate = e.date || '';
                if (!existingDate || itemDate > existingDate) {
                    tagLatestDateMap.set(tag, itemDate);
                }
            });
        }
        const uniqueTags = Array.from(tagLatestDateMap.keys()).sort((a, b) => {
            const dateA = tagLatestDateMap.get(a) || '';
            const dateB = tagLatestDateMap.get(b) || '';
            if (dateA !== dateB) {
                return dateB.localeCompare(dateA); // latest date first
            }
            return a.localeCompare(b);
        });
        tagSel.innerHTML = '<option value="">All</option>' +
            uniqueTags.map(t => `<option value="${escHtml(t)}">${escHtml(t)}</option>`).join('');
        tagSel.value = currentTag;
    }

    updateClearFiltersBtnState();
}

