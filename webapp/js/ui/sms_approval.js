import { state } from "../core/state.js";
import { getLocalDateString, escHtml, toast, getCategoryForMerchant, getTxnTypeForMerchant, mapTxnMode, hasMatchingTxnId, getRealTxnIdList, parseLocalDate, isTxnIdInOtherTxn, getSourceProvider, getSourceProvidersList } from "../utils/helpers.js";
import { SMS_DEDUPLICATION_THRESHOLD, SMS_DEDUPLICATION_WINDOW_DAYS, IGNORE_LAST_SMS_DATE } from "../../config.js";
import { amountToStr } from "../services/storage.js";
import { renderAll } from "./render_all.js";
import { showLoader, hideLoader } from "../core/init.js";
import { saveYearCSV } from "./form.js";

const SMS_TXN_CACHE_KEY = 'expman_sms_txn_cache';

/**
 * Calculates calendar day difference between two YYYY-MM-DD date strings.
 */
function getDaysDiff(dateStr1, dateStr2) {
    if (!dateStr1 || !dateStr2) return 0;
    const d1 = parseLocalDate(dateStr1.slice(0, 10));
    const d2 = parseLocalDate(dateStr2.slice(0, 10));
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
    const diffMs = Math.abs(d2.getTime() - d1.getTime());
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Snapshot of pendingSmsTransactions taken when the modal opens.
 * The approve/discard handlers work exclusively off this frozen copy so that
 * incoming receiveSmsTransactions calls while the modal is open cannot shift
 * indices or replace the list being reviewed.
 */
let modalSnapshot = null;

/** Returns true when the SMS approval modal is currently visible. */
function isModalOpen() {
    const overlay = document.getElementById('sms-modal-overlay');
    return overlay && overlay.style.display === 'flex';
}

const INVALID_MERCHANTS = ['more info', 'more information', 'info', 'information', 'details', 'more details', 'contact info', 'service charges', 'service charge'];

function sanitizeTxnAmount(txn) {
    if (!txn) return;
    if (typeof txn.amount === 'string') {
        txn.amount = parseFloat(txn.amount.replace(/[^0-9.-]/g, ''));
    }
    if (!txn.date) {
        txn.date = getLocalDateString();
    }
    if (typeof txn.amount === 'number' && !isNaN(txn.amount)) {
        if (Math.abs(txn.amount) >= 100000 && Math.abs(txn.amount) % 100 === 0) {
            txn.amount = txn.amount / 100;
        }
    }
    // Clean up invalid dynamic merchant names (such as "More Info") from cached or incoming transactions
    if (txn.merchant) {
        const lowerMerch = txn.merchant.trim().toLowerCase();
        if (INVALID_MERCHANTS.includes(lowerMerch) || lowerMerch.startsWith('more info') || lowerMerch.startsWith('info:')) {
            const lowerSource = (txn.source || '').toLowerCase();
            const lowerBody = (txn.body || '').toLowerCase();
            if (lowerSource.includes('amazon') || lowerBody.includes('amazon')) {
                txn.merchant = 'Amazon';
                if (!txn.masterCategory || txn.masterCategory === 'Others') {
                    txn.masterCategory = 'Shopping';
                }
            } else {
                txn.merchant = '';
            }
        }
    }
}

/**
 * Reads cached SMS transactions from localStorage.
 */
export function loadRawSmsCache() {
    try {
        const raw = localStorage.getItem(SMS_TXN_CACHE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) parsed.forEach(sanitizeTxnAmount);
        return parsed;
    } catch (e) {
        return [];
    }
}

/** Persist the current rawSmsTransactions to localStorage. */
function saveRawSmsCache(transactions) {
    try {
        if (Array.isArray(transactions)) transactions.forEach(sanitizeTxnAmount);
        localStorage.setItem(SMS_TXN_CACHE_KEY, JSON.stringify(transactions));
    } catch (e) {
        // Ignore storage quota errors
    }
}

/**
 * Merge an incoming list of transactions into the existing raw list.
 * Uses transactionId when present, otherwise date+amount+source as the key.
 * Always keeps today's transactions regardless of what was cached.
 * Returns the merged array.
 */
function mergeRawTransactions(existing, incoming) {
    if (Array.isArray(existing)) existing.forEach(sanitizeTxnAmount);
    if (Array.isArray(incoming)) incoming.forEach(sanitizeTxnAmount);

    const keyOf = t => {
        if (t.transactionId && t.transactionId.trim()) {
            return t.transactionId.trim();
        }
        const absAmt = Math.abs(Number(t.amount) || 0).toFixed(2);
        const cleanSrc = (t.source || '').toLowerCase().trim();
        return `${t.date}_${absAmt}_${cleanSrc}`;
    };

    const map = new Map();
    if (Array.isArray(existing)) {
        for (const t of existing) {
            map.set(keyOf(t), t);
        }
    }
    if (Array.isArray(incoming)) {
        for (const t of incoming) {
            map.set(keyOf(t), t); // incoming wins (fresher data)
        }
    }
    return Array.from(map.values());
}

/**
 * Helper to check if two transactions are duplicates.
 * Standard Rule: If amounts match (within SMS_DEDUPLICATION_THRESHOLD) and dates fall within windowDays (default 0 for same-day, SMS_DEDUPLICATION_WINDOW_DAYS for cross-source SMS/Email), treat as same transaction.
 * PROVIDER CHANNEL RULE: If a transaction already contains a provider (e.g. 'hdfc') AND has a real transaction ID,
 * do NOT pick another transaction from that same provider ('hdfc') with a different ID (e.g. two separate 2000 HDFC payments on the same day).
 */
export function isDuplicateTxn(a, b, windowDays = 0) {
    if (!a || !b) return false;

    const realIdsA = getRealTxnIdList(a);
    const realIdsB = getRealTxnIdList(b);

    const hasBothRealIds = realIdsA.length > 0 && realIdsB.length > 0;
    const hasMatchingReal = hasBothRealIds && realIdsA.some(idA => realIdsB.includes(idA));

    // Priority 1: Exact real Txn ID match
    if (hasMatchingReal) {
        return true;
    }

    const providersA = getSourceProvidersList(a.source);
    const providersB = getSourceProvidersList(b.source);

    // PROVIDER UNIQNESS RULE: If both transactions have real transaction IDs, share a provider channel (e.g. 'hdfc'),
    // but have different real transaction IDs (hasMatchingReal is false), they represent TWO DISTINCT real-world transactions
    // from that provider (e.g., two separate 2000 HDFC payments on the same day) and must NOT be merged together.
    const sharedProvider = providersA.find(p => providersB.includes(p));
    if (sharedProvider && hasBothRealIds) {
        return false;
    }

    const todayStr = getLocalDateString();
    const dateA = (a.date || todayStr).slice(0, 10);
    const dateB = (b.date || todayStr).slice(0, 10);

    const diffDays = getDaysDiff(dateA, dateB);
    const inDateWindow = diffDays <= windowDays;

    const amtA = Math.abs(Number(a.amount) || 0);
    const amtB = Math.abs(Number(b.amount) || 0);
    const sameAmount = Math.abs(amtA - amtB) <= SMS_DEDUPLICATION_THRESHOLD;

    if (inDateWindow && sameAmount) {
        return true;
    }

    return false;
}

/**
 * Re-compute pendingSmsTransactions from the current rawSmsTransactions.
 * Handles Before Approval (merging pending notifications) and
 * After Approval (enriching approved state.expenses with real Txn IDs & sources within a configurable date window automatically).
 */
export function recomputePendingSmsTransactions() {
    // Never mutate pendingSmsTransactions while the user is reviewing the modal —
    // the approve handler relies on stable indices into that array.
    if (isModalOpen()) return;

    if (Array.isArray(state.rawSmsTransactions)) {
        state.rawSmsTransactions.forEach(sanitizeTxnAmount);
    }

    let discarded = JSON.parse(localStorage.getItem('expman_discarded_signatures') || '[]');
    let lastProcessed = parseInt(localStorage.getItem('expman_last_sms_date')) || 0;
    const todayStr = getLocalDateString();

    let updatedExpenses = false;
    const updatedYears = new Set();
    const windowDays = (typeof SMS_DEDUPLICATION_WINDOW_DAYS !== 'undefined') ? SMS_DEDUPLICATION_WINDOW_DAYS : 3;

    // FAST HASH INDEXING: Pre-index state.expenses by real Txn IDs for O(1) lookups
    const realIdToExpenseMap = new Map();
    if (Array.isArray(state.expenses)) {
        state.expenses.forEach(exp => {
            const realIds = getRealTxnIdList(exp);
            realIds.forEach(id => {
                if (!realIdToExpenseMap.has(id)) {
                    realIdToExpenseMap.set(id, exp);
                }
            });
        });
    }

    let pending = state.rawSmsTransactions.filter(txn => {
        const pendingRealIds = getRealTxnIdList(txn);

        // Priority 1: Exact real Txn ID match in O(1)
        let matchingApproved = null;
        for (const id of pendingRealIds) {
            if (realIdToExpenseMap.has(id)) {
                matchingApproved = realIdToExpenseMap.get(id);
                break;
            }
        }

        // Priority 2: Configurable date window + amount match among nearby candidate expenses (O(candidates))
        if (!matchingApproved && Array.isArray(state.expenses)) {
            const txnDateStr = (txn.date || todayStr).slice(0, 10);
            const candidates = state.expenses.filter(e => {
                const eDateStr = (e.date || todayStr).slice(0, 10);
                return getDaysDiff(txnDateStr, eDateStr) <= (windowDays + 1);
            });
            matchingApproved = candidates.find(e => isDuplicateTxn(txn, e, windowDays));
        }

        if (matchingApproved) {
            let enriched = false;

            const approvedRealIds = getRealTxnIdList(matchingApproved);

            // Enrich committed expense with new real Txn IDs from raw transaction if not already present
            // CRITICAL VERIFICATION: Verify Txn ID does NOT exist in any OTHER committed expense
            if (pendingRealIds.length > 0) {
                const newRealIds = pendingRealIds.filter(id => {
                    if (approvedRealIds.includes(id)) return false; // Already on this expense
                    const existingExp = realIdToExpenseMap.get(id);
                    return !existingExp || existingExp === matchingApproved;
                });

                if (newRealIds.length > 0) {
                    const existingIdStr = (matchingApproved.txnId || matchingApproved.transactionId || '').trim();
                    const combinedId = existingIdStr ? `${existingIdStr}|${newRealIds.join('|')}` : newRealIds.join('|');
                    matchingApproved.txnId = combinedId;
                    matchingApproved.transactionId = combinedId;
                    newRealIds.forEach(id => realIdToExpenseMap.set(id, matchingApproved));
                    enriched = true;
                }
            }

            // Enrich committed expense with missing source tag
            if (txn.source) {
                const existingSources = (matchingApproved.source || '').split(' & ').map(s => s.trim());
                const incomingSources = String(txn.source).split(' & ').map(s => s.trim());
                const newSources = incomingSources.filter(s => s && !existingSources.includes(s));
                if (newSources.length > 0) {
                    matchingApproved.source = matchingApproved.source ? `${matchingApproved.source} & ${newSources.join(' & ')}` : newSources.join(' & ');
                    enriched = true;
                }
            }

            if (enriched) {
                updatedExpenses = true;
                const yr = (matchingApproved.date && matchingApproved.date.substring(0, 4)) || new Date().getFullYear().toString();
                updatedYears.add(yr);
            }

            return false; // Filter out from pending since it matches/enriches a committed transaction
        }

        const sig = `${txn.date}_${txn.amount}`;
        if (discarded.includes(sig)) return false;
        
        if (txn.date !== todayStr && !IGNORE_LAST_SMS_DATE && txn.timestamp && txn.timestamp <= lastProcessed) {
            return false;
        }

        return true;
    });

    // BEFORE APPROVAL: Deduplicate and merge pending transactions together into single Quick Add suggestions (within configurable date window)
    const uniquePending = [];
    const pendingRealIdMap = new Map();

    pending.forEach(txn => {
        const pendingRealIds = getRealTxnIdList(txn);

        // Priority 1: Exact real Txn ID match in O(1)
        let duplicate = null;
        for (const id of pendingRealIds) {
            if (pendingRealIdMap.has(id)) {
                duplicate = pendingRealIdMap.get(id);
                break;
            }
        }

        // Priority 2: Configurable date window + amount match among nearby candidate pending items
        if (!duplicate) {
            const txnDateStr = (txn.date || todayStr).slice(0, 10);
            const candidates = uniquePending.filter(u => {
                const uDateStr = (u.date || todayStr).slice(0, 10);
                return getDaysDiff(txnDateStr, uDateStr) <= (windowDays + 1);
            });
            duplicate = candidates.find(u => isDuplicateTxn(txn, u, windowDays));
        }

        if (!duplicate) {
            const copy = { ...txn };
            uniquePending.push(copy);
            pendingRealIds.forEach(id => pendingRealIdMap.set(id, copy));
        } else {
            if (txn.source) {
                const existingSources = (duplicate.source || '').split(' & ').map(s => s.trim());
                const incomingSources = String(txn.source).split(' & ').map(s => s.trim());
                const newSources = incomingSources.filter(s => s && !existingSources.includes(s));
                if (newSources.length > 0) {
                    duplicate.source = duplicate.source ? `${duplicate.source} & ${newSources.join(' & ')}` : newSources.join(' & ');
                }
            }
            if (!duplicate.merchant && txn.merchant) {
                duplicate.merchant = txn.merchant;
            }
            if (pendingRealIds.length > 0) {
                const duplicateRealIds = getRealTxnIdList(duplicate);
                const newRealIds = pendingRealIds.filter(id => {
                    if (duplicateRealIds.includes(id)) return false;
                    const inExp = realIdToExpenseMap.get(id);
                    if (inExp) return false;
                    const inPending = pendingRealIdMap.get(id);
                    return !inPending || inPending === duplicate;
                });

                if (newRealIds.length > 0) {
                    const existingIdStr = (duplicate.transactionId || duplicate.txnId || '').trim();
                    const combinedId = existingIdStr ? `${existingIdStr}|${newRealIds.join('|')}` : newRealIds.join('|');
                    duplicate.transactionId = combinedId;
                    duplicate.txnId = combinedId;
                    newRealIds.forEach(id => pendingRealIdMap.set(id, duplicate));
                }
            }
        }
    });

    state.pendingSmsTransactions = uniquePending;

    if (!state.pendingEnrichedYears) state.pendingEnrichedYears = new Set();
    for (const yr of updatedYears) state.pendingEnrichedYears.add(yr);

    if (updatedExpenses || state.pendingEnrichedYears.size > 0) {
        // Only trigger cloud CSV saves if cloud sync is not currently in progress,
        // preventing eTag validation conflicts while cloud data is actively downloading.
        if (!state.cloudSyncInProgress) {
            for (const yr of state.pendingEnrichedYears) {
                const savePromise = saveYearCSV(yr);
                if (savePromise && typeof savePromise.catch === 'function') {
                    savePromise.catch(e => console.warn('Background saveYearCSV failed for year', yr, e));
                }
            }
            state.pendingEnrichedYears.clear();
        }
        renderAll();
    }
}

if (typeof window !== 'undefined') {
    window.recomputePendingSmsTransactions = recomputePendingSmsTransactions;
}

/**
 * Returns deduplicated SMS suggestions for a specific date directly from the raw cache,
 * ignoring the last processed date and discarded status.
 */
export function getRawSmsSuggestionsForDate(date) {
    const rawSms = loadRawSmsCache();
    let pending = rawSms.filter(txn => 
        txn.date === date && 
        !state.expenses.some(e => isDuplicateTxn(txn, e, 7))
    );

    const uniquePending = [];
    pending.forEach(txn => {
        const duplicate = uniquePending.find(u => isDuplicateTxn(txn, u, 7));
        if (!duplicate) {
            uniquePending.push({ ...txn });
        } else {
            if (txn.source) {
                const existingSources = (duplicate.source || '').split(' & ').map(s => s.trim());
                const incomingSources = String(txn.source).split(' & ').map(s => s.trim());
                const newSources = incomingSources.filter(s => s && !existingSources.includes(s));
                if (newSources.length > 0) {
                    duplicate.source = duplicate.source ? `${duplicate.source} & ${newSources.join(' & ')}` : newSources.join(' & ');
                }
            }
            if (!duplicate.merchant && txn.merchant) {
                duplicate.merchant = txn.merchant;
            }
        }
    });

    return uniquePending;
}

/**
 * Remove a raw SMS/Email transaction from cache once approved/logged into state.expenses.
 */
export function consumeRawSmsTransaction(txn) {
    if (!txn) return;
    state.rawSmsTransactions = state.rawSmsTransactions.filter(t => !isDuplicateTxn(t, txn));
    saveRawSmsCache(state.rawSmsTransactions);
    recomputePendingSmsTransactions();
}

/**
 * Discard a raw SMS/Email transaction so it is never shown again.
 */
export function discardRawSmsTransaction(txn) {
    if (!txn) return;
    const sig = `${txn.date}_${txn.amount}`;
    let discarded = JSON.parse(localStorage.getItem('expman_discarded_signatures') || '[]');
    if (!discarded.includes(sig)) {
        discarded.push(sig);
        localStorage.setItem('expman_discarded_signatures', JSON.stringify(discarded));
    }
    consumeRawSmsTransaction(txn);
}

/**
 * Called once on app start (before Android sends anything) to pre-populate
 * pending transactions from the JS-side cache so the UI is immediately ready.
 */
export function initSmsFromCache() {
    if (localStorage.getItem('expman_disable_sms_sync')) return;
    const cached = loadRawSmsCache();
    if (!cached.length) return;
    
    let lastProcessed = parseInt(localStorage.getItem('expman_last_sms_date')) || 0;
    if (window.Android && typeof window.Android.getLastSmsDate === 'function') {
        const androidMax = window.Android.getLastSmsDate() || 0;
        if (androidMax > lastProcessed) lastProcessed = androidMax;
    }
    
    state.rawSmsTransactions = cached;
    
    recomputePendingSmsTransactions();
    renderAll();
}

export function setupSmsApproval() {
    document.getElementById('sms-select-all')?.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        document.querySelectorAll('.sms-checkbox').forEach(cb => cb.checked = isChecked);
    });

    document.getElementById('sms-modal-discard')?.addEventListener('click', () => {
        const snapshot = modalSnapshot || state.pendingSmsTransactions;
        if (snapshot.length > 0) {
            const maxTs = Math.max(...snapshot.map(t => t.timestamp || 0));
            if (maxTs > 0) {
                localStorage.setItem('expman_last_sms_date', maxTs.toString());
                if (window.Android && typeof window.Android.setLastSmsDate === 'function') {
                    window.Android.setLastSmsDate(maxTs);
                }
            }
            
            let discarded = JSON.parse(localStorage.getItem('expman_discarded_signatures') || '[]');
            let modified = false;
            snapshot.forEach(t => {
                const sig = `${t.date}_${t.amount}`;
                if (!discarded.includes(sig)) {
                    discarded.push(sig);
                    modified = true;
                }
            });
            if (modified) {
                if (discarded.length > 2000) discarded = discarded.slice(discarded.length - 2000);
                localStorage.setItem('expman_discarded_signatures', JSON.stringify(discarded));
            }
            
            // Removed state.rawSmsTransactions.filter mutation so it stays in cache
        }
        document.getElementById('sms-modal-overlay').style.display = 'none';
        document.body.classList.remove('modal-open');
        document.documentElement.classList.remove('modal-open');
        modalSnapshot = null;
        state.pendingSmsTransactions = [];
        saveRawSmsCache(state.rawSmsTransactions); // persist updated watermark context
        renderAll();
    });

    document.getElementById('sms-modal-approve')?.addEventListener('click', async () => {
        const checkboxes = document.querySelectorAll('.sms-checkbox:checked');
        // Work off the frozen snapshot taken when the modal opened, not the live array.
        const snapshot = modalSnapshot || state.pendingSmsTransactions;

        if (checkboxes.length > 0) {
            const checkedTxns = Array.from(checkboxes).map(cb => snapshot[cb.dataset.index]);
            const maxTs = Math.max(...checkedTxns.map(t => t.timestamp || 0));
            if (maxTs > 0) {
                localStorage.setItem('expman_last_sms_date', maxTs.toString());
                if (window.Android && typeof window.Android.setLastSmsDate === 'function') {
                    window.Android.setLastSmsDate(maxTs);
                }
            }
            
            // Removed state.rawSmsTransactions.filter mutation so it stays in cache

            showLoader('Saving approved SMS transactions...');
            let modifiedYears = new Set();
            checkboxes.forEach(cb => {
                const idx = cb.dataset.index;
                const txn = snapshot[idx];
                const selectEl = document.querySelector(`.sms-category-select[data-index="${idx}"]`);
                const chosenCategory = selectEl ? selectEl.value : (txn.masterCategory || 'Others');
                const expectedType = txn.amount < 0 ? 'Refund' : 'Expense';
                const computedType = txn.txnType || getTxnTypeForMerchant(txn.merchant, expectedType);
                const finalAmount = (computedType === 'Income' || computedType === 'Refund') ? -Math.abs(txn.amount) : Math.abs(txn.amount);

                state.expenses.unshift({
                    date: txn.date,
                    amount: finalAmount,
                    currency: txn.currency || 'INR',
                    category: chosenCategory,
                    txnType: computedType,
                    txnMode: mapTxnMode(txn.transactionMode, state.txnModes),
                    note: txn.merchant || '',
                    source: txn.source,
                    txnId: txn.transactionId || ''
                });
                modifiedYears.add(txn.date.slice(0, 4));
            });

            state.expenses.sort((a, b) => b.date.localeCompare(a.date));

            for (const year of modifiedYears) {
                await saveYearCSV(year);
            }

            toast(`Added ${checkboxes.length} transactions from SMS`, 'success');
            hideLoader();
        }

        document.getElementById('sms-modal-overlay').style.display = 'none';
        document.body.classList.remove('modal-open');
        document.documentElement.classList.remove('modal-open');
        modalSnapshot = null;
        state.pendingSmsTransactions = [];
        saveRawSmsCache(state.rawSmsTransactions); // persist updated watermark context
        renderAll();
    });
}

