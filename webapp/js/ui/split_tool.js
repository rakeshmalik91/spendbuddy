import { state } from "../core/state.js";
import { $, $$, showLoader, hideLoader } from "../core/init.js";
import { toast, escHtml, getLocalDateString, formatDate } from "../utils/helpers.js";
import { openModal } from "./modal.js";
import { loadSplitBills, saveSplitBills, getKnownPeople, calculateSplit, addOrUpdateSplitBill, deleteSplitBill, roundAmount } from "../services/split_service.js";

let activeBill = null;
let isInitialized = false;

/**
 * Initializes listeners for Split Tool controls.
 */
export function initSplitTool() {
    if (isInitialized) return;
    isInitialized = true;

    $('#btn-create-split')?.addEventListener('click', () => {
        openSplitEditor(null);
    });

    $('#split-btn-cancel')?.addEventListener('click', () => {
        closeSplitEditor();
    });

    $('#split-btn-save')?.addEventListener('click', () => {
        saveCurrentSplit();
    });

    // Split method toggle
    $$('.split-method-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (!activeBill) return;
            const method = tab.dataset.method;
            activeBill.splitMethod = method;
            $$('.split-method-tab').forEach(t => t.classList.toggle('active', t.dataset.method === method));
            recalculateAndRenderParticipants();
        });
    });

    // Tax split method toggle
    $$('.tax-method-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (!activeBill) return;
            const method = tab.dataset.taxMethod;
            activeBill.taxSplitMethod = method;
            $$('.tax-method-tab').forEach(t => t.classList.toggle('active', t.dataset.taxMethod === method));
            recalculateAndRenderParticipants();
        });
    });

    // Bill Total & Tax inputs live updates
    $('#split-input-total')?.addEventListener('input', (e) => {
        if (!activeBill) return;
        activeBill.totalAmountExpr = e.target.value;
        recalculateAndRenderParticipants();
    });

    $('#split-input-tax')?.addEventListener('input', (e) => {
        if (!activeBill) return;
        activeBill.taxExpr = e.target.value;
        recalculateAndRenderParticipants();
    });

    // Add new person button
    $('#btn-add-split-person')?.addEventListener('click', () => {
        addNewPerson();
    });

    $('#split-input-new-person')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addNewPerson();
        }
    });
}

/**
 * Main render function for the Split Tool view.
 */
export async function renderSplitTool() {
    initSplitTool();

    // Ensure data is loaded
    await loadSplitBills();

    renderSplitStats();
    renderSplitHistory();

    if (activeBill) {
        renderSplitEditor();
    } else {
        const editorCard = $('#split-editor-card');
        if (editorCard) editorCard.style.display = 'none';
    }
}

/**
 * Renders summary metrics for bills.
 */
function renderSplitStats() {
    const bills = state.splitBills || [];
    const totalCount = bills.length;
    const totalVolume = bills.reduce((sum, b) => sum + (Number(b.grandTotal) || Number(b.totalAmount) || 0), 0);
    const uniquePeople = getKnownPeople().length;

    const countEl = $('#split-stat-count');
    const volumeEl = $('#split-stat-volume');
    const peopleEl = $('#split-stat-people');

    if (countEl) countEl.textContent = totalCount.toString();
    if (volumeEl) volumeEl.textContent = `₹${Math.round(totalVolume).toLocaleString('en-IN')}`;
    if (peopleEl) peopleEl.textContent = uniquePeople.toString();
}

/**
 * Renders the history list of saved split bills.
 */
