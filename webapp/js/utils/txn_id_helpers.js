/* ══════════════ TXN ID HELPERS ══════════════
 * Pure transaction ID parsing, formatting and refund identification functions with zero dependencies.
 * ═════════════════════════════════════════════ */

export function getTxnIdList(t) {
    if (!t) return [];
    const rawId = t.txnId || t.transactionId;
    if (!rawId) return [];
    return String(rawId)
        .split(/[|,\s]+/)
        .map(s => s.trim())
        .filter(Boolean);
}

import { SYSTEM_TXN_ID_PREFIXES, SYSTEM_TXN_SOURCES, SYSTEM_TXN_PREFIX_SCHEDULER, TXN_SOURCE_SCHEDULE, TXN_SOURCE_QUICK_ADD, TXN_SOURCE_SMS_PREFIX, TXN_SOURCE_EMAIL_PREFIX } from "../../config.js";
import { escHtml } from "./date_helpers.js";
export { SYSTEM_TXN_ID_PREFIXES, SYSTEM_TXN_SOURCES, TXN_SOURCE_SCHEDULE, TXN_SOURCE_QUICK_ADD, TXN_SOURCE_SMS_PREFIX, TXN_SOURCE_EMAIL_PREFIX };

export function txnTypeBadgeHTML(txnType) {
    if (!txnType || txnType === 'Expense' || txnType === 'Refund') return '';
    const cls = txnType === 'Income' ? 'type-income'
        : txnType === 'Investment' ? 'type-investment'
            : 'type-transfer';
    return `<span class="badge-txn-type ${cls}">${escHtml(txnType)}</span>`;
}

export function isSystemTxnId(id) {
    if (!id) return false;
    const upper = String(id).trim().toUpperCase();
    const prefixes = SYSTEM_TXN_ID_PREFIXES || ['__TXN_', '__SCHEDULER_', '__QUICKADD_'];
    return prefixes.some(prefix => upper.startsWith(prefix.toUpperCase()));
}

export function getRealTxnIdList(t) {
    return getTxnIdList(t).filter(id => !isSystemTxnId(id));
}

export function getDisplayTxnIdList(t) {
    if (!t) return [];
    const rawId = t.txnId || t.transactionId;
    if (!rawId) return [];
    const sources = SYSTEM_TXN_SOURCES || ['Schedule', 'Quick Add'];
    if (sources.includes(t.source)) return [];
    return getRealTxnIdList(t);
}

export function getDisplayTxnId(t) {
    return getDisplayTxnIdList(t).join('|');
}

export function getRawSourceList(source) {
    if (!source) return [];
    return String(source)
        .split(' & ')
        .map(s => s.trim())
        .filter(Boolean);
}

export function getDisplaySourceList(source) {
    if (!source) return [];
    const parts = String(source).split(' & ').map(p => {
        const trimmed = p.trim();
        const lower = trimmed.toLowerCase();
        if (lower === 'email' || lower.startsWith('email:')) return 'Email';
        if (lower === 'sms' || lower.startsWith('sms:')) return 'SMS';
        return trimmed;
    }).filter(Boolean);
    const unique = [...new Set(parts)];
    if (unique.length === 0) return [];

    // Order composite sources: Schedule first, then SMS & Email, then Quick Add, etc.
    const ordered = [];
    if (unique.includes('Schedule')) ordered.push('Schedule');
    if (unique.includes('SMS') && unique.includes('Email')) {
        ordered.push('SMS & Email');
    } else {
        if (unique.includes('SMS')) ordered.push('SMS');
        if (unique.includes('Email')) ordered.push('Email');
    }
    if (unique.includes('Quick Add')) ordered.push('Quick Add');
    for (const s of unique) {
        if (!ordered.includes(s) && !ordered.includes('SMS & Email') && s !== 'SMS' && s !== 'Email') {
            ordered.push(s);
        }
    }
    
    // Always return a single combined badge across all views (e.g. ['Schedule & Email'], ['SMS & Email'])
    return [ordered.join(' & ')];
}

/**
 * Formats and shortens source strings for UI badges (e.g., 'SMS: AD-HDFCBK...' -> 'SMS', 'Email: ...' -> 'Email').
 * Handles composite sources like 'Schedule & Email: ...' by deduplicating shortened labels to 'Schedule & Email'.
 */
export function getDisplaySource(source) {
    return getDisplaySourceList(source).join(' & ');
}