export function receiveSmsTransactions(jsonString) {
    window.showSmsApprovalModal = showSmsApprovalModal;
    if (localStorage.getItem('expman_disable_sms_sync')) {
        console.log("SMS syncing disabled. Ignoring SMS data.");
        return;
    }
    console.log("Received SMS transactions from Android", jsonString);
    try {
        const incoming = JSON.parse(jsonString);

        // Merge incoming with whatever we already have (from cache or a prior call).
        // This prevents email batches streaming in one-by-one from re-triggering a full reset.
        state.rawSmsTransactions = mergeRawTransactions(state.rawSmsTransactions, incoming);

        // Persist the merged set so the next app launch can show it immediately.
        saveRawSmsCache(state.rawSmsTransactions);

        // Re-compute pending with the updated raw list.
        recomputePendingSmsTransactions();

        // Refresh the UI to immediately show new suggestions in the Add Entry form
        if (typeof renderAll === 'function') {
            renderAll();
        }
    } catch (e) {
        console.error("Failed to parse SMS transactions", e);
    }
}

export function showSmsApprovalModal(txns) {
    window.showSmsApprovalModal = showSmsApprovalModal;
    const listContainer = document.getElementById('sms-approval-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    // Freeze a snapshot of the transactions being reviewed. The approve/discard
    // handlers will work off this copy regardless of further receiveSmsTransactions
    // calls that arrive while the modal is open.
    modalSnapshot = txns.slice();

    const countEl = document.getElementById('sms-count');
    if (countEl) countEl.textContent = `${txns.length} transaction${txns.length !== 1 ? 's' : ''}`;

    txns.forEach((txn, i) => {
        let bestMatch = getCategoryForMerchant(txn.merchant, txn.masterCategory);
        let catOptions = state.categories.map(c => `<option value="${escHtml(c)}" ${c === bestMatch ? 'selected' : ''}>${escHtml(c)}</option>`).join('');
        if (bestMatch === 'Others' && !state.categories.includes('Others')) {
            catOptions = `<option value="Others" selected>Others</option>` + catOptions;
        }

        const isEmail = (txn.source || '').toLowerCase().includes('email');
        const sourceStr = isEmail ? 'Email' : 'SMS';
        const isRefund = txn.txnType === 'Refund' || txn.txnType === 'Income' || txn.amount < 0;
        const amountColor = isRefund ? 'var(--green)' : 'var(--red)';
        const amountPrefix = isRefund ? '+' : '';

        const mappedMode = mapTxnMode(txn.transactionMode, state.txnModes);

        const div = document.createElement('div');
        div.className = 'sms-card';
        div.innerHTML = `
                <div style="display: flex; align-items: flex-start; gap: 14px; padding: 16px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); background: rgba(255, 255, 255, 0.02); transition: background 0.2s; text-align: left;">
                    <div style="padding-top: 2px;">
                        <input type="checkbox" class="sms-checkbox" data-index="${i}" checked style="cursor: pointer; width: 18px; height: 18px; accent-color: var(--accent);">
                    </div>
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 8px; overflow: hidden;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                            <div style="font-weight: 600; color: var(--text-primary); font-size: 1.05rem; line-height: 1.3; word-break: break-word; text-align: left;">${escHtml(sourceStr)}</div>
                            <div style="font-weight: 700; color: ${amountColor}; font-size: 1.1rem; white-space: nowrap; text-align: right;">
                                ${amountPrefix}₹${amountToStr(Math.abs(txn.amount))}
                            </div>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; color: var(--text-muted); text-align: left;">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span>📅</span> <span>${txn.date}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span>💳</span> <span>${escHtml(mappedMode)}</span>
                            </div>
                            ${txn.merchant ? `
                            <div style="display: flex; align-items: flex-start; gap: 6px;">
                                <span>🏪</span> <span style="font-weight: 500; color: var(--text-main); line-height: 1.3; word-break: break-word; text-align: left;">${escHtml(txn.merchant)}</span>
                            </div>
                            ` : ''}
                            <div style="display: flex; align-items: flex-start; gap: 6px;">
                                <span>📝</span> <span style="font-style: italic; line-height: 1.3; word-break: break-word; text-align: left;">${escHtml(txn.source)}</span>
                            </div>
                        </div>
                        <div style="margin-top: 6px;">
                            <select class="sms-category-select" data-index="${i}" style="width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-body); color: var(--text-main); font-size: 0.95rem; cursor: pointer; outline: none; transition: border-color 0.2s; text-align: left;">
                                ${catOptions}
                            </select>
                        </div>
                    </div>
                </div>
            `;
        listContainer.appendChild(div);
    });
    document.getElementById('sms-modal-overlay').style.display = 'flex';
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
    hideLoader();
}