function renderSplitHistory() {
    const listContainer = $('#split-history-list');
    const emptyState = $('#split-empty-state');
    if (!listContainer) return;

    const bills = state.splitBills || [];
    if (bills.length === 0) {
        listContainer.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    listContainer.innerHTML = bills.map((b) => {
        const grandTotal = b.grandTotal || (b.totalAmount + (b.taxAmount || 0));
        const participants = b.participants || [];
        const dateStr = b.date ? formatDate(b.date) : 'Recently';
        const methodBadge = b.splitMethod === 'expression' 
            ? '<span class="badge-tag" style="background: rgba(167, 139, 250, 0.15); border: 1px solid rgba(167, 139, 250, 0.3); color: var(--purple);">Custom Expr</span>' 
            : '<span class="badge-tag" style="background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); color: var(--accent);">Equal Split</span>';
        
        const taxBadge = b.taxAmount > 0 
            ? `<span class="badge-tag" style="background: rgba(234, 179, 8, 0.12); border: 1px solid rgba(234, 179, 8, 0.3); color: var(--yellow);">Tax: ₹${roundAmount(b.taxAmount)} (${b.taxSplitMethod === 'equal' ? 'Equal' : 'Proportional'})</span>` 
            : '';

        const peopleRows = participants.map(p => {
            const isPaidBadge = p.isPaid 
                ? '<span style="color: var(--green); font-size: 0.78rem; font-weight: 600;">✓ Paid</span>' 
                : '<span style="color: var(--yellow); font-size: 0.78rem; font-weight: 500;">Pending</span>';
            return `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.04); font-size: 0.88rem;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-weight: 500; color: var(--text-main);">${escHtml(p.name)}</span>
                        ${isPaidBadge}
                    </div>
                    <div style="text-align: right;">
                        <span style="font-weight: 700; color: var(--text-primary);">₹${roundAmount(p.endAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        ${p.taxAmount > 0 ? `<span style="font-size: 0.75rem; color: var(--text-muted); display: block;">(Base: ₹${roundAmount(p.baseAmount)} + Tax: ₹${roundAmount(p.taxAmount)})</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="card split-bill-card" style="margin-bottom: 16px; padding: 18px 20px; transition: transform 0.2s, box-shadow 0.2s;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                            <h3 style="font-size: 1.15rem; font-weight: 700; margin: 0; color: var(--text-main);">${escHtml(b.title || 'Untitled Split Bill')}</h3>
                            ${methodBadge}
                            ${taxBadge}
                        </div>
                        <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">
                            <span>📅 ${dateStr}</span> &bull; <span>${participants.length} participant${participants.length === 1 ? '' : 's'}</span>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 1.3rem; font-weight: 800; color: var(--accent);">
                            ₹${roundAmount(grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                        <div style="font-size: 0.78rem; color: var(--text-dim);">Total with Tax</div>
                    </div>
                </div>

                <div class="split-participants-summary" style="background: rgba(0, 0, 0, 0.2); border-radius: 8px; padding: 8px 14px; margin-bottom: 14px;">
                    ${peopleRows}
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <button type="button" class="btn btn-sm btn-ghost" onclick="window.copySplitBreakdown('${b.id}')" title="Copy breakdown to clipboard" style="padding: 6px 12px; font-size: 0.82rem;">
                        📋 Copy Text
                    </button>
                    <div style="display: flex; gap: 8px;">
                        <button type="button" class="btn btn-sm btn-secondary" onclick="window.editSplitBill('${b.id}')" style="padding: 6px 14px; font-size: 0.85rem;">
                            ✏️ Edit
                        </button>
                        <button type="button" class="btn btn-sm btn-ghost" onclick="window.confirmDeleteSplitBill('${b.id}')" style="color: var(--red); padding: 6px 12px; font-size: 0.85rem;">
                            🗑️ Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Opens editor for creating or modifying a bill.
 * @param {string|null} billId
 */
export function openSplitEditor(billId = null) {
    if (billId) {
        const existing = (state.splitBills || []).find(b => b.id === billId);
        if (existing) {
            activeBill = JSON.parse(JSON.stringify(existing));
        } else {
            activeBill = createDefaultBill();
        }
    } else {
        activeBill = createDefaultBill();
    }

    renderSplitEditor();
    const editorCard = $('#split-editor-card');
    if (editorCard) {
        editorCard.style.display = 'block';
        editorCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/**
 * Closes the bill editor.
 */
export function closeSplitEditor() {
    activeBill = null;
    const editorCard = $('#split-editor-card');
    if (editorCard) editorCard.style.display = 'none';
}

function createDefaultBill() {
    return {
        id: null,
        title: '',
        date: getLocalDateString(),
        totalAmount: 0,
        totalAmountExpr: '',
        taxExpr: '',
        taxAmount: 0,
        splitMethod: 'equal',
        taxSplitMethod: 'percentage',
        participants: [
            { id: 'p_' + Date.now(), name: 'You', expression: '', baseAmount: 0, taxExpression: '', taxAmount: 0, endAmount: 0, isPaid: false }
        ]
    };
}

/**
 * Renders the builder form when activeBill is present.
 */
function renderSplitEditor() {
    if (!activeBill) return;

    const editorCard = $('#split-editor-card');
    if (!editorCard) return;
    editorCard.style.display = 'block';

    const titleInput = $('#split-input-title');
    const dateInput = $('#split-input-date');
    const totalInput = $('#split-input-total');
    const taxInput = $('#split-input-tax');

    if (titleInput) titleInput.value = activeBill.title || '';
    if (dateInput) dateInput.value = activeBill.date || getLocalDateString();
    if (totalInput) totalInput.value = activeBill.totalAmountExpr || (activeBill.totalAmount ? String(activeBill.totalAmount) : '');
    if (taxInput) taxInput.value = activeBill.taxExpr || '';

    // Set active tab buttons
    $$('.split-method-tab').forEach(t => t.classList.toggle('active', t.dataset.method === (activeBill.splitMethod || 'equal')));
    $$('.tax-method-tab').forEach(t => t.classList.toggle('active', t.dataset.taxMethod === (activeBill.taxSplitMethod || 'percentage')));

    renderPersonReuseChips();
    recalculateAndRenderParticipants();
}

/**
 * Renders quick reuse chips of past participant names.
 */
function renderPersonReuseChips() {
    const container = $('#split-people-reuse-container');
    if (!container) return;

    const knownPeople = getKnownPeople();
    const currentNames = new Set((activeBill?.participants || []).map(p => (p.name || '').trim().toLowerCase()));
    const candidates = knownPeople.filter(name => !currentNames.has(name.toLowerCase()));

    if (candidates.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    container.style.display = 'flex';
    container.innerHTML = `
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 6px; width: 100%;">
            Reuse People from previous bills:
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${candidates.map(name => `
                <button type="button" class="chip" onclick="window.addKnownPersonToSplit('${escHtml(name)}')" style="font-size: 0.8rem; padding: 4px 10px;">
                    + ${escHtml(name)}
                </button>
            `).join('')}
        </div>
    `;
}

/**
 * Adds a person from quick reuse chips.
 */
export function addKnownPersonToSplit(name) {
    if (!activeBill || !name) return;
    if (!Array.isArray(activeBill.participants)) activeBill.participants = [];
    activeBill.participants.push({
        id: 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        name: name.trim(),
        expression: '',
        baseAmount: 0,
        taxExpression: '',
        taxAmount: 0,
        endAmount: 0,
        isPaid: false
    });
    renderPersonReuseChips();
    recalculateAndRenderParticipants();
}

/**
 * Adds a new person via manual input field.
 */
function addNewPerson() {
    const input = $('#split-input-new-person');
    if (!input || !activeBill) return;
    const name = input.value.trim();
    if (!name) {
        toast('Please enter a person name', 'warning');
        input.focus();
        return;
    }

    addKnownPersonToSplit(name);
    input.value = '';
    input.focus();
}

/**
 * Recalculates split and renders participant rows and balance indicators.
 */
function recalculateAndRenderParticipants() {
    if (!activeBill) return;

    // Rebuilding the participant table on every keystroke replaces the focused
    // expression input. Preserve its identity and caret so typing remains continuous.
    const focused = document.activeElement;
    const focusState = focused?.classList?.contains('split-person-expr')
        ? {
            idx: focused.dataset.idx,
            start: focused.selectionStart,
            end: focused.selectionEnd,
            direction: focused.selectionDirection
        }
        : null;

    const calc = calculateSplit(activeBill);
    activeBill = calc;

    const tableBody = $('#split-participants-tbody');
    if (!tableBody) return;

    const isExpressionSplit = activeBill.splitMethod === 'expression';

    tableBody.innerHTML = (activeBill.participants || []).map((p, idx) => {
        return `
            <tr data-person-idx="${idx}">
                <td data-label="Person" style="padding: 8px 6px;">
                    <input type="text" class="form-control split-person-name" data-idx="${idx}" value="${escHtml(p.name)}" placeholder="Person Name" style="width: 100%; min-width: 100px; padding: 6px 10px; font-size: 0.9rem;" />
                </td>
                <td data-label="Base Share" style="padding: 8px 6px;">
                    <div style="position: relative;">
                        <input type="text" class="form-control split-person-expr" data-idx="${idx}" value="${escHtml(p.expression || '')}" ${!isExpressionSplit ? 'readonly' : ''} placeholder="${isExpressionSplit ? 'e.g. 250+50' : 'Equal'}" style="width: 100%; min-width: 110px; padding: 6px 10px; font-size: 0.9rem; ${!isExpressionSplit ? 'background: rgba(255,255,255,0.03); color: var(--text-dim);' : ''}" />
                        ${isExpressionSplit ? `<div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">= ₹${roundAmount(p.baseAmount)}</div>` : ''}
                    </div>
                </td>
                <td data-label="Tax Share" style="padding: 8px 6px; text-align: right; font-size: 0.88rem; color: var(--yellow);">
                    ₹${roundAmount(p.taxAmount)}
                </td>
                <td data-label="Total" style="padding: 8px 6px; text-align: right;">
                    <span style="font-weight: 700; color: var(--accent); font-size: 1rem;">₹${roundAmount(p.endAmount)}</span>
                </td>
                <td data-label="Paid" style="padding: 8px 6px; text-align: center;">
                    <input type="checkbox" class="split-person-paid" data-idx="${idx}" ${p.isPaid ? 'checked' : ''} title="Mark Paid" style="width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer;" />
                </td>
                <td data-label="Remove" style="padding: 8px 4px; text-align: right;">
                    <button type="button" class="btn btn-sm btn-ghost" onclick="window.removePersonFromSplit(${idx})" title="Remove person" style="color: var(--text-muted); padding: 4px 6px; line-height: 1;">&times;</button>
                </td>
            </tr>
        `;
    }).join('');

    // Attach listeners for live input inside participant rows
    tableBody.querySelectorAll('.split-person-name').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            if (activeBill.participants[idx]) {
                activeBill.participants[idx].name = e.target.value;
            }
        });
    });

    tableBody.querySelectorAll('.split-person-expr').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            if (activeBill.participants[idx]) {
                activeBill.participants[idx].expression = e.target.value;
                recalculateAndRenderParticipants();
            }
        });
    });

    tableBody.querySelectorAll('.split-person-paid').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            if (activeBill.participants[idx]) {
                activeBill.participants[idx].isPaid = e.target.checked;
            }
        });
    });

    // Restore focus/caret after the table refresh triggered by expression input.
    if (focusState) {
        const replacement = tableBody.querySelector(`.split-person-expr[data-idx="${focusState.idx}"]`);
        if (replacement) {
            replacement.focus({ preventScroll: true });
            if (focusState.start !== null && focusState.end !== null) {
                replacement.setSelectionRange(focusState.start, focusState.end, focusState.direction || 'none');
            }
        }
    }

    // Update Balance Summary Bar
    updateAllocationSummaryBar();
}

/**
 * Updates allocation balance progress indicator.
 */
function updateAllocationSummaryBar() {
    if (!activeBill) return;

    const baseTotal = Number(activeBill.totalAmount) || 0;
    const allocated = Number(activeBill.allocatedBase) || 0;
    const remainingExclusive = roundAmount(baseTotal - allocated);
    const taxTotal = Number(activeBill.taxAmount) || 0;
    const allocatedTax = roundAmount((activeBill.participants || []).reduce((sum, p) => sum + (Number(p.taxAmount) || 0), 0));
    const remainingTax = roundAmount(taxTotal - allocatedTax);
    const grandTotal = roundAmount(baseTotal + taxTotal);
    const remainingInclusive = roundAmount(remainingExclusive + remainingTax);

    const indicator = $('#split-balance-indicator');
    if (!indicator) return;

    const isBalanced = Math.abs(remainingExclusive) < 0.05 && Math.abs(remainingTax) < 0.05;
    const color = isBalanced ? 'var(--green)' : (remainingExclusive > 0 ? 'var(--yellow)' : 'var(--red)');
    const statusText = activeBill.splitMethod === 'equal'
        ? `✓ Equal Split Active (${activeBill.participants.length} people)`
        : (isBalanced
            ? '✓ Perfectly Balanced'
            : (remainingExclusive >= 0
                ? 'Remaining to allocate'
                : 'Overallocated'));

    indicator.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%; font-size: 0.9rem; flex-wrap: wrap; gap: 8px;">
            <span style="color: ${color}; font-weight: 600;">${statusText}</span>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                <span style="color: var(--text-muted);">Remaining (excl. tax): <strong>₹${remainingExclusive}</strong></span>
                <span style="color: var(--text-muted);">Remaining (incl. tax): <strong>₹${remainingInclusive}</strong></span>
                <span style="color: var(--text-muted);">Tax remaining: <strong>₹${remainingTax}</strong></span>
                <span style="color: var(--accent); font-weight: 800;">Total Bill (incl. tax): ₹${grandTotal}</span>
            </div>
        </div>
    `;
}

/**
 * Removes a person by index from current bill.
 * @param {number} idx
 */
export function removePersonFromSplit(idx) {
    if (!activeBill || !Array.isArray(activeBill.participants)) return;
    activeBill.participants.splice(idx, 1);
    renderPersonReuseChips();
    recalculateAndRenderParticipants();
}

/**
 * Validates and saves the current bill to split_bills.json.
 */
async function saveCurrentSplit() {
    if (!activeBill) return;

    const titleInput = $('#split-input-title');
    const dateInput = $('#split-input-date');
    const totalInput = $('#split-input-total');
    const taxInput = $('#split-input-tax');

    activeBill.title = (titleInput?.value || '').trim() || 'Split Bill';
    activeBill.date = dateInput?.value || getLocalDateString();
    activeBill.totalAmountExpr = (totalInput?.value || '').trim();
    activeBill.taxExpr = (taxInput?.value || '').trim();

    if (!activeBill.participants || activeBill.participants.length === 0) {
        toast('Please add at least one participant', 'warning');
        return;
    }

    // Name validation
    const unnamed = activeBill.participants.some(p => !p.name || !p.name.trim());
    if (unnamed) {
        toast('Please provide a name for all participants', 'warning');
        return;
    }

    showLoader('Saving Split Bill...');
    try {
        await addOrUpdateSplitBill(activeBill);
        toast(`Split bill "${activeBill.title}" saved!`, 'success');
        closeSplitEditor();
        renderSplitStats();
        renderSplitHistory();
    } catch (err) {
        console.error('Error saving split bill:', err);
        toast('Saved locally (cloud sync error)', 'warning');
        closeSplitEditor();
        renderSplitStats();
        renderSplitHistory();
    } finally {
        hideLoader();
    }
}

/**
 * Prompts user and deletes a split bill.
 * @param {string} billId
 */
export function confirmDeleteSplitBill(billId) {
    const bill = (state.splitBills || []).find(b => b.id === billId);
    if (!bill) return;

    openModal({
        title: 'Delete Split Bill',
        message: `Are you sure you want to delete "${bill.title || 'this bill'}"?`,
        confirmLabel: 'Delete',
        confirmClass: 'btn-danger',
        onConfirm: async () => {
            showLoader('Deleting bill...');
            await deleteSplitBill(billId);
            hideLoader();
            toast('Split bill deleted', 'info');
            renderSplitStats();
            renderSplitHistory();
        }
    });
}

/**
 * Copies formatted text breakdown of bill to clipboard.
 * @param {string} billId
 */
export function copySplitBreakdown(billId) {
    const bill = (state.splitBills || []).find(b => b.id === billId);
    if (!bill) return;

    const lines = [];
    lines.push(`🧾 Split Bill: ${bill.title || 'Untitled Bill'}`);
    lines.push(`📅 Date: ${bill.date || 'N/A'}`);
    lines.push(`💵 Total Bill (tax inclusive): ₹${bill.grandTotal || (bill.totalAmount + (bill.taxAmount || 0))} | Base (tax exclusive): ₹${bill.totalAmount} | Tax: ₹${bill.taxAmount || 0}`);
    lines.push(`----------------------------------`);
    (bill.participants || []).forEach(p => {
        lines.push(`• ${p.name}: ₹${roundAmount(p.endAmount)} ${p.taxAmount > 0 ? `(Base: ₹${p.baseAmount} + Tax: ₹${p.taxAmount})` : ''} [${p.isPaid ? 'PAID' : 'PENDING'}]`);
    });
    lines.push(`----------------------------------`);
    lines.push(`Generated by SpendBuddy Split Tool`);

    const text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            toast('Breakdown copied to clipboard!', 'success');
        }).catch(() => {
            prompt('Copy text:', text);
        });
    } else {
        prompt('Copy text:', text);
    }
}

// Window global bindings for inline handlers
window.openSplitEditor = openSplitEditor;
window.closeSplitEditor = closeSplitEditor;
window.editSplitBill = openSplitEditor;
window.confirmDeleteSplitBill = confirmDeleteSplitBill;
window.copySplitBreakdown = copySplitBreakdown;
window.addKnownPersonToSplit = addKnownPersonToSplit;
window.removePersonFromSplit = removePersonFromSplit;
window.renderSplitTool = renderSplitTool;
