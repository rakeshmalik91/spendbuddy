import { state } from "../core/state.js";
import { $, $$ } from "../core/init.js";
import { toast, escHtml, formatDate } from "../utils/helpers.js";
import { saveYearCSV } from "./form.js";
import { renderAll } from "./render_all.js";
import { getFilteredExpenses } from "./filters.js";

/**
 * Set of selected transaction real indices in state.expenses.
 */
export const selectedTxnIndices = new Set();

let batchUpdateInitialized = false;

/**
 * Helper to compute and format summary of current values across selected transactions.
 */
function formatCurrentValues(selectedExpenses, extractor, isDate = false) {
    const rawValues = selectedExpenses.map(extractor).map(v => (v !== null && v !== undefined ? String(v).trim() : ''));
    const nonEmpties = rawValues.filter(Boolean);
    const distinct = Array.from(new Set(nonEmpties));

    if (nonEmpties.length === 0) {
        return { text: 'Current: (empty)', full: 'No value set' };
    }

    const hasEmpty = rawValues.some(v => !v);
    const formattedDistinct = isDate ? distinct.map(d => formatDate(d)) : distinct;

    if (formattedDistinct.length === 1 && !hasEmpty) {
        return { text: `Current: ${formattedDistinct[0]}`, full: formattedDistinct[0] };
    }

    const labelList = [...formattedDistinct];
    if (hasEmpty) labelList.push('(empty)');

    const summaryText = labelList.slice(0, 2).join(', ') + (labelList.length > 2 ? ` (+${labelList.length - 2} more)` : '');
    return { text: `Current: ${summaryText}`, full: labelList.join(', ') };
}

/**
 * Helper to get a common single value across selected transactions if identical and non-empty.
 */
function getSingleValue(selectedExpenses, extractor) {
    if (!selectedExpenses || selectedExpenses.length === 0) return null;
    const rawValues = selectedExpenses.map(extractor).map(v => (v !== null && v !== undefined ? String(v).trim() : ''));
    const first = rawValues[0];
    if (first && rawValues.every(v => v === first)) {
        return first;
    }
    return null;
}

/**
 * Synchronizes all table checkboxes, row selection classes, and day/month header states.
 */
export function syncTableCheckboxStates() {
    const filtered = (getFilteredExpenses && getFilteredExpenses()) || state.expenses || [];

    // Sync transaction row checkboxes
    document.querySelectorAll('#all-tbody .batch-select-checkbox[data-real-idx]').forEach(cb => {
        const idx = parseInt(cb.dataset.realIdx, 10);
        if (!isNaN(idx)) {
            const isSel = selectedTxnIndices.has(idx);
            cb.checked = isSel;
            const row = document.getElementById(`txn-row-${idx}`);
            if (row) row.classList.toggle('row-selected', isSel);
        }
    });

    // Sync day separator checkboxes
    document.querySelectorAll('#all-tbody .batch-select-day').forEach(cb => {
        const dateStr = cb.dataset.date;
        if (dateStr) {
            const dayItems = filtered.filter(e => e.date === dateStr);
            const dayIndices = dayItems.map(e => state.expenses.indexOf(e)).filter(i => i >= 0);
            const selCount = dayIndices.filter(i => selectedTxnIndices.has(i)).length;
            if (dayIndices.length > 0 && selCount === dayIndices.length) {
                cb.checked = true;
                cb.indeterminate = false;
            } else if (selCount > 0) {
                cb.checked = false;
                cb.indeterminate = true;
            } else {
                cb.checked = false;
                cb.indeterminate = false;
            }
        }
    });

    // Sync month header checkboxes
    document.querySelectorAll('#all-tbody .batch-select-month').forEach(cb => {
        const monthStr = cb.dataset.month;
        if (monthStr) {
            const monthItems = filtered.filter(e => e.date && e.date.startsWith(monthStr));
            const monthIndices = monthItems.map(e => state.expenses.indexOf(e)).filter(i => i >= 0);
            const selCount = monthIndices.filter(i => selectedTxnIndices.has(i)).length;
            if (monthIndices.length > 0 && selCount === monthIndices.length) {
                cb.checked = true;
                cb.indeterminate = false;
            } else if (selCount > 0) {
                cb.checked = false;
                cb.indeterminate = true;
            } else {
                cb.checked = false;
                cb.indeterminate = false;
            }
        }
    });

    updateBatchActionBar();
}

