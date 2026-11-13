import { state } from "../core/state.js";
import { parseLocalDate, getLocalDateString, formatDate, escHtml } from "../utils/date_helpers.js";
import { amountToStr } from "../services/storage.js";
import { toast, getCurrentLocationTag } from "../utils/helpers.js";
import { renderAll } from "./render_all.js";
import { showLoader, hideLoader } from "../core/init.js";
import { saveYearCSV } from "./form.js";
import { saveScheduledCSV } from "../services/storage.js";

/**
 * Checks whether an entry date falls within the last 3 days relative to a reference date.
 * Last 3 days: 0, 1, 2, or 3 days ago.
 *
 * @param {string} dateStr - The entry date YYYY-MM-DD
 * @param {string} referenceDateStr - The reference date YYYY-MM-DD (defaults to local today)
 * @returns {boolean}
 */
export function isWithinLast3Days(dateStr, referenceDateStr = getLocalDateString()) {
    if (!dateStr) return false;
    const d1 = parseLocalDate(dateStr.slice(0, 10));
    const d2 = parseLocalDate(referenceDateStr.slice(0, 10));
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
    const diffMs = d2.getTime() - d1.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 3;
}

/** Returns true when the scheduled approval modal is currently visible. */
export function isScheduledModalOpen() {
    if (typeof document === 'undefined') return false;
    const overlay = document.getElementById('scheduled-modal-overlay');
    if (!overlay) return false;
    const isFlex = overlay.style && overlay.style.display === 'flex';
    const hasClass = typeof overlay.classList?.contains === 'function'
        ? overlay.classList.contains('open')
        : (typeof overlay.className === 'string' && overlay.className.includes('open'));
    return !!(isFlex || hasClass);
}

/** Close the scheduled transactions approval modal. */
export function closeScheduledModal() {
    const overlay = document.getElementById('scheduled-modal-overlay');
    if (overlay) {
        overlay.style.display = 'none';
        overlay.classList.remove('open');
    }
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
}

// Active snapshot of pending items & simulation data for modal operations
let modalCandidates = [];
let modalSimulation = [];

/**
 * Commits approved transactions into state.expenses and advances the schedules.
 * Used for both silent additions and user approval actions.
 *
 * @param {Object} params
 * @param {Array} params.approvedCandidates - Transactions to insert into state.expenses
 * @param {Array} params.simulationData - Schedules and their updated states
 * @returns {Promise<boolean>}
 */
export async function executeScheduledCommit({ approvedCandidates = [], simulationData = [] }) {
    const modifiedYears = new Set();
    const committedEntries = [];
    const scheduledSnapshot = JSON.parse(JSON.stringify(state.scheduledTransactions));
    const expensesSnapshot = [...state.expenses];

    // 1. Add approved candidates to state.expenses
    if (approvedCandidates && approvedCandidates.length > 0) {
        for (const item of approvedCandidates) {
            const committedEntry = {
                date: item.date,
                amount: item.amount,
                amountExpression: item.amountExpression || '',
                currency: item.currency || 'INR',
                category: item.category,
                txnType: item.txnType,
                txnMode: item.txnMode,
                note: item.note,
                source: item.source || 'Schedule',
                txnId: item.txnId,
                location: item.location || '',
                tag: item.tag || ''
            };
            state.expenses.unshift(committedEntry);
            committedEntries.push(committedEntry);
            modifiedYears.add(item.date.slice(0, 4));
        }
        state.expenses.sort((a, b) => b.date.localeCompare(a.date));
    }

    // 2. Advance schedules in simulationData
    let modifiedScheduled = false;
    if (simulationData && simulationData.length > 0) {
        for (const sim of simulationData) {
            const st = state.scheduledTransactions.find(s => s.id === sim.scheduleId);
            if (!st) continue;
            if (sim.isOneOff) {
                const idx = state.scheduledTransactions.indexOf(st);
                if (idx > -1) {
                    state.scheduledTransactions.splice(idx, 1);
                    modifiedScheduled = true;
                }
            } else {
                st.next_run_date = sim.finalNextRunDate;
                st.last_run_date = sim.finalLastRunDate;
                st.run_count = sim.finalRunCount;
                if (sim.finalDisabled !== undefined) {
                    st.disabled = sim.finalDisabled;
                }
                modifiedScheduled = true;
            }
        }
    }

    // 3. Save modified year CSVs
    if (modifiedYears.size > 0) {
        try {
            for (const year of modifiedYears) {
                await saveYearCSV(year);
            }
        } catch (e) {
            // Revert state in memory on conflict or error
            state.scheduledTransactions = scheduledSnapshot;
            state.expenses = expensesSnapshot;
            throw e;
        }
    }

    // Record generated transactions after their year files have committed.
    // A later schedule-save failure must not erase the audit event for a
    // transaction that has already been persisted successfully.
    if (committedEntries.length > 0) {
        const { recordActivity } = await import("../services/activity.js");
        for (const committed of committedEntries) {
            await recordActivity({ action: 'added', type: 'txn', source: committed.source || 'Schedule', txn: committed });
        }
    }

    // 4. Save scheduled CSV
    if (modifiedScheduled) {
        try {
            await saveScheduledCSV();
        } catch (e) {
            // Transaction year files may already be committed; only roll back
            // the schedule mutation here, not the persisted generated expenses.
            state.scheduledTransactions = scheduledSnapshot;
            throw e;
        }
    }

    return modifiedYears.size > 0 || modifiedScheduled;
}

