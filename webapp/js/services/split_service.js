import { state } from "../core/state.js";
import { getCsvContent } from "./storage.js";
import { getRequiredEmail } from "./auth.js";
import { USE_LOCAL_DATA } from "../../config.js";
import { ref, uploadString } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { evaluateExpression } from "../ui/form.js";

/**
 * Rounds a numeric amount to 2 decimal places.
 * @param {number} val
 * @returns {number}
 */
export function roundAmount(val) {
    if (isNaN(val) || !isFinite(val)) return 0;
    return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Loads split bills and participants from cloud storage or local cache.
 * @returns {Promise<Array>} List of split bills
 */
export async function loadSplitBills() {
    if (state.splitBillsLoaded && Array.isArray(state.splitBills) && state.splitBills.length > 0) {
        return state.splitBills;
    }

    try {
        const text = await getCsvContent('split_bills.json');
        if (text) {
            const data = JSON.parse(text);
            if (data && Array.isArray(data.bills)) {
                state.splitBills = data.bills;
            } else if (Array.isArray(data)) {
                state.splitBills = data;
            }
            if (data && Array.isArray(data.recentPeople)) {
                state.splitRecentPeople = data.recentPeople;
            }
            localStorage.setItem('expman_split_bills', JSON.stringify(state.splitBills));
            localStorage.setItem('expman_split_recent_people', JSON.stringify(state.splitRecentPeople));
        }
    } catch (err) {
        console.warn('Could not load split_bills.json from cloud, falling back to local cache', err);
        try {
            const cached = localStorage.getItem('expman_split_bills');
            if (cached) state.splitBills = JSON.parse(cached);
            const cachedPeople = localStorage.getItem('expman_split_recent_people');
            if (cachedPeople) state.splitRecentPeople = JSON.parse(cachedPeople);
        } catch (_) {}
    }

    state.splitBillsLoaded = true;
    return state.splitBills || [];
}

/**
 * Persists split bills and recent participants to local storage and Firebase Storage (split_bills.json).
 */
export async function saveSplitBills() {
    localStorage.setItem('expman_split_bills', JSON.stringify(state.splitBills || []));
    localStorage.setItem('expman_split_recent_people', JSON.stringify(state.splitRecentPeople || []));

    if (USE_LOCAL_DATA) return;

    try {
        const userEmail = getRequiredEmail();
        if (!userEmail || !state.storage) return;

        const payload = {
            bills: state.splitBills || [],
            recentPeople: state.splitRecentPeople || [],
            updatedAt: Date.now()
        };

        const fileRef = ref(state.storage, `${userEmail}/split_bills.json`);
        await uploadString(fileRef, JSON.stringify(payload, null, 2));
    } catch (err) {
        console.error('Failed to sync split_bills.json to cloud:', err);
        throw err;
    }
}

/**
 * Returns a deduplicated list of previously used participant names from recent history and all bills.
 * @returns {string[]}
 */
export function getKnownPeople() {
    const set = new Set();
    if (Array.isArray(state.splitRecentPeople)) {
        state.splitRecentPeople.forEach(p => p && set.add(p.trim()));
    }
    if (Array.isArray(state.splitBills)) {
        state.splitBills.forEach(b => {
            if (Array.isArray(b.participants)) {
                b.participants.forEach(p => {
                    if (p && p.name && p.name.trim()) set.add(p.name.trim());
                });
            }
        });
    }
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

/**
 * Core calculation engine for bill splitting.
 * Supports:
 * - Equal split or expression-based split per person
 * - Percentage-wise (proportional) or equal tax distribution
 * - Arithmetic expressions with + - * / and brackets ()
 * - Stores end amount for each user
 *
 * @param {Object} billData
 * @returns {Object} Calculated bill with updated participants and totals
 */
export function calculateSplit(billData) {
    const bill = { ...billData };
    const participants = (bill.participants || []).map(p => ({ ...p }));
    const totalAmountExpr = (bill.totalAmountExpr !== undefined && bill.totalAmountExpr !== null)
        ? String(bill.totalAmountExpr).trim()
        : String(bill.totalAmount || 0);
    const inclusiveTotal = roundAmount(evaluateExpression(totalAmountExpr));
    const splitMethod = bill.splitMethod || 'equal';
    const taxSplitMethod = bill.taxSplitMethod || 'percentage';
    const count = participants.length;

    // The entered bill amount is the final payable amount (tax-inclusive).
    const taxExpr = (bill.taxExpr !== undefined && bill.taxExpr !== null) ? String(bill.taxExpr).trim() : '0';
    let totalTax = 0;
    if (taxExpr.includes('%')) {
        const pct = parseFloat(taxExpr.replace('%', '').trim()) || 0;
        // Extract tax from an inclusive total: inclusive = base * (1 + rate).
        totalTax = pct >= 0 ? roundAmount(inclusiveTotal * pct / (100 + pct)) : 0;
    } else {
        totalTax = roundAmount(evaluateExpression(taxExpr));
    }
    totalTax = Math.max(0, Math.min(inclusiveTotal, totalTax));
    const baseTotal = roundAmount(inclusiveTotal - totalTax);

    let allocatedBase = 0;
    if (splitMethod === 'equal') {
        const equalShare = count > 0 ? baseTotal / count : 0;
        participants.forEach((p, idx) => {
            p.expression = count > 0 ? roundAmount(equalShare).toString() : '0';
            p.baseAmount = idx === count - 1
                ? roundAmount(baseTotal - allocatedBase)
                : roundAmount(equalShare);
            allocatedBase += p.baseAmount;
        });
    } else {
        participants.forEach(p => {
            const expr = p.expression ? String(p.expression).trim() : '0';
            p.baseAmount = roundAmount(evaluateExpression(expr));
            allocatedBase += p.baseAmount;
        });
    }

    let allocatedTax = 0;
    participants.forEach((p, idx) => {
        if (p.taxExpression && String(p.taxExpression).trim()) {
            p.taxAmount = roundAmount(evaluateExpression(String(p.taxExpression).trim()));
        } else if (totalTax > 0 && count > 0) {
            if (taxSplitMethod === 'equal') {
                p.taxAmount = idx === count - 1
                    ? roundAmount(totalTax - allocatedTax)
                    : roundAmount(totalTax / count);
            } else {
                const ratio = baseTotal > 0 ? (p.baseAmount / baseTotal) : (1 / count);
                p.taxAmount = idx === count - 1
                    ? roundAmount(totalTax - allocatedTax)
                    : roundAmount(totalTax * ratio);
            }
        } else {
            p.taxAmount = 0;
        }
        allocatedTax += p.taxAmount;
        p.endAmount = roundAmount(p.baseAmount + p.taxAmount);
    });

    bill.taxInclusive = true;
    bill.totalAmount = inclusiveTotal;
    bill.baseAmountTotal = baseTotal;
    bill.taxAmount = totalTax;
    bill.participants = participants;
    bill.allocatedBase = roundAmount(allocatedBase);
    bill.remainingBase = roundAmount(baseTotal - allocatedBase);
    bill.allocatedTax = roundAmount(allocatedTax);
    bill.remainingTax = roundAmount(totalTax - allocatedTax);
    bill.grandTotal = inclusiveTotal;
    bill.remainingInclusive = roundAmount(bill.remainingBase + bill.remainingTax);
    return bill;
}

/**
 * Saves a new bill or updates an existing bill in the split list and syncs.
 * @param {Object} bill
 * @returns {Promise<Object>} Saved bill
 */
export async function addOrUpdateSplitBill(bill) {
    if (!Array.isArray(state.splitBills)) state.splitBills = [];

    const calculated = calculateSplit(bill);
    const now = Date.now();

    if (!calculated.id) {
        calculated.id = 'split_' + now + '_' + Math.random().toString(36).substr(2, 5);
        calculated.createdAt = now;
        calculated.updatedAt = now;
        state.splitBills.unshift(calculated);
    } else {
        calculated.updatedAt = now;
        const idx = state.splitBills.findIndex(b => b.id === calculated.id);
        if (idx !== -1) {
            state.splitBills[idx] = calculated;
        } else {
            state.splitBills.unshift(calculated);
        }
    }

    // Update recent people list
    const known = getKnownPeople();
    (calculated.participants || []).forEach(p => {
        if (p && p.name && p.name.trim() && !known.includes(p.name.trim())) {
            known.push(p.name.trim());
        }
    });
    state.splitRecentPeople = known;

    await saveSplitBills();
    return calculated;
}

/**
 * Deletes a split bill by ID and syncs.
 * @param {string} billId
 * @returns {Promise<boolean>}
 */
export async function deleteSplitBill(billId) {
    if (!Array.isArray(state.splitBills)) return false;
    const initialLen = state.splitBills.length;
    state.splitBills = state.splitBills.filter(b => b.id !== billId);
    if (state.splitBills.length !== initialLen) {
        await saveSplitBills();
        return true;
    }
    return false;
}
