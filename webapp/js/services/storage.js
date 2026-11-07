import { ref, getDownloadURL, uploadString, listAll, getMetadata, getBytes } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { calculateNextRunDate, getLocalDateString, toast, getLastLocation, getCurrentLocationTag, isMobileView, stripEmojiPrefix } from "../utils/helpers.js";
import { showLoader, hideLoader, $$, $ } from "../core/init.js";
import { populateNoteSuggestions, populateLocationSuggestions, populateTagSuggestions } from "../ui/form_dropdowns.js";
import { getUserEmail, getRequiredEmail } from "./auth.js";
import { USE_LOCAL_DATA, DEFAULT_CATEGORIES, DEFAULT_TXN_MODES, BACKGROUND_REFRESH_INTERVAL_MS } from "../../config.js";
import { renderAll } from "../ui/render_all.js";
import { state } from "../core/state.js";
import { saveYearCSV } from "../ui/form.js";
import { encryptData, decryptData } from "../utils/crypto.js";
import { storeFileHash, verifyFileHashBeforeUpload } from "./etag_manager.js";
import { applyUserSettings } from "./user_settings.js";
import { isWithinLast3Days, showScheduledApprovalModal, executeScheduledCommit, isScheduledModalOpen } from "../ui/scheduled_approval.js";

/* ══════════════ CSV I/O ══════════════ */

export async function populateAvailableFiles() {
    if (state.availableFiles) return;
    const userEmail = getRequiredEmail();
    const folderRef = ref(state.storage, userEmail + '/');
    try {
        const result = await listAll(folderRef);
        state.availableFiles = new Set(result.items.map(i => i.name));
    } catch (e) {
        console.warn('Failed to list files, continuing without it', e);
        state.availableFiles = null;
    }
}

export const BUCKET_URL = "https://firebasestorage.googleapis.com/v0/b/expense-manager-iq.firebasestorage.app/o";


export function isCsvInCache(filename) {
    if (window.Android && window.Android.readLocalCsv) {
        const cached = window.Android.readLocalCsv(filename);
        if (cached && cached.trim().length > 0) return true;
    }
    const cachedWeb = localStorage.getItem(`expman_cache_${filename}`);
    if (cachedWeb && cachedWeb.trim().length > 0) return true;
    return false;
}

export async function getCsvContent(filename, forceNetwork = false) {
    const userEmail = getRequiredEmail();
    const filePath = `${userEmail}/${filename}`;
    if (USE_LOCAL_DATA) {
        const res = await fetch(`./${filePath}`);
        return res.ok ? await res.text() : '';
    }

    // On Android, try reading from local cache first (unless forcing network)
    if (!forceNetwork) {
        if (window.Android && window.Android.readLocalCsv) {
            try {
                const cached = window.Android.readLocalCsv(filename);
                if (cached && cached.trim().length > 0) {
                    const cachedHash = localStorage.getItem(`expman_hash_${filename}`);
                    // A cached hash can itself be stale (another device may have written
                    // since this cache was populated). Ask Firebase for current metadata
                    // before trusting cached transaction data as the base for a later write.
                    const cloudContent = await getCsvContentFromCloud(filename, cachedHash || null);
                    if (cloudContent === "NOT_MODIFIED") {
                        state.fileHashes[filePath] = cachedHash;
                    } else if (cloudContent) {
                        const cloudHash = state.fileHashes[filePath] || '';
                        saveToLocalCache(filename, cloudContent, cloudHash);
                        return cloudContent;
                    } else if (!cachedHash) {
                        throw new Error(`Cannot verify cached ${filename} against cloud`);
                    } else {
                        // Cloud metadata/download unavailable: don't silently trust stale cache.
                        throw new Error(`Cannot refresh cached ${filename} from cloud`);
                    }
                    let content = cached;
                    if (content.startsWith("ENC:")) {
                        if (!state.encryptionKey) throw new Error("Encryption key required");
                        content = await decryptData(state.encryptionKey, content);
                    }
                    return content;
                }
            } catch (e) {
                if (e.message === "Encryption key required") throw e;
                console.warn(`Android local cache miss for ${filename}`, e);
            }
        } else {
            // Web fallback cache
            try {
                const cached = localStorage.getItem(`expman_cache_${filename}`);
                if (cached && cached.trim().length > 0) {
                    const cachedHash = localStorage.getItem(`expman_hash_${filename}`);
                    // A cached hash can itself be stale (another device may have written
                    // since this cache was populated). Ask Firebase for current metadata
                    // before trusting cached transaction data as the base for a later write.
                    const cloudContent = await getCsvContentFromCloud(filename, cachedHash || null);
                    if (cloudContent === "NOT_MODIFIED") {
                        state.fileHashes[filePath] = cachedHash;
                    } else if (cloudContent) {
                        const cloudHash = state.fileHashes[filePath] || '';
                        saveToLocalCache(filename, cloudContent, cloudHash);
                        return cloudContent;
                    } else if (!cachedHash) {
                        throw new Error(`Cannot verify cached ${filename} against cloud`);
                    } else {
                        // Cloud metadata/download unavailable: don't silently trust stale cache.
                        throw new Error(`Cannot refresh cached ${filename} from cloud`);
                    }
                    let content = cached;
                    if (content.startsWith("ENC:")) {
                        if (!state.encryptionKey) throw new Error("Encryption key required");
                        content = await decryptData(state.encryptionKey, content);
                    }
                    return content;
                }
            } catch (e) {
                if (e.message === "Encryption key required") throw e;
            }
        }
    }

    // Cache miss or forceNetwork: fetch from cloud and save to Android cache
    const content = await getCsvContentFromCloud(filename);
    if (content && content !== "NOT_MODIFIED") {
        const hashToSave = state.fileHashes[filePath] || '';
        saveToLocalCache(filename, content, hashToSave);
    }
    return content === "NOT_MODIFIED" ? '' : content;
}