/**
 * Returns current set of selected indices.
 */
export function getSelectedTxnIndices() {
    return selectedTxnIndices;
}

/**
 * Clears all selections and updates UI elements.
 */
export function clearSelection() {
    selectedTxnIndices.clear();
    const selectAllCheckbox = $('#batch-select-all');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
    document.querySelectorAll('.batch-select-checkbox').forEach(cb => {
        cb.checked = false;
        cb.indeterminate = false;
    });
    document.querySelectorAll('#all-tbody tr.row-selected').forEach(tr => {
        tr.classList.remove('row-selected');
    });
    updateBatchActionBar();
}

/**
 * Toggles selection of an individual transaction row.
 */
export function toggleTxnSelection(realIdx, checked) {
    const idx = parseInt(realIdx, 10);
    if (isNaN(idx) || idx < 0 || idx >= state.expenses.length) return;

    if (checked) {
        selectedTxnIndices.add(idx);
    } else {
        selectedTxnIndices.delete(idx);
    }
    syncTableCheckboxStates();
}

/**
 * Toggles selection for all transactions on a specific day.
 */
export function toggleDaySelection(dateStr, checked) {
    if (!dateStr) return;
    const filtered = (getFilteredExpenses && getFilteredExpenses()) || state.expenses || [];
    const dayItems = filtered.filter(e => e.date === dateStr);
    dayItems.forEach(e => {
        const idx = state.expenses.indexOf(e);
        if (idx >= 0) {
            if (checked) {
                selectedTxnIndices.add(idx);
            } else {
                selectedTxnIndices.delete(idx);
            }
        }
    });
    syncTableCheckboxStates();
}

/**
 * Toggles selection for all transactions in a specific month (YYYY-MM).
 */
export function toggleMonthSelection(monthStr, checked) {
    if (!monthStr) return;
    const filtered = (getFilteredExpenses && getFilteredExpenses()) || state.expenses || [];
    const monthItems = filtered.filter(e => e.date && e.date.startsWith(monthStr));
    monthItems.forEach(e => {
        const idx = state.expenses.indexOf(e);
        if (idx >= 0) {
            if (checked) {
                selectedTxnIndices.add(idx);
            } else {
                selectedTxnIndices.delete(idx);
            }
        }
    });
    syncTableCheckboxStates();
}

/**
 * Toggles selection for all currently filtered transactions.
 */
export function toggleSelectAll(checked) {
    const filtered = (getFilteredExpenses && getFilteredExpenses()) || state.expenses || [];
    filtered.forEach(e => {
        const realIdx = state.expenses.indexOf(e);
        if (realIdx >= 0) {
            if (checked) {
                selectedTxnIndices.add(realIdx);
            } else {
                selectedTxnIndices.delete(realIdx);
            }
        }
    });

    syncTableCheckboxStates();
}

/**
 * Updates the floating/sticky batch action bar visibility and counts.
 */
