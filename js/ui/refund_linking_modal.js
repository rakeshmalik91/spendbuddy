import { state } from "../core/state.js";
import { escHtml, formatDate, toast, hasMatchingTxnId, getTxnIdList, isRefundTxn, isSystemTxnId, getDisplaySource } from "../utils/helpers.js";
import { saveYearCSV } from "./form.js";
import { renderAll } from "./render_all.js";
import { $, $$ } from "../core/init.js";
import { SYSTEM_TXN_PREFIX_TXN } from "../../config.js";

/**
 * Opens the interactive modal to manually link/unlink refund transactions to an expense
 * or link an original expense to a refund transaction.
 */
export function openRefundLinkingModal(txnIdx) {
    const targetTxn = state.expenses[txnIdx];
    if (!targetTxn) return;

    const isTargetRefund = isRefundTxn(targetTxn);
    const targetAmount = Math.abs(targetTxn.amount);
    const targetTime = new Date(targetTxn.date + 'T00:00:00').getTime();

    // Ensure target transaction has a system Txn ID if it has no Txn ID already
    if (!targetTxn.txnId || !targetTxn.txnId.trim()) {
        targetTxn.txnId = '__TXN_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    }
    const targetTxnId = targetTxn.txnId ? targetTxn.txnId.trim() : '';

    const candidates = [];
    state.expenses.forEach((t, idx) => {
        if (t === targetTxn) return;
        const candidateIsRefund = isRefundTxn(t);

        if (isTargetRefund) {
            // Target is a Refund -> looking for Candidate Expenses
            // Rule 1: Candidate must be an Expense (!isRefundTxn)
            // Rule 2: Refund date >= Candidate Expense date (candTime <= targetTime)
            // Rule 3: Candidate Expense amount >= Refund amount (Math.abs(t.amount) >= targetAmount)
            if (!candidateIsRefund) {
                const candTime = new Date(t.date + 'T00:00:00').getTime();
                const diffDays = Math.round((candTime - targetTime) / (1000 * 60 * 60 * 24)); // <= 0
                const candAmount = Math.abs(t.amount);

                if (candTime <= targetTime && candAmount >= targetAmount - 0.01) {
                    const isLinked = hasMatchingTxnId(targetTxn, t);
                    // Default range: candidate expense date within 7 days prior to refund date
                    const isWithin7Days = isLinked || (diffDays >= -7 && diffDays <= 0);

                    candidates.push({
                        txn: t,
                        idx: idx,
                        isLinked: isLinked,
                        diffDays: diffDays,
                        isWithin7Days: isWithin7Days
                    });
                }
            }
        } else {
            // Target is an Expense -> looking for Candidate Refunds
            // Rule 1: Candidate must be a Refund (isRefundTxn)
            // Rule 2: Candidate Refund date >= Expense date (candTime >= targetTime)
            // Rule 3: Expense amount >= Candidate Refund amount (targetAmount >= Math.abs(t.amount))
            // Rule 4: Candidate Refund must NOT already be linked to a different expense!
            if (candidateIsRefund) {
                const candTime = new Date(t.date + 'T00:00:00').getTime();
                const diffDays = Math.round((candTime - targetTime) / (1000 * 60 * 60 * 24)); // >= 0
                const candAmount = Math.abs(t.amount);

                const isLinked = hasMatchingTxnId(targetTxn, t);
                const candTxnIds = getTxnIdList(t);
                const isLinkedToOther = candTxnIds.length > 0 && !isLinked;

                // Filter out any refunds already linked to another transaction
                if (!isLinkedToOther && candTime >= targetTime && targetAmount >= candAmount - 0.01) {
                    const isWithin7Days = isLinked || (diffDays >= 0 && diffDays <= 7);

                    candidates.push({
                        txn: t,
                        idx: idx,
                        isLinked: isLinked,
                        diffDays: diffDays,
                        isWithin7Days: isWithin7Days
                    });
                }
            }
        }
    });

    let showAllCandidates = false;

    // Build modal HTML depending on target type
    const modalTitle = isTargetRefund ? '🔗 Link Original Expense' : '🔗 Link Refunds';
    const targetTypeLabel = isTargetRefund ? 'Refund Transaction' : 'Original Expense';

    let overlay = document.getElementById('refund-linking-modal-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'refund-linking-modal-overlay';
        overlay.className = 'modal-overlay refund-linking-overlay';
        overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 16px; touch-action: none; overscroll-behavior: contain;';
        document.body.appendChild(overlay);
    } else {
        overlay.className = 'modal-overlay refund-linking-overlay';
    }

    overlay.innerHTML = `
        <div style="background: #0f172a; border: 1px solid #334155; border-radius: 12px; max-width: 540px; width: 100%; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.7);">
            <div style="padding: 16px 20px; background: #1e293b; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; font-size: 1.1rem; color: #f8fafc; font-weight: 700;">${modalTitle}</h3>
                <button type="button" id="close-rl-modal" style="background: none; border: none; color: #94a3b8; font-size: 1.5rem; cursor: pointer; line-height: 1;">&times;</button>
            </div>

            <div style="padding: 16px 20px; background: #1e293b; border-bottom: 1px solid #334155;">
                <div style="font-weight: 600; font-size: 1rem; color: #f8fafc; margin-bottom: 4px;">${escHtml(targetTxn.note || targetTxn.category)}</div>
                <div style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 12px;">${formatDate(targetTxn.date)} &bull; ${escHtml(targetTxn.txnMode)}</div>
                
                <div style="display: flex; gap: 12px; background: #0f172a; border: 1px solid #334155; padding: 10px 14px; border-radius: 8px; font-size: 0.9rem;">
                    <div style="flex: 1;">
                        <span style="color: #94a3b8; font-size: 0.8rem; display: block;">${targetTypeLabel}</span>
                        <span style="font-weight: 700; color: ${isTargetRefund ? '#10b981' : '#ef4444'};">₹${targetAmount.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                    <div style="flex: 1;">
                        <span style="color: #94a3b8; font-size: 0.8rem; display: block;">Total Refunded</span>
                        <span id="rl-summary-refunded" style="font-weight: 700; color: #10b981;">₹0.00</span>
                    </div>
                    <div style="flex: 1;">
                        <span style="color: #94a3b8; font-size: 0.8rem; display: block;">Net Expense</span>
                        <span id="rl-summary-net" style="font-weight: 700; color: #f8fafc;">₹0.00</span>
                    </div>
                </div>
            </div>

            <div style="padding: 12px 20px 8px 20px; background: #0f172a;">
                <input type="text" id="rl-search" placeholder="Search ${isTargetRefund ? 'expenses' : 'refunds'} by merchant, date, amount..." style="width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid #334155; background: #1e293b; color: #f8fafc; font-size: 0.85rem; box-sizing: border-box;" />
            </div>

            <div id="rl-list-container" style="padding: 8px 20px; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; min-height: 150px; background: #0f172a; touch-action: pan-y; overscroll-behavior: contain; -webkit-overflow-scrolling: touch;">
                ${candidates.length === 0 ? `<div style="text-align: center; color: #94a3b8; padding: 24px; font-size: 0.9rem;">No eligible candidate transactions found.</div>` : ''}
            </div>

            <div style="padding: 16px 20px; border-top: 1px solid #334155; display: flex; justify-content: flex-end; gap: 10px; background: #1e293b;">
                <button type="button" id="btn-cancel-rl" class="btn-secondary" style="padding: 8px 16px; border-radius: 6px; border: 1px solid #334155; background: transparent; color: #f8fafc; cursor: pointer;">Cancel</button>
                <button type="button" id="btn-save-rl" class="btn-primary" style="padding: 8px 16px; border-radius: 6px; border: none; background: #3b82f6; color: white; font-weight: 600; cursor: pointer;">Save Links</button>
            </div>
        </div>
    `;

    overlay.style.display = 'flex';
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');

    const listContainer = overlay.querySelector('#rl-list-container');
    const searchInput = overlay.querySelector('#rl-search');
    const summaryRefunded = overlay.querySelector('#rl-summary-refunded');
    const summaryNet = overlay.querySelector('#rl-summary-net');

    function renderList(query = '') {
        if (candidates.length === 0) return;
        const q = query.trim().toLowerCase();

        let filtered = candidates.filter(item => {
            if (!q) {
                return showAllCandidates ? true : item.isWithin7Days;
            }
            const text = `${item.txn.note} ${item.txn.category} ${item.txn.date} ${item.txn.amount} ${item.txn.source}`.toLowerCase();
            return text.includes(q);
        });

        if (filtered.length === 0) {
            const emptyText = q ? 'No matching transactions found.' : 'No eligible transactions found within 7 days.';
            let html = `<div style="text-align: center; color: #94a3b8; padding: 16px; font-size: 0.85rem;">${emptyText}</div>`;
            if (!q && !showAllCandidates && candidates.length > 0) {
                html += `
                    <button type="button" id="btn-show-all-refunds" style="width: 100%; padding: 10px; border: 1px dashed #334155; border-radius: 8px; background: #1e293b; color: #3b82f6; font-weight: 600; cursor: pointer;">
                        📂 Show All Eligible Transactions (${candidates.length} total)
                    </button>
                `;
            }
            listContainer.innerHTML = html;
            attachListeners();
            return;
        }

        const inputType = isTargetRefund ? 'radio' : 'checkbox';
        const inputNameAttr = isTargetRefund ? 'name="rl-expense-choice"' : '';

        let itemsHtml = filtered.map(item => {
            const amt = Math.abs(item.txn.amount);
            const amtColor = isTargetRefund ? '#ef4444' : '#10b981';
            const amtSign = isTargetRefund ? '-₹' : '+₹';

            return `
                <label style="display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid #334155; border-radius: 8px; background: #1e293b; cursor: pointer; transition: background 0.2s;">
                    <input type="${inputType}" ${inputNameAttr} class="rl-cb" data-idx="${item.idx}" ${item.isLinked ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer; accent-color: #3b82f6;" />
                    <div style="flex: 1;">
                        <div style="font-weight: 600; font-size: 0.9rem; color: #f8fafc;">${escHtml(item.txn.note || item.txn.category)}</div>
                        <div style="font-size: 0.78rem; color: #94a3b8;">${formatDate(item.txn.date)} &bull; <span title="${escHtml(item.txn.source || '')}">${escHtml(getDisplaySource(item.txn.source) || 'Manual')}</span></div>
                    </div>
                    <div style="font-weight: 700; color: ${amtColor}; font-size: 0.95rem;">${amtSign}${amt.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                </label>
            `;
        }).join('');

        const hiddenCount = candidates.length - filtered.length;
        if (!q && !showAllCandidates && hiddenCount > 0) {
            itemsHtml += `
                <button type="button" id="btn-show-all-refunds" style="width: 100%; padding: 10px; margin-top: 4px; border: 1px dashed #334155; border-radius: 8px; background: #1e293b; color: #3b82f6; font-weight: 600; cursor: pointer;">
                    📂 Show All Eligible Transactions (${hiddenCount} older transaction${hiddenCount > 1 ? 's' : ''} hidden)
                </button>
            `;
        }

        listContainer.innerHTML = itemsHtml;
        attachListeners();
    }

    function attachListeners() {
        overlay.querySelectorAll('.rl-cb').forEach(cb => {
            cb._wasChecked = cb.checked;
            cb.addEventListener('click', (e) => {
                const targetIdx = parseInt(e.target.dataset.idx);
                const cand = candidates.find(c => c.idx === targetIdx);

                if (isTargetRefund) {
                    if (cand && cand.isLinked && e.target._wasChecked) {
                        // Toggle off if re-clicked when already checked
                        cand.isLinked = false;
                        e.target.checked = false;
                        e.target._wasChecked = false;
                    } else {
                        candidates.forEach(c => c.isLinked = (c.idx === targetIdx));
                        overlay.querySelectorAll('.rl-cb').forEach(otherCb => {
                            const isThis = (parseInt(otherCb.dataset.idx) === targetIdx);
                            otherCb.checked = isThis;
                            otherCb._wasChecked = isThis;
                        });
                    }
                } else if (cand) {
                    cand.isLinked = e.target.checked;
                    e.target._wasChecked = e.target.checked;
                }
                updateSummary();
            });
        });

        const showAllBtn = overlay.querySelector('#btn-show-all-refunds');
        if (showAllBtn) {
            showAllBtn.addEventListener('click', () => {
                showAllCandidates = true;
                renderList(searchInput ? searchInput.value : '');
            });
        }
    }

    function updateSummary() {
        let totalRefundedAmt = 0;
        let mainExpAmt = isTargetRefund ? 0 : targetAmount;

        if (isTargetRefund) {
            const linkedExp = candidates.find(c => c.isLinked);
            if (linkedExp) mainExpAmt = Math.abs(linkedExp.txn.amount);
            totalRefundedAmt = targetAmount;
        } else {
            candidates.forEach(c => {
                if (c.isLinked) totalRefundedAmt += Math.abs(c.txn.amount);
            });
        }

        totalRefundedAmt = Math.round(totalRefundedAmt * 100) / 100;
        const net = Math.max(0, Math.round((mainExpAmt - totalRefundedAmt) * 100) / 100);

        if (summaryRefunded) summaryRefunded.textContent = `₹${totalRefundedAmt.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        if (summaryNet) summaryNet.textContent = `₹${net.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    }

    renderList();
    updateSummary();

    if (searchInput) {
        searchInput.addEventListener('input', (e) => renderList(e.target.value));
    }

    const closeModal = () => {
        overlay.style.display = 'none';
        document.body.classList.remove('modal-open');
        document.documentElement.classList.remove('modal-open');
    };

    overlay.querySelector('#close-rl-modal')?.addEventListener('click', closeModal);
    overlay.querySelector('#btn-cancel-rl')?.addEventListener('click', closeModal);

    // Close modal when clicking outside the dialog content box (on the backdrop overlay)
    overlay.onclick = (e) => {
        if (e.target === overlay) closeModal();
    };

    overlay.querySelector('#btn-save-rl')?.addEventListener('click', async () => {
        const modifiedYears = new Set([targetTxn.date.slice(0, 4)]);

        if (isTargetRefund) {
            // Target is Refund -> linking/unlinking an Expense
            const chosenCandidate = candidates.find(c => c.isLinked);

            candidates.forEach(c => {
                const exp = c.txn;
                const currentRefundIds = getTxnIdList(targetTxn);
                const expId = exp.txnId ? exp.txnId.trim() : '';
                const isCurrentlyLinked = expId ? currentRefundIds.includes(expId) : false;

                if (c === chosenCandidate && !isCurrentlyLinked) {
                    if (!exp.txnId || !exp.txnId.trim()) {
                        exp.txnId = '__TXN_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
                    }
                    const newExpId = exp.txnId.trim();
                    const targetIds = getTxnIdList(targetTxn);
                    if (!targetIds.includes(newExpId)) targetIds.push(newExpId);
                    targetTxn.txnId = targetIds.join('|');
                    modifiedYears.add(targetTxn.date.slice(0, 4));
                    modifiedYears.add(exp.date.slice(0, 4));
                } else if (c !== chosenCandidate && isCurrentlyLinked) {
                    const targetIds = getTxnIdList(targetTxn).filter(id => id !== expId);
                    targetTxn.txnId = targetIds.join('|');
                    modifiedYears.add(targetTxn.date.slice(0, 4));
                }
            });

            if (!chosenCandidate) {
                targetTxn.txnId = getTxnIdList(targetTxn).filter(id => !isSystemTxnId(id)).join('|');
            }
        } else {
            // Target is Expense -> linking/unlinking Refund(s)
            const expenseIdStr = targetTxn.txnId.trim();
            candidates.forEach(c => {
                const r = c.txn;
                const currentIds = getTxnIdList(r);
                const isCurrentlyLinked = currentIds.includes(expenseIdStr);

                if (c.isLinked && !isCurrentlyLinked) {
                    currentIds.push(expenseIdStr);
                    r.txnId = currentIds.join('|');
                    modifiedYears.add(r.date.slice(0, 4));
                } else if (!c.isLinked && isCurrentlyLinked) {
                    const updatedIds = currentIds.filter(id => id !== expenseIdStr);
                    r.txnId = updatedIds.join('|');
                    modifiedYears.add(r.date.slice(0, 4));
                }
            });
        }

        toast('Saving links...', 'info');
        try {
            for (const year of modifiedYears) {
                await saveYearCSV(year);
            }
            toast('Transaction links updated!', 'success');
            closeModal();
            renderAll();
        } catch (e) {
            toast('Error saving links', 'error');
        }
    });
}

window.openRefundLinkingModal = openRefundLinkingModal;