// Always fetches from Firebase cloud storage (does not write to Android cache)
// knownHash is passed during background syncs to skip downloading the file body if it hasn't changed
async function getCsvContentFromCloud(filename, knownHash = null) {
    const userEmail = getRequiredEmail();
    const filePath = `${userEmail}/${filename}`;
    try {
        const fileRef = ref(state.storage, filePath);

        // storeFileHash fetches the metadata and updates state.fileHashes[filePath] with the latest md5Hash
        // This causes 1 small network call (metadata only), but saves us from downloading the whole file
        await storeFileHash(fileRef);

        // OPTIMIZATION: If the cloud hash exactly matches our locally cached hash, 
        // skip the getBytes() download entirely to prevent a redundant 304 network request.
        if (knownHash && state.fileHashes[filePath] === knownHash) {
            return "NOT_MODIFIED";
        }

        const bytes = await getBytes(fileRef);
        const decoder = new TextDecoder('utf-8');
        let content = decoder.decode(bytes);

        if (content.startsWith("ENC:")) {
            if (!state.encryptionKey) throw new Error("Encryption key required");
            content = await decryptData(state.encryptionKey, content);
        }
        return content;
    } catch (e) {
        if (e.message === "Encryption key required") throw e;
        return '';
    }
}

export async function loadAllCSVs() {
    state.expenses = [];
    state.trash = [];
    const currentYear = new Date().getFullYear();

    try {
        const text = await getCsvContent(`${currentYear}.csv`);
        if (text) {
            const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
            const rows = parsed.data.map(normalizeRow).filter(r => r !== null);
            state.expenses = rows.filter(r => !r.deleted);
            state.trash = (state.trash || []).concat(rows.filter(r => r.deleted));
        }
    } catch (e) {
        console.warn('Could not load current year CSV', e);
    }
    state.loadedYears.add(currentYear);

    const prevYear = currentYear - 1;
    try {
        const textPrev = await getCsvContent(`${prevYear}.csv`);
        if (textPrev) {
            const parsedPrev = Papa.parse(textPrev.trim(), { header: true, skipEmptyLines: true });
            const expensesPrev = parsedPrev.data.map(normalizeRow).filter(r => r !== null);
            state.expenses = state.expenses.concat(expensesPrev.filter(r => !r.deleted));
            state.trash = (state.trash || []).concat(expensesPrev.filter(r => r.deleted));
        }
    } catch (e) {
        console.warn('Could not load previous year CSV', e);
    }
    state.loadedYears.add(prevYear);

    state.expenses.sort((a, b) => b.date.localeCompare(a.date));

    if (state.expenses.length > 0) {
        if (!isMobileView()) {
            toast(`Loaded ${state.expenses.length} transactions for ${currentYear}`, 'success');
        }
    } else {
        console.warn('Could not load any CSVs, starting empty');
    }
}

export async function loadScheduledCSV() {
    state.scheduledTransactions = [];
    try {
        const text = await getCsvContent(`scheduled_transaction.csv`);
        if (text) {
            const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
            state.scheduledTransactions = parsed.data.map(parseScheduledRow).filter(r => !isNaN(r.amount));
        }
    } catch (e) {
        console.warn('Could not load scheduled_transaction.csv', e);
    }
}

export async function loadBalanceCSV() {
    state.balanceData = [];
    try {
        const text = await getCsvContent(`balance.csv`);
        if (text) {
            const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
            state.balanceData = parsed.data.map(parseBalanceRow).filter(r => !isNaN(r.amount));
            // sort descending by date by default
            state.balanceData.sort((a, b) => b.date.localeCompare(a.date));
        }
        state.balanceLoaded = true;
    } catch (e) {
        console.warn('Could not load balance.csv', e);
    }
}