/**
 * Shows the approval modal listing candidate scheduled transactions.
 *
 * @param {Array} candidateTxns - Candidate transaction objects
 * @param {Array} simulationData - Schedule mutation data
 */
export function showScheduledApprovalModal(candidateTxns, simulationData) {
    if (typeof window !== 'undefined') {
        window.showScheduledApprovalModal = showScheduledApprovalModal;
    }

    if (!Array.isArray(candidateTxns) || candidateTxns.length === 0) {
        return;
    }

    modalCandidates = candidateTxns.slice();
    modalSimulation = simulationData ? simulationData.slice() : [];
    state.pendingScheduledTransactions = modalCandidates;

    const overlay = document.getElementById('scheduled-modal-overlay');
    const listContainer = document.getElementById('scheduled-approval-list');
    if (!overlay || !listContainer) return;

    listContainer.innerHTML = '';

    const countEl = document.getElementById('scheduled-count');
    if (countEl) {
        countEl.textContent = `${modalCandidates.length} transaction${modalCandidates.length !== 1 ? 's' : ''}`;
    }

    const selectAllCheckbox = document.getElementById('scheduled-select-all');
    if (selectAllCheckbox) selectAllCheckbox.checked = true;

    const approveBtn = document.getElementById('scheduled-modal-approve');
    if (approveBtn) {
        approveBtn.textContent = `Approve Selected (${modalCandidates.length})`;
        approveBtn.disabled = false;
    }

    const todayStr = getLocalDateString();

    modalCandidates.forEach((item, i) => {
        const isIncome = item.txnType === 'Income';
        const isRefund = item.txnType === 'Refund';
        const isCredit = isIncome || isRefund || item.amount < 0;
        const amountColor = isCredit ? 'var(--green)' : 'var(--amount-negative)';
        const amountPrefix = isCredit ? '+' : '';
        const isOverdue = !isWithinLast3Days(item.date, todayStr);

        let catOptions = (state.categories || []).map(c =>
            `<option value="${escHtml(c)}" ${c === item.category ? 'selected' : ''}>${escHtml(c)}</option>`
        ).join('');
        if (item.category && !state.categories.includes(item.category)) {
            catOptions = `<option value="${escHtml(item.category)}" selected>${escHtml(item.category)}</option>` + catOptions;
        }

        const card = document.createElement('div');
        card.className = 'scheduled-card';
        card.innerHTML = `
            <div class="scheduled-card-inner">
                <div style="padding-top: 2px;">
                    <input type="checkbox" class="scheduled-checkbox" data-index="${i}" checked style="cursor: pointer; width: 18px; height: 18px; accent-color: var(--accent);">
                </div>
                <div style="flex: 1; display: flex; flex-direction: column; gap: 8px; overflow: hidden;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                        <div style="font-weight: 600; color: var(--text-primary); font-size: 1.05rem; line-height: 1.3; word-break: break-word; text-align: left;">
                            ⚡ ${escHtml(item.note || item.category || 'Scheduled Entry')}
                        </div>
                        <div style="font-weight: 700; color: ${amountColor}; font-size: 1.1rem; white-space: nowrap; text-align: right;">
                            ${amountPrefix}₹${amountToStr(Math.abs(item.amount))}
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; color: var(--text-muted); text-align: left;">
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <span>📅</span> <span>${formatDate(item.date)}</span>
                            ${isOverdue ? '<span style="font-size: 0.72rem; background: rgba(239, 68, 68, 0.15); color: var(--amount-negative); padding: 1px 6px; border-radius: 4px; font-weight: 600;">Overdue</span>' : ''}
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span>💳</span> <span>${escHtml(item.txnMode || 'UPI')}</span>
                        </div>
                    </div>
                    <div style="margin-top: 4px;">
                        <select class="scheduled-category-select" data-index="${i}">
                            ${catOptions}
                        </select>
                    </div>
                </div>
            </div>
        `;
        listContainer.appendChild(card);
    });

    overlay.style.display = 'flex';
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
    hideLoader();
}