export function hasMatchingTxnId(t1, t2) {
    const ids1 = getTxnIdList(t1);
    const ids2 = getTxnIdList(t2);
    if (ids1.length === 0 || ids2.length === 0) return false;
    return ids1.some(id1 => ids2.includes(id1));
}



export function isRefundTxn(t) {
    if (!t) return false;
    const type = (t.txnType || '').trim().toLowerCase();
    if (type === 'refund') return true;
    if (type === 'income' || type === 'investment' || type === 'transfer' || type === 'expense') return false;
    return Number(t.amount) < 0;
}

/**
 * Checks if a real transaction ID exists in any transaction within a list (optionally excluding a specific transaction).
 */
export function isTxnIdInOtherTxn(txnId, list, excludeTxn = null) {
    if (!txnId || !list || !Array.isArray(list)) return false;
    const cleanId = String(txnId).trim();
    if (!cleanId || isSystemTxnId(cleanId)) return false;

    return list.some(t => {
        if (excludeTxn && t === excludeTxn) return false;
        const realIds = getRealTxnIdList(t);
        return realIds.includes(cleanId);
    });
}

/**
 * Extracts the originating schedule ID from a system transaction ID.
 * Scheduled transactions are generated as `__SCHEDULER_<scheduleId>_<YYYY-MM-DD>`
 * (see storage.js). The schedule ID is free-form and may itself contain underscores,
 * so everything up to the trailing date is captured greedily.
 * @param {string} txnId
 * @returns {string|null} Schedule ID, or null when the ID is not scheduler-generated.
 */
export function getScheduleIdFromTxnId(txnId) {
    if (!txnId) return null;
    const ids = getTxnIdList({ txnId });
    for (const id of ids) {
        if (!isSystemTxnId(id)) continue;
        const upper = String(id).trim().toUpperCase();
        if (!upper.startsWith(SYSTEM_TXN_PREFIX_SCHEDULER.toUpperCase())) continue;
        const match = String(id).trim().match(/^__SCHEDULER_(.+)_(\d{4}-\d{2}-\d{2})$/);
        if (match && match[1]) return match[1];
    }
    return null;
}

/**
 * True when a transaction was generated from a schedule, i.e. its source
 * contains a Schedule component. Composite sources such as
 * 'Schedule & Email: ...' also qualify, since those entries were produced by
 * the schedule scheduler before being enriched by another channel.
 * @param {object} t
 * @returns {boolean}
 */
export function isScheduleGeneratedTxn(t) {
    if (!t) return false;
    return getRawSourceList(t.source).includes(TXN_SOURCE_SCHEDULE);
}

/**
 * Extracts normalized provider channel name (e.g. 'hdfc', 'amazon', 'swiggy', 'airtel') from a source string.
 */
export function getSourceProvider(sourceStr) {
    if (!sourceStr) return '';
    const clean = String(sourceStr).toLowerCase().trim();
    if (!clean) return '';

    if (clean.includes('hdfc')) return 'hdfc';
    if (clean.includes('icici')) return 'icici';
    if (clean.includes('sbi')) return 'sbi';
    if (clean.includes('axis')) return 'axis';
    if (clean.includes('amazon')) return 'amazon';
    if (clean.includes('swiggy')) return 'swiggy';
    if (clean.includes('zomato')) return 'zomato';
    if (clean.includes('airtel')) return 'airtel';
    if (clean.includes('pluxee') || clean.includes('sodexo')) return 'pluxee';
    if (clean.includes('paytm')) return 'paytm';
    if (clean.includes('phonepe')) return 'phonepe';
    if (clean.includes('gpay') || clean.includes('google pay')) return 'gpay';
    if (clean.includes('irctc')) return 'irctc';

    // Strips 'sms:' or 'email:' prefix
    const stripped = clean.replace(/^(sms|email):\s*/i, '').trim();
    const firstWord = stripped.split(/[-_\s:@.]/)[0];
    return firstWord || clean;
}

/**
 * Returns array of normalized provider channel names from composite source string (e.g. 'Email: Amazon & SMS: HDFC' -> ['amazon', 'hdfc']).
 */
export function getSourceProvidersList(sourceStr) {
    if (!sourceStr) return [];
    const parts = String(sourceStr).split(' & ');
    const providers = parts.map(p => getSourceProvider(p)).filter(Boolean);
    return [...new Set(providers)];
}