export async function saveScheduledCSV() {
    if (USE_LOCAL_DATA) return;
    const header = 'ID,Disabled,Amount,Amount Expression,Currency,Category,Transaction Mode,Note,Frequency,Recur Month,Recur Day,Recur Weekday,Start Date,Last Run Date,Next Run Date,End Condition,End Date,Max Occurrences,Run Count,Transaction Type,Location,Tag';
    const rows = state.scheduledTransactions.map(e => {
        const expr = csvEscape(e.amountExpression || '');
        const weekdaysStr = (e.recur_weekdays && e.recur_weekdays.length > 0) ? e.recur_weekdays.join('|') : (!isNaN(e.recur_weekday) && e.recur_weekday !== null ? e.recur_weekday : '');
        return `${e.id},${e.disabled === true},${amountToStr(e.amount)},${expr},${e.currency},${csvEscape(e.category)},${csvEscape(e.txnMode)},${csvEscape(e.note)},${e.frequency},${isNaN(e.recur_month) || e.recur_month === null ? '' : e.recur_month},${isNaN(e.recur_day) || e.recur_day === null ? '' : e.recur_day},${weekdaysStr},${e.start_date || ''},${e.last_run_date || ''},${e.next_run_date || ''},${e.end_condition || 'never'},${e.end_date || ''},${isNaN(e.max_occurrences) || e.max_occurrences === null ? '' : e.max_occurrences},${e.run_count || 0},${csvEscape(e.txnType)},${csvEscape(e.location || '')},${csvEscape(e.tag || '')},${e.deleted === true ? 'true' : 'false'}`;
    });
    const csvContent = header + '\n' + rows.join('\n');
    const userEmail = getRequiredEmail();
    const fileRef = ref(state.storage, `${userEmail}/scheduled_transaction.csv`);
    await uploadFile(fileRef, csvContent);
}

export async function saveBalanceCSV() {
    if (USE_LOCAL_DATA) return;
    
    state.balanceData.sort((a, b) => {
        const dateCmp = b.date.localeCompare(a.date);
        if (dateCmp !== 0) return dateCmp;
        const accCmp = a.account.localeCompare(b.account);
        if (accCmp !== 0) return accCmp;
        return (a.type || '').localeCompare(b.type || '');
    });

    const header = 'ID,Date,Account,Type,Amount,Amount Expression';
    const rows = state.balanceData.map(e => `${e.id},${e.date},${csvEscape(e.account)},${csvEscape(e.type || '')},${amountToStr(e.amount)},${csvEscape(e.amountExpression || '')}`);
    const csvContent = header + '\n' + rows.join('\n');
    const userEmail = getRequiredEmail();
    const fileRef = ref(state.storage, `${userEmail}/balance.csv`);
    await uploadFile(fileRef, csvContent);
}

// Queue uploads per file path to prevent concurrent write collisions and ETag race conditions
const fileUploadQueues = new Map();

export async function uploadFile(fileRef, content) {
    const filePath = fileRef.fullPath;
    const filename = fileRef.name;

    // Chain this upload behind any in-flight upload for the same file path
    const prevUpload = fileUploadQueues.get(filePath) || Promise.resolve();

    let resolveCurrent;
    const currentUpload = new Promise((resolve) => { resolveCurrent = resolve; });
    const chainedPromise = prevUpload.then(() => currentUpload, () => currentUpload);
    fileUploadQueues.set(filePath, chainedPromise);

    try {
        await prevUpload;
    } catch (e) {
        // Ignore errors from previous uploads in queue so subsequent uploads can proceed
    }

    try {
        await verifyFileHashBeforeUpload(fileRef);

        const cacheContent = content;
        if (state.encryptionEnabled && state.encryptionKey) {
            content = await encryptData(state.encryptionKey, content);
        }
        const uploadResult = await uploadString(fileRef, content);

        // Cache only committed content. A rejected ETag write must never replace
        // the last known-good cache with an upload that Firebase did not accept.
        saveToLocalCache(filename, cacheContent);

        // Update hash immediately from uploadResult if returned, otherwise fetch via storeFileHash
        if (uploadResult && uploadResult.metadata && uploadResult.metadata.md5Hash) {
            state.fileHashes[filePath] = uploadResult.metadata.md5Hash;
        } else {
            await storeFileHash(fileRef);
        }

        // Also save hash to localStorage so background sync can skip downloading it again
        const newHash = state.fileHashes[filePath];
        if (newHash) {
            saveToLocalCache(filename, null, newHash);
        }
    } finally {
        resolveCurrent();
        if (fileUploadQueues.get(filePath) === chainedPromise) {
            fileUploadQueues.delete(filePath);
        }
    }
}

export async function reEncryptAllCloudData(enabling, newKey) {
    const userEmail = getRequiredEmail();
    const folderRef = ref(state.storage, userEmail + '/');
    const result = await listAll(folderRef);

    for (const itemRef of result.items) {
        // Skip files that are never encrypted
        if (itemRef.name === 'user_settings.json') continue;

        try {
            // Download current content
            const url = await getDownloadURL(itemRef);
            const res = await fetch(url);
            if (!res.ok) continue;

            let content = await res.text();

            // Decrypt if it's currently encrypted
            if (content.startsWith("ENC:")) {
                if (!state.encryptionKey) throw new Error("Missing current encryption key");
                content = await decryptData(state.encryptionKey, content);
            }

            // Re-encrypt if we are enabling encryption or changing password with encryption enabled
            if (enabling && newKey) {
                content = await encryptData(newKey, content);
            }

            // Upload back
            await uploadString(itemRef, content);
            console.log(`Successfully re-processed ${itemRef.name}`);
        } catch (e) {
            console.error(`Error processing ${itemRef.name}:`, e);
            // Skip this file and continue with others instead of aborting the whole process
        }
    }
}