/**
 * Initializes DOM event listeners for the scheduled approval modal.
 */
export function setupScheduledApproval() {
    const closeBtn = document.getElementById('scheduled-modal-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeScheduledModal);
    }

    const overlay = document.getElementById('scheduled-modal-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target.id === 'scheduled-modal-overlay') {
                closeScheduledModal();
            }
        });
    }

    const selectAllCheckbox = document.getElementById('scheduled-select-all');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            document.querySelectorAll('.scheduled-checkbox').forEach(cb => {
                cb.checked = isChecked;
            });
            updateApproveButtonState();
        });
    }

    const listContainer = document.getElementById('scheduled-approval-list');
    if (listContainer) {
        listContainer.addEventListener('change', (e) => {
            if (e.target && e.target.classList && e.target.classList.contains('scheduled-checkbox')) {
                updateApproveButtonState();
            }
        });
    }

    function updateApproveButtonState() {
        const all = document.querySelectorAll('.scheduled-checkbox');
        const checked = document.querySelectorAll('.scheduled-checkbox:checked');
        const selectAll = document.getElementById('scheduled-select-all');
        if (selectAll) {
            selectAll.checked = all.length > 0 && all.length === checked.length;
        }
        const approveBtn = document.getElementById('scheduled-modal-approve');
        if (approveBtn) {
            approveBtn.textContent = `Approve Selected (${checked.length})`;
            approveBtn.disabled = checked.length === 0;
        }
    }

    // Discard All button
    const discardBtn = document.getElementById('scheduled-modal-discard');
    if (discardBtn) {
        discardBtn.addEventListener('click', async () => {
            showLoader('Skipping scheduled transactions...');
            try {
                // Advance schedules past these occurrences without adding expenses
                await executeScheduledCommit({
                    approvedCandidates: [],
                    simulationData: modalSimulation
                });
                toast('Discarded pending scheduled transaction(s)', 'info');
            } catch (e) {
                console.error("Error discarding scheduled transactions:", e);
                toast('Error updating scheduled transactions', 'error');
            } finally {
                hideLoader();
                closeScheduledModal();
                state.pendingScheduledTransactions = [];
                modalCandidates = [];
                modalSimulation = [];
                renderAll();
            }
        });
    }

    // Approve Selected button
    const approveBtn = document.getElementById('scheduled-modal-approve');
    if (approveBtn) {
        approveBtn.addEventListener('click', async () => {
            const checkedBoxes = document.querySelectorAll('.scheduled-checkbox:checked');
            if (checkedBoxes.length === 0) {
                toast('Please select at least one transaction to approve, or click Discard All', 'info');
                return;
            }

            showLoader('Saving approved scheduled transactions...');
            try {
                const approvedList = [];
                checkedBoxes.forEach(cb => {
                    const idx = parseInt(cb.dataset.index, 10);
                    const candidate = modalCandidates[idx];
                    if (!candidate) return;

                    const catSelect = document.querySelector(`.scheduled-category-select[data-index="${idx}"]`);
                    const chosenCategory = catSelect ? catSelect.value : candidate.category;

                    approvedList.push({
                        ...candidate,
                        category: chosenCategory
                    });
                });

                await executeScheduledCommit({
                    approvedCandidates: approvedList,
                    simulationData: modalSimulation
                });

                toast(`Added ${approvedList.length} scheduled transaction${approvedList.length !== 1 ? 's' : ''}`, 'success');
            } catch (e) {
                if (e.message === "CONFLICT_DETECTED") {
                    toast('Conflict! Data modified elsewhere. Please refresh.', 'error');
                } else {
                    console.error("Error approving scheduled transactions:", e);
                    toast('Error saving approved transactions', 'error');
                }
            } finally {
                hideLoader();
                closeScheduledModal();
                state.pendingScheduledTransactions = [];
                modalCandidates = [];
                modalSimulation = [];
                renderAll();
            }
        });
    }
}

if (typeof window !== 'undefined') {
    window.showScheduledApprovalModal = showScheduledApprovalModal;
}