export function updateBatchActionBar() {
    const bar = $('#batch-action-bar');
    const countBadge = $('#batch-selected-count');
    const selectAllCheckbox = $('#batch-select-all');

    const count = selectedTxnIndices.size;
    const filtered = (getFilteredExpenses && getFilteredExpenses()) || state.expenses || [];
    const filteredCount = filtered.length;

    if (selectAllCheckbox) {
        let selectedInFiltered = 0;
        filtered.forEach(e => {
            const idx = state.expenses.indexOf(e);
            if (idx >= 0 && selectedTxnIndices.has(idx)) selectedInFiltered++;
        });

        if (filteredCount > 0 && selectedInFiltered === filteredCount) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else if (selectedInFiltered > 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
    }

    if (!bar) return;

    if (count > 0) {
        bar.classList.add('show');
        if (countBadge) {
            countBadge.textContent = `${count} selected`;
        }
    } else {
        bar.classList.remove('show');
    }
}

/**
 * Opens the Batch Update modal and populates dropdown/suggestion options.
 */
export function openBatchUpdateModal() {
    const count = selectedTxnIndices.size;
    if (count === 0) {
        toast('Please select at least one transaction to batch update.', 'info');
        return;
    }

    const modal = $('#modal-batch-update');
    const overlay = $('#modal-batch-update-overlay');
    if (!modal || !overlay) return;

    // Reset all checkboxes & inputs
    ['category', 'txn-mode', 'txn-type', 'date', 'location', 'tag'].forEach(field => {
        const toggle = $(`#batch-enable-${field}`);
        const input = $(`#batch-input-${field}`);
        if (toggle) toggle.checked = false;
        if (input) {
            input.disabled = true;
            if (input.tagName === 'SELECT') {
                input.selectedIndex = 0;
            } else {
                input.value = '';
            }
        }
    });

    // Populate current values indicator across selected transactions
    const selectedExpenses = Array.from(selectedTxnIndices).map(idx => state.expenses[idx]).filter(Boolean);
    const currentConfigs = [
        { field: 'category', fn: e => e.category },
        { field: 'txn-mode', fn: e => e.txnMode },
        { field: 'txn-type', fn: e => e.txnType || (e.amount < 0 ? 'Refund' : 'Expense') },
        { field: 'date', fn: e => e.date, isDate: true },
        { field: 'location', fn: e => e.location },
        { field: 'tag', fn: e => e.tag }
    ];

    currentConfigs.forEach(({ field, fn, isDate }) => {
        const curSpan = $(`#batch-current-${field}`);
        if (curSpan) {
            const summary = formatCurrentValues(selectedExpenses, fn, isDate);
            curSpan.textContent = summary.text;
            curSpan.title = summary.full;
        }
    });

    // Populate category dropdown
    const catSelect = $('#batch-input-category');
    if (catSelect) {
        const distinctCategories = Array.from(new Set([
            ...(state.categories || []),
            ...state.expenses.map(e => e.category).filter(Boolean)
        ])).sort();

        catSelect.innerHTML = distinctCategories.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
    }

    // Populate transaction mode dropdown
    const modeSelect = $('#batch-input-txn-mode');
    if (modeSelect) {
        const distinctModes = Array.from(new Set([
            ...(state.txnModes || ['UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'Cash']),
            ...state.expenses.map(e => e.txnMode).filter(Boolean)
        ])).sort();

        modeSelect.innerHTML = distinctModes.map(m => `<option value="${escHtml(m)}">${escHtml(m)}</option>`).join('');
    }

    // Populate location suggestions
    const locSuggestions = $('#batch-location-suggestions');
    if (locSuggestions) {
        const locCounts = {};
        state.expenses.forEach(e => {
            const l = (e.location || '').trim();
            if (l) locCounts[l] = (locCounts[l] || 0) + 1;
        });
        const topLocs = Object.keys(locCounts).sort((a, b) => locCounts[b] - locCounts[a]).slice(0, 5);
        if (topLocs.length > 0) {
            locSuggestions.style.display = '';
            locSuggestions.innerHTML = topLocs.map(l => `<div class="chip" data-value="${escHtml(l)}">📍 ${escHtml(l)}</div>`).join('');
            locSuggestions.querySelectorAll('.chip').forEach(chip => {
                chip.onclick = () => {
                    const locInput = $('#batch-input-location');
                    const enableLoc = $('#batch-enable-location');
                    if (enableLoc && !enableLoc.checked) {
                        enableLoc.checked = true;
                        if (locInput) locInput.disabled = false;
                    }
                    if (locInput) {
                        locInput.value = chip.dataset.value;
                        locInput.focus();
                    }
                };
            });
        } else {
            locSuggestions.style.display = 'none';
        }
    }

    // Populate tag suggestions
    const tagSuggestions = $('#batch-tag-suggestions');
    if (tagSuggestions) {
        const tagCounts = {};
        state.expenses.forEach(e => {
            const t = (e.tag || '').trim();
            if (t) tagCounts[t] = (tagCounts[t] || 0) + 1;
        });
        const topTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]).slice(0, 5);
        if (topTags.length > 0) {
            tagSuggestions.style.display = '';
            tagSuggestions.innerHTML = topTags.map(t => `<div class="chip note-chip" data-value="${escHtml(t)}">🏷️ ${escHtml(t)}</div>`).join('');
            tagSuggestions.querySelectorAll('.chip').forEach(chip => {
                chip.onclick = () => {
                    const tagInput = $('#batch-input-tag');
                    const enableTag = $('#batch-enable-tag');
                    if (enableTag && !enableTag.checked) {
                        enableTag.checked = true;
                        if (tagInput) tagInput.disabled = false;
                    }
                    if (tagInput) {
                        tagInput.value = chip.dataset.value;
                        tagInput.focus();
                    }
                };
            });
        } else {
            tagSuggestions.style.display = 'none';
        }
    }

    // Prefill inputs if single value exists across all selected transactions
    const singleCategory = getSingleValue(selectedExpenses, e => e.category);
    if (singleCategory && catSelect) catSelect.value = singleCategory;

    const singleMode = getSingleValue(selectedExpenses, e => e.txnMode);
    if (singleMode && modeSelect) modeSelect.value = singleMode;

    const singleType = getSingleValue(selectedExpenses, e => e.txnType || (e.amount < 0 ? 'Refund' : 'Expense'));
    const typeSelect = $('#batch-input-txn-type');
    if (singleType && typeSelect) typeSelect.value = singleType;

    const singleDate = getSingleValue(selectedExpenses, e => e.date);
    const dateInput = $('#batch-input-date');
    if (singleDate && dateInput) dateInput.value = singleDate;

    const singleLocation = getSingleValue(selectedExpenses, e => e.location);
    const locInput = $('#batch-input-location');
    if (singleLocation && locInput) locInput.value = singleLocation;

    const singleTag = getSingleValue(selectedExpenses, e => e.tag);
    const tagInput = $('#batch-input-tag');
    if (singleTag && tagInput) tagInput.value = singleTag;

    // Update modal submit button text
    const submitBtn = $('#btn-batch-apply');
    if (submitBtn) {
        submitBtn.textContent = `Apply to ${count} Transaction${count > 1 ? 's' : ''}`;
        submitBtn.disabled = false;
    }

    overlay.classList.add('open');
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
}

/**
 * Closes the Batch Update modal.
 */
export function closeBatchUpdateModal() {
    const overlay = $('#modal-batch-update-overlay');
    if (overlay) {
        overlay.classList.remove('open');
    }
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
}

/**
 * Applies batch update changes to selected transactions.
 */
export async function applyBatchUpdate() {
    const updateCategory = $('#batch-enable-category')?.checked;
    const updateTxnMode = $('#batch-enable-txn-mode')?.checked;
    const updateTxnType = $('#batch-enable-txn-type')?.checked;
    const updateDate = $('#batch-enable-date')?.checked;
    const updateLocation = $('#batch-enable-location')?.checked;
    const updateTag = $('#batch-enable-tag')?.checked;

    if (!updateCategory && !updateTxnMode && !updateTxnType && !updateDate && !updateLocation && !updateTag) {
        toast('Please check at least one field to update.', 'error');
        return;
    }

    const newCategory = $('#batch-input-category')?.value || '';
    const newTxnMode = $('#batch-input-txn-mode')?.value || '';
    const newTxnType = $('#batch-input-txn-type')?.value || '';
    const newDate = $('#batch-input-date')?.value || '';
    const newLocation = $('#batch-input-location')?.value.trim() || '';
    const newTag = $('#batch-input-tag')?.value.trim() || '';

    if (updateDate && !newDate) {
        toast('Please select a valid date.', 'error');
        return;
    }

    const submitBtn = $('#btn-batch-apply');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
    }

    const affectedYears = new Set();
    const indices = Array.from(selectedTxnIndices).filter(idx => idx >= 0 && idx < state.expenses.length);

    const beforeByTxn = new Map();
    indices.forEach(idx => {
        const e = state.expenses[idx];
        if (!e) return;
        beforeByTxn.set(e, { ...e });

        if (e.date) {
            affectedYears.add(e.date.split('-')[0]);
        }

        if (updateCategory) e.category = newCategory;
        if (updateTxnMode) e.txnMode = newTxnMode;
        if (updateLocation) e.location = newLocation;
        if (updateTag) e.tag = newTag;

        if (updateDate) {
            e.date = newDate;
            affectedYears.add(newDate.split('-')[0]);
        }

        if (updateTxnType) {
            e.txnType = newTxnType;
            let absAmt = Math.abs(e.amount);
            if (newTxnType === 'Income' || newTxnType === 'Refund') {
                e.amount = -absAmt;
            } else {
                e.amount = absAmt;
            }
        }
    });

    // Re-sort expenses descending by date
    state.expenses.sort((a, b) => new Date(b.date) - new Date(a.date));

    toast('Saving batch updates to cloud...', 'info');
    try {
        for (const yr of affectedYears) {
            await saveYearCSV(yr);
        }
        const { recordActivity } = await import("../services/activity.js");
        for (const [txn, before] of beforeByTxn) {
            const changes = {};
            for (const field of ['amount', 'note', 'date', 'category', 'txnType', 'txnMode', 'txnId', 'location', 'tag', 'currency']) {
                if (before[field] !== txn[field]) changes[field] = { from: before[field], to: txn[field] };
            }
            await recordActivity({ action: 'updated', type: 'txn', source: txn.source || 'manual', txn, changes });
        }
        toast(`Successfully updated ${indices.length} transaction${indices.length > 1 ? 's' : ''}!`, 'success');
        clearSelection();
        closeBatchUpdateModal();
        renderAll();
    } catch (err) {
        console.error('Batch update save error:', err);
        toast('Error saving batch updates to cloud', 'error');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = `Apply to ${indices.length} Transactions`;
        }
    }
}