export async function processScheduledTransactions(options = {}) {
    if (isScheduledModalOpen()) {
        return false;
    }

    const today = getLocalDateString();
    const candidateTxns = [];
    const simulationData = [];

    const detectedLocation = typeof getCurrentLocationTag === 'function' ? await getCurrentLocationTag() : '';

    // Iterate forward through scheduled transactions to preserve natural order
    for (let i = 0; i < state.scheduledTransactions.length; i++) {
        let st = state.scheduledTransactions[i];
        if (st.disabled) continue;
        if (!st.next_run_date || st.frequency === 'instant') continue;

        // End condition checks
        if (st.end_condition === 'enabled') {
            if ((st.end_date && st.next_run_date > st.end_date) || (st.max_occurrences && st.run_count >= st.max_occurrences)) {
                st.disabled = true;
                simulationData.push({
                    scheduleId: st.id,
                    isOneOff: false,
                    finalNextRunDate: st.next_run_date,
                    finalLastRunDate: st.last_run_date,
                    finalRunCount: st.run_count || 0,
                    finalDisabled: true
                });
                continue;
            }
        } else if (st.end_condition === 'until_date' && st.end_date && st.next_run_date > st.end_date) {
            st.disabled = true;
            simulationData.push({
                scheduleId: st.id,
                isOneOff: false,
                finalNextRunDate: st.next_run_date,
                finalLastRunDate: st.last_run_date,
                finalRunCount: st.run_count || 0,
                finalDisabled: true
            });
            continue;
        } else if (st.end_condition === 'after_occurrences' && st.max_occurrences && st.run_count >= st.max_occurrences) {
            st.disabled = true;
            simulationData.push({
                scheduleId: st.id,
                isOneOff: false,
                finalNextRunDate: st.next_run_date,
                finalLastRunDate: st.last_run_date,
                finalRunCount: st.run_count || 0,
                finalDisabled: true
            });
            continue;
        }

        if (st.frequency === 'one-off') {
            if (st.next_run_date <= today) {
                const entryDate = st.next_run_date;
                const generatedTxnId = `__SCHEDULER_${st.id}_${entryDate}`;
                const isDup = state.expenses.some(e =>
                    e.txnId === generatedTxnId ||
                    (e.date === entryDate &&
                        e.amount === st.amount &&
                        e.category === st.category &&
                        e.note === st.note)
                );

                if (!isDup) {
                    candidateTxns.push({
                        date: entryDate,
                        amount: st.amount,
                        amountExpression: st.amountExpression || '',
                        currency: st.currency || 'INR',
                        category: st.category,
                        txnType: st.txnType,
                        txnMode: st.txnMode,
                        note: st.note,
                        source: 'Schedule',
                        txnId: generatedTxnId,
                        location: st.location || detectedLocation,
                        tag: st.tag || '',
                        scheduleId: st.id,
                        isOneOff: true
                    });
                }

                simulationData.push({
                    scheduleId: st.id,
                    isOneOff: true
                });
            }
            continue;
        }

        // Standard recurring transactions
        let curRunDate = st.next_run_date;
        let curRunCount = st.run_count || 0;
        let curLastRunDate = st.last_run_date;
        let curDisabled = st.disabled;
        let hadDueRuns = false;

        while (curRunDate <= today) {
            hadDueRuns = true;
            const entryDate = curRunDate;
            const generatedTxnId = `__SCHEDULER_${st.id}_${entryDate}`;
            const isDup = state.expenses.some(e =>
                e.txnId === generatedTxnId ||
                (e.date === entryDate &&
                    e.amount === st.amount &&
                    e.category === st.category &&
                    e.note === st.note)
            );

            if (!isDup) {
                candidateTxns.push({
                    date: entryDate,
                    amount: st.amount,
                    amountExpression: st.amountExpression || '',
                    currency: st.currency || 'INR',
                    category: st.category,
                    txnType: st.txnType,
                    txnMode: st.txnMode,
                    note: st.note,
                    source: 'Schedule',
                    txnId: generatedTxnId,
                    location: st.location || detectedLocation,
                    tag: st.tag || '',
                    scheduleId: st.id,
                    isOneOff: false
                });
            }

            curRunCount++;
            curLastRunDate = today;
            curRunDate = calculateNextRunDate(st.frequency, st, entryDate);

            if (st.end_condition === 'enabled') {
                if ((st.end_date && curRunDate > st.end_date) || (st.max_occurrences && curRunCount >= st.max_occurrences)) {
                    curDisabled = true;
                    break;
                }
            } else if (st.end_condition === 'until_date' && st.end_date && curRunDate > st.end_date) {
                curDisabled = true;
                break;
            } else if (st.end_condition === 'after_occurrences' && st.max_occurrences && curRunCount >= st.max_occurrences) {
                curDisabled = true;
                break;
            }

            if (curRunDate <= entryDate) break;
        }

        if (hadDueRuns) {
            simulationData.push({
                scheduleId: st.id,
                isOneOff: false,
                finalNextRunDate: curRunDate,
                finalLastRunDate: curLastRunDate,
                finalRunCount: curRunCount,
                finalDisabled: curDisabled
            });
        }
    }

    if (candidateTxns.length === 0) {
        // If schedules had end conditions reached or duplicate runs bypassed, advance schedules
        if (simulationData.length > 0) {
            await executeScheduledCommit({ approvedCandidates: [], simulationData });
        }
        return false;
    }

    const isSingle = candidateTxns.length === 1;
    const isRecent = isSingle && isWithinLast3Days(candidateTxns[0].date, today);

    // If new is just a single txn in last 3 days (or autoApprove flag is set), silently add it
    if ((isSingle && isRecent) || options.autoApprove) {
        try {
            await executeScheduledCommit({ approvedCandidates: candidateTxns, simulationData });
            toast(`Processed ${candidateTxns.length} scheduled transaction(s)`, 'success');
            return true;
        } catch (e) {
            if (e.message === "CONFLICT_DETECTED") {
                console.warn("Conflict processing scheduled transactions. Cloud has newer data. Waiting for background sync.");
            } else {
                console.error("Failed to upload processed scheduled transactions:", e);
            }
            return false;
        }
    }

    // Else list them with checkboxes to approve before adding
    showScheduledApprovalModal(candidateTxns, simulationData);
    return false;
}

export async function loadHistoricalData() {
    if (state.historicalLoaded) return;

    await populateAvailableFiles();

    const currentYear = new Date().getFullYear();
    let yearsToLoad = [currentYear - 1, currentYear - 2, currentYear + 1].filter(y => !state.loadedYears.has(y));
    
    if (state.availableFiles) {
        yearsToLoad = yearsToLoad.filter(y => state.availableFiles.has(`${y}.csv`));
    }

    const needsNetwork = yearsToLoad.some(y => !isCsvInCache(`${y}.csv`));
    
    if (needsNetwork) {
        showLoader('Fetching historical data...');
    } else if (yearsToLoad.length > 0) {
        const syncInd = document.getElementById('sync-indicator');
        if (syncInd) syncInd.classList.remove('hidden');
    }
    
    const promises = [];

    yearsToLoad.forEach(year => {
        state.loadedYears.add(year);
        promises.push(
            getCsvContent(`${year}.csv`)
                .then(text => {
                    if (!text) return [];
                    const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
                    const rows = parsed.data.map(normalizeRow).filter(r => r !== null);
                    state.trash = (state.trash || []).concat(rows.filter(r => r.deleted));
                    return rows.filter(r => !r.deleted);
                })
                .catch(e => [])
        );
    });

    const results = await Promise.all(promises);
    let loadedCount = 0;
    results.forEach((rows, idx) => {
        if (rows && rows.length > 0) {
            state.expenses = state.expenses.concat(rows);
            loadedCount += rows.length;
        }
    });

    if (loadedCount > 0) {
        state.expenses.sort((a, b) => b.date.localeCompare(a.date));
        if (!isMobileView()) {
            toast(`Loaded ${loadedCount} historical transactions`, 'success');
        }
    } else if (yearsToLoad.length > 0) {
        if (!isMobileView()) {
            toast(`No historical data found`, 'info');
        }
    }

    state.historicalLoaded = true;
    
    if (needsNetwork) {
        hideLoader();
    } else if (yearsToLoad.length > 0) {
        const syncInd = document.getElementById('sync-indicator');
        if (syncInd && !state.cloudSyncInProgress) syncInd.classList.add('hidden');
    }
    
    populateNoteSuggestions();
    
    // Trigger background sync to keep newly loaded historical data fresh
    if (yearsToLoad && yearsToLoad.length > 0) {
        syncCloudDataInBackground(yearsToLoad.map(y => `${y}.csv`));
    }
}