/**
 * Initializes batch update event listeners and modal toggle hooks.
 */
export function initBatchUpdate() {
    if (batchUpdateInitialized) return;
    batchUpdateInitialized = true;

    // Connect global window handlers for inline table HTML
    window.toggleTxnSelection = toggleTxnSelection;
    window.toggleDaySelection = toggleDaySelection;
    window.toggleMonthSelection = toggleMonthSelection;
    window.toggleSelectAll = toggleSelectAll;
    window.clearBatchSelection = clearSelection;
    window.openBatchUpdateModal = openBatchUpdateModal;
    window.closeBatchUpdateModal = closeBatchUpdateModal;
    window.applyBatchUpdate = applyBatchUpdate;

    // Field toggle listeners to enable/disable corresponding input
    ['category', 'txn-mode', 'txn-type', 'date', 'location', 'tag'].forEach(field => {
        const toggle = $(`#batch-enable-${field}`);
        const input = $(`#batch-input-${field}`);
        if (toggle && input) {
            toggle.addEventListener('change', () => {
                input.disabled = !toggle.checked;
                if (toggle.checked) {
                    input.focus();
                }
            });
        }
    });

    // Modal close buttons
    const btnCancel = $('#btn-batch-cancel');
    const overlay = $('#modal-batch-update-overlay');
    if (btnCancel) btnCancel.addEventListener('click', closeBatchUpdateModal);
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeBatchUpdateModal();
        });
    }

    // Modal submit button
    const btnApply = $('#btn-batch-apply');
    if (btnApply) btnApply.addEventListener('click', applyBatchUpdate);
}