export async function fetchYearCSVIfNeeded(year) {
    if (state.loadedYears.has(year)) return;

    await populateAvailableFiles();
    if (state.availableFiles && !state.availableFiles.has(`${year}.csv`)) {
        state.loadedYears.add(year); // Mark as loaded so we don't keep trying
        return;
    }

    // Add immediately to prevent concurrent fetches for the same year
    state.loadedYears.add(year);

    const needsNetwork = !isCsvInCache(`${year}.csv`);
    if (needsNetwork) {
        showLoader(`Fetching ${year} data...`);
    }

    try {
        const text = await getCsvContent(`${year}.csv`);
        if (text) {
            const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
            const rows = parsed.data.map(normalizeRow).filter(r => r !== null);
            state.trash = (state.trash || []).concat(rows.filter(r => r.deleted));
            const activeRows = rows.filter(r => !r.deleted);
            if (activeRows.length > 0) {
                state.expenses = state.expenses.concat(activeRows);
                state.expenses.sort((a, b) => b.date.localeCompare(a.date));
                populateNoteSuggestions();
                renderAll();
                if (!isMobileView()) {
                    toast(`Loaded ${activeRows.length} transactions for ${year}`, 'success');
                }
            }
        }
    } catch (e) {
        console.warn(`Could not load ${year}.csv`, e);
    } finally {
        if (needsNetwork) hideLoader();
    }
    
    // Trigger background sync to keep newly loaded historical data fresh
    syncCloudDataInBackground([`${year}.csv`]);
}

export async function loadMetadata() {
    try {
        const text = await getCsvContent(`metadata.csv`);
        if (!text) throw new Error('metadata.csv not found');
        const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
        applyMetadataFromParsed(parsed.data);
    } catch (e) {
        console.warn('Could not load metadata.csv, using defaults:', e);
        state.categories = [...DEFAULT_CATEGORIES];
        state.txnModes = [...DEFAULT_TXN_MODES];
        state.txnTypes = ['Expense', 'Refund', 'Income', 'Investment', 'Transfer'];
    }
}

export async function loadLocationsCsv() {
    try {
        const text = await getCsvContent(`location.csv`);
        if (!text) throw new Error('location.csv not found');
        const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
        state.locationsConfig = parseLocationRows(parsed.data);
    } catch (e) {
        console.warn('Could not load location.csv, using empty array:', e);
        state.locationsConfig = [];
    }
}

export function saveToLocalCache(filename, content, hashToSave = null) {
    if (window.Android && window.Android.writeLocalCsv) {
        try {
            if (content !== null && content !== undefined) window.Android.writeLocalCsv(filename, content);
            if (hashToSave) localStorage.setItem(`expman_hash_${filename}`, hashToSave);
        } catch (e) { }
    } else {
        try {
            if (content !== null && content !== undefined) localStorage.setItem(`expman_cache_${filename}`, content);
            if (hashToSave) localStorage.setItem(`expman_hash_${filename}`, hashToSave);
        } catch (e) { /* ignore storage quota errors */ }
    }
}

export function parseScheduledRow(r) {
    const freq = r.Frequency || r.frequency;
    const recWkday = r['Recur Weekday'] || r.recur_weekday;
    return {
        id: r.ID || r.id || Date.now().toString() + Math.random(),
        disabled: String(r.Disabled || r.disabled) === 'true',
        amount: roundAmount(r.Amount !== undefined ? r.Amount : r.amount),
        amountExpression: r['Amount Expression'] || r.amountExpression || '',
        currency: r.Currency || r.currency || 'INR',
        category: r.Category || r.category || '',
        txnType: r['Transaction Type'] || r.txnType || '',
        txnMode: r['Transaction Mode'] || r.txnMode || '',
        note: r.Note || r.note || '',
        frequency: (freq === 'none' || !freq) ? 'one-off' : freq,
        recur_month: parseInt(r['Recur Month'] || r.recur_month),
        recur_day: parseInt(r['Recur Day'] || r.recur_day),
        recur_weekday: String(recWkday).includes('|') ? NaN : parseInt(recWkday),
        recur_weekdays: recWkday ? String(recWkday).split('|').map(Number).filter(n => !isNaN(n)) : [],
        start_date: r['Start Date'] || r.start_date || '',
        last_run_date: r['Last Run Date'] || r.last_run_date || '',
        next_run_date: r['Next Run Date'] || r.next_run_date || '',
        end_condition: r['End Condition'] || r.end_condition || 'never',
        end_date: r['End Date'] || r.end_date || '',
        max_occurrences: (r['Max Occurrences'] || r.max_occurrences) ? parseInt(r['Max Occurrences'] || r.max_occurrences) : NaN,
        run_count: (r['Run Count'] || r.run_count) ? parseInt(r['Run Count'] || r.run_count) : 0,
        location: r.Location || r.location || '',
        tag: r.Tag || r.tag || ''
    };
}

export function parseBalanceRow(r) {
    return {
        id: r.ID || r.id || Date.now().toString() + Math.random(),
        date: r.Date || r.date || '',
        account: r.Account || r.account || '',
        type: r.Type || r.type || '',
        amount: roundAmount(r.Amount !== undefined ? r.Amount : r.amount),
        amountExpression: r['Amount Expression'] || r.amountExpression || ''
    };
}

export function applyMetadataFromParsed(rows) {
    state.categories = rows.filter(r => r.Type === 'Category').map(r => r.Value).filter(Boolean);
    state.txnModes = rows.filter(r => r.Type === 'Transaction Mode').map(r => r.Value).filter(Boolean);
    state.txnTypes = rows.filter(r => r.Type === 'Transaction Type').map(r => r.Value).filter(Boolean);
    if (!state.txnTypes || state.txnTypes.length === 0) state.txnTypes = ['Expense', 'Refund', 'Income', 'Investment', 'Transfer'];

    // Ensure protected default modes (e.g. '👛 Wallet') are present if missing from metadata
    if (state.txnModes && state.txnModes.length > 0) {
        for (const defMode of DEFAULT_TXN_MODES) {
            const cleanDef = stripEmojiPrefix(defMode).toLowerCase();
            if (!state.txnModes.some(tm => stripEmojiPrefix(tm).toLowerCase() === cleanDef)) {
                state.txnModes.push(defMode);
            }
        }
    }
}

export function parseLocationRows(rows) {
    return rows.map(r => ({
        tag: r.tag,
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
        radius: parseInt(r.radius)
    })).filter(loc => loc.tag && !isNaN(loc.lat) && !isNaN(loc.lon) && !isNaN(loc.radius));
}

export function roundAmount(val) {
    const n = typeof val === 'number' ? val : parseFloat(val);
    if (isNaN(n)) return NaN;
    return Math.round(n * 100) / 100;
}

export function amountToStr(amount) {
    const r = roundAmount(amount);
    if (isNaN(r)) return '';
    return r.toFixed(2);
}

export function normalizeRow(row) {
    const amount = roundAmount(row.Amount);
    if (isNaN(amount)) return null;
    return {
        date: row.Date || '',
        amount: amount,
        amountExpression: row['Amount Expression'] || '',
        currency: row.Currency || 'INR',
        category: row.Category || '',
        txnType: row['Transaction Type'] || '',
        txnMode: row['Transaction Mode'] || '',
        note: row.Note || '',
        source: row.Source || '',
        txnId: row['Txn ID'] || '',
        location: row.Location || row.location || '',
        tag: row.Tag || row.tag || '', deleted: String(row.Deleted || '').toLowerCase() === 'true'
    };
}

export function expensesToCSV(data, preserveOrder = false) {
    const header = 'Date,Amount,Amount Expression,Currency,Category,Transaction Type,Transaction Mode,Note,Source,Txn ID,Location,Tag,Deleted';
    const list = Array.isArray(data) ? [...data] : [];
    const sorted = preserveOrder ? list : list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const rows = sorted.map(e => {
        const note = csvEscape(e.note);
        const cat = csvEscape(e.category);
        const txnType = csvEscape(e.txnType);
        const txn = csvEscape(e.txnMode);
        const expr = csvEscape(e.amountExpression || '');
        return `${e.date},${amountToStr(e.amount)},${expr},${e.currency},${cat},${txnType},${txn},${note},${csvEscape(e.source || '')},${csvEscape(e.txnId || '')},${csvEscape(e.location || '')},${csvEscape(e.tag || '')},${e.deleted === true ? 'true' : 'false'}`;
    });
    return header + '\n' + rows.join('\n');
}

export function csvEscape(val) {
    if (!val) return '';
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
}

export function categoriesToCSV() {
    return 'Name\n' + state.categories.join('\n');
}

export function txnModesToCSV() {
    return 'Name\n' + state.txnModes.join('\n');
}

export function txnTypesToCSV() {
    return 'Name\n' + state.txnTypes.join('\n');
}

window.syncCloudDataInBackground = syncCloudDataInBackground;

let activeSyncCount = 0;

export async function syncCloudDataInBackground(specificFiles = null) {
    if (state.cloudSyncInProgress && !specificFiles) {
        console.log('[CloudSync] Skipping — general sync already in progress.');
        return;
    }
    activeSyncCount++;
    state.cloudSyncInProgress = true;
    console.log('[CloudSync] Starting background sync...', specificFiles ? specificFiles : 'General');
    const syncInd = document.getElementById('sync-indicator');
    if (syncInd) syncInd.classList.remove('hidden');

    try {
        let filesToSync = specificFiles;
        if (!filesToSync) {
            filesToSync = ['metadata.csv', 'scheduled_transaction.csv', 'user_settings.json', 'location.csv'];
            
            if (state.loadedYears && state.loadedYears.size > 0) {
                for (const year of state.loadedYears) {
                    filesToSync.push(`${year}.csv`);
                }
            } else {
                const currentYear = new Date().getFullYear();
                filesToSync.push(`${currentYear}.csv`);
            }
            
            if (state.balanceLoaded) filesToSync.push('balance.csv');
            if (state.splitBillsLoaded) filesToSync.push('split_bills.json');
        }

        // Fetch all files from cloud in parallel
        const results = await Promise.allSettled(
            filesToSync.map(async (filename) => {
                const userEmail = getRequiredEmail();
                const filePath = `${userEmail}/${filename}`;

                // Read the cached hash to pass it to getCsvContentFromCloud.
                // This allows the fetcher to return "NOT_MODIFIED" and skip getBytes().
                const knownHash = state.fileHashes[filePath];
                const content = await getCsvContentFromCloud(filename, knownHash);

                return { filename, content };
            })
        );

        let hasChanges = false;

        for (const result of results) {
            if (result.status !== 'fulfilled') continue;
            const { filename, content } = result.value;
            if (!content || content === "NOT_MODIFIED") continue;

            const userEmail = getRequiredEmail();
            const filePath = `${userEmail}/${filename}`;
            const hashToSave = state.fileHashes[filePath] || '';

            // Save fresh cloud data to Android local cache or web cache
            saveToLocalCache(filename, content, hashToSave);

            // Re-parse and update state
            if (filename.endsWith('.csv') && filename !== 'metadata.csv' && filename !== 'scheduled_transaction.csv' && filename !== 'balance.csv' && filename !== 'location.csv') {
                // Year CSV
                const parsed = Papa.parse(content.trim(), { header: true, skipEmptyLines: true });
                const rows = parsed.data.map(normalizeRow).filter(r => r !== null);
                const year = parseInt(filename);

                // Replace existing entries for this year
                state.expenses = state.expenses.filter(e => {
                    const eYear = parseInt(e.date.substring(0, 4));
                    return eYear !== year;
                });
                // Replace this year's trash snapshot too, then only add active rows.
                state.trash = (state.trash || []).filter(e => parseInt((e.date || '').substring(0, 4)) !== year)
                    .concat(rows.filter(r => r.deleted));
                state.expenses = state.expenses.concat(rows.filter(r => !r.deleted));
                hasChanges = true;
            } else if (filename === 'metadata.csv') {
                const parsed = Papa.parse(content.trim(), { header: true, skipEmptyLines: true });
                applyMetadataFromParsed(parsed.data);
                hasChanges = true;
            } else if (filename === 'location.csv') {
                const parsed = Papa.parse(content.trim(), { header: true, skipEmptyLines: true });
                state.locationsConfig = parseLocationRows(parsed.data);
                hasChanges = true;
            } else if (filename === 'scheduled_transaction.csv') {
                const parsed = Papa.parse(content.trim(), { header: true, skipEmptyLines: true });
                state.scheduledTransactions = parsed.data.map(parseScheduledRow).filter(r => !isNaN(r.amount));
                hasChanges = true;
            } else if (filename === 'balance.csv') {
                const parsed = Papa.parse(content.trim(), { header: true, skipEmptyLines: true });
                state.balanceData = parsed.data.map(parseBalanceRow).filter(r => !isNaN(r.amount));
                state.balanceData.sort((a, b) => b.date.localeCompare(a.date));
                hasChanges = true;
            } else if (filename === 'user_settings.json') {
                try {
                    const settings = JSON.parse(content);
                    if (applyUserSettings(settings)) hasChanges = true;
                } catch (e) { }
            } else if (filename === 'split_bills.json') {
                try {
                    const data = JSON.parse(content);
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
                    hasChanges = true;
                } catch (e) { }
            }
        }

        if (hasChanges) {
            state.expenses.sort((a, b) => b.date.localeCompare(a.date));
            populateNoteSuggestions();
            populateLocationSuggestions();
            populateTagSuggestions();
            renderAll();
            console.log('[CloudSync] Background sync complete, UI refreshed.');
        } else {
            console.log('[CloudSync] Background sync complete, no changes.');
        }

        // Check and process scheduled transactions against the latest cloud data
        const processedSchedules = await processScheduledTransactions();
        if (processedSchedules) {
            renderAll();
        }
    } catch (e) {
        console.error('[CloudSync] Background sync failed:', e);
    } finally {
        activeSyncCount = Math.max(0, activeSyncCount - 1);
        if (activeSyncCount === 0) {
            state.cloudSyncInProgress = false;
            const syncInd = document.getElementById('sync-indicator');
            if (syncInd) syncInd.classList.add('hidden');

            // Re-run SMS/Email deduplication & committed transaction enrichment after cloud sync completes and eTags are fresh
            if (typeof window !== 'undefined' && typeof window.recomputePendingSmsTransactions === 'function') {
                window.recomputePendingSmsTransactions();
            }

            // Run trash retention only after cloud CSV sync has settled and ETags are fresh.
            import('./activity.js').then(async ({ loadActivityHistory, cleanupExpiredTrash }) => {
                try { await loadActivityHistory(false); await cleanupExpiredTrash(); }
                catch (error) { console.warn('[Trash] Automatic retention cleanup skipped:', error); }
            });
        }
    }
}

/**
 * Starts a repeating background refresh at the configured interval.
 * No-op when USE_LOCAL_DATA is true (nothing to poll).
 * Each tick is skipped if a sync is already in progress.
 */
export function startBackgroundRefresh() {
    if (USE_LOCAL_DATA) return;

    setInterval(() => {
        syncCloudDataInBackground();
        console.log('[CloudSync] Scheduled background refresh triggered.');
    }, BACKGROUND_REFRESH_INTERVAL_MS);

    console.log(`[CloudSync] Background refresh scheduled every ${BACKGROUND_REFRESH_INTERVAL_MS / 60000} min.`);
}
