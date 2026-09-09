import { getDownloadURL, ref, listAll } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { state } from "../core/state.js";
import { toast, getLocalDateString } from "../utils/helpers.js";
import { showLoader, hideLoader } from "../core/init.js";
import { USE_LOCAL_DATA } from "../../config.js";
import { decryptData } from "../utils/crypto.js";
import { uploadFile, expensesToCSV } from "./storage.js";
import { uploadString } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getRequiredEmail } from "./auth.js";
import { openModal } from "../ui/modal.js";
import { getFilteredExpenses } from "../ui/filters.js";

/**
 * Triggers a file download across Android WebViews and desktop/mobile web browsers.
 * @param {Blob} blob 
 * @param {string} filename 
 */
export function downloadBlob(blob, filename) {
    if (window.Android && window.Android.saveBackup) {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
            const base64data = reader.result ? reader.result.split(',')[1] : '';
            window.Android.saveBackup(base64data, filename);
        };
    } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
}

/**
 * Exports currently filtered transactions to a CSV file.
 * @param {Array|null} transactions Optional transactions array (defaults to getFilteredExpenses())
 * @returns {boolean} Whether the export succeeded
 */
export function exportFilteredTransactionsToCSV(transactions = null) {
    const list = transactions !== null ? transactions : getFilteredExpenses();
    if (!list || list.length === 0) {
        toast('No transactions to export', 'warning');
        return false;
    }

    // Sort matching active table sort order
    const sorted = [...list].sort((a, b) => {
        let cmp = 0;
        if (state.sortCol === 'date') cmp = (a.date || '').localeCompare(b.date || '');
        else if (state.sortCol === 'amount') cmp = (a.amount || 0) - (b.amount || 0);
        return state.sortAsc ? cmp : -cmp;
    });

    const csvContent = expensesToCSV(sorted, true);
    const dateStr = getLocalDateString(new Date()).replace(/-/g, '');
    const filename = `ExpenseIQ_Transactions_${dateStr}.csv`;

    // Prepend UTF-8 BOM so Excel and spreadsheet tools decode special characters correctly
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, filename);

    toast(`Exported ${sorted.length} transaction${sorted.length === 1 ? '' : 's'} to CSV`, 'success');
    return true;
}

/**
 * Generates a ZIP blob containing all user data from Firebase Storage.
 * @returns {Promise<{blob: Blob, base64: string, filename: string, fileCount: number}>}
 */
export async function generateBackupZip() {
    if (USE_LOCAL_DATA) {
        throw new Error('Export not available in local mode.');
    }
    
    if (typeof JSZip === 'undefined') {
        throw new Error('JSZip library not loaded.');
    }

    const zip = new JSZip();
    const userEmail = getRequiredEmail();
    const folderRef = ref(state.storage, userEmail + '/');
    const result = await listAll(folderRef);

    let fileCount = 0;

    // Fetch and process all files concurrently
    await Promise.all(result.items.map(async (itemRef) => {
        try {
            const url = await getDownloadURL(itemRef);
            const res = await fetch(url);
            if (!res.ok) return;

            let content = await res.text();

            // Decrypt if it's an encrypted CSV
            if (content.startsWith('ENC:')) {
                if (state.encryptionKey) {
                    content = await decryptData(state.encryptionKey, content);
                } else {
                    throw new Error('Cannot decrypt ' + itemRef.name + '. Please unlock encryption first.');
                }
            }

            zip.file(itemRef.name, content);
            fileCount++;
        } catch (err) {
            console.warn(`Failed to process ${itemRef.name}`, err);
        }
    }));

    if (fileCount === 0) {
        throw new Error('No data found to export.');
    }

    const filename = `ExpenseIQ_Backup_${getLocalDateString(new Date()).replace(/-/g, '')}.zip`;
    const blob = await zip.generateAsync({ type: "blob" });

    return { blob, filename, fileCount };
}

/**
 * Exports all user data from Firebase Storage into a single ZIP file.
 */
export async function exportAllDataAsZip() {
    try {
        showLoader('Preparing backup...');
        const { blob, filename } = await generateBackupZip();
        downloadBlob(blob, filename);
        toast('Backup downloaded successfully!');
    } catch (error) {
        console.error('Export failed', error);
        toast(error.message || 'Failed to export data.', 'error');
    } finally {
        hideLoader();
    }
}


/**
 * Restores all user data from a selected ZIP file.
 */
export async function restoreDataFromZip(file) {
    if (USE_LOCAL_DATA) {
        toast('Restore not available in local mode.', 'error');
        return;
    }
    
    if (typeof JSZip === 'undefined') {
        toast('JSZip library not loaded.', 'error');
        return;
    }

    if (!file.name.toLowerCase().endsWith('.zip')) {
        toast('Please select a valid ZIP backup file.', 'error');
        return;
    }

    try {
        showLoader('Validating backup...');
        const zip = new JSZip();
        await zip.loadAsync(file);

        const filesToUpload = [];
        let hasValidFile = false;
        
        for (const [filename, zipEntry] of Object.entries(zip.files)) {
            if (zipEntry.dir) continue;
            
            const content = await zipEntry.async("text");
            const basename = filename.split('/').pop();

            // Validate that it's an expected file
            const isYearCSV = /^\d{4}\.csv$/.test(basename);
            if (isYearCSV || basename === 'metadata.csv' || basename === 'user_settings.json' || basename === 'scheduled_transaction.csv' || basename === 'balance.csv' || basename === 'location.csv') {
                hasValidFile = true;
                
                // For CSVs, do a basic parse check
                if (basename.endsWith('.csv') && typeof Papa !== 'undefined') {
                    const parsed = Papa.parse(content.trim(), { header: true });
                    if (parsed.errors.length > 0 && parsed.data.length === 0) {
                        toast(`Invalid CSV format in ${basename}`, 'error');
                        hideLoader();
                        return;
                    }
                }
            }

            filesToUpload.push({ basename, content });
        }

        if (!hasValidFile || filesToUpload.length === 0) {
            toast('Invalid backup file. No ExpenseIQ data found.', 'error');
            hideLoader();
            return;
        }

        hideLoader();

        openModal({
            title: 'Restore Backup',
            message: 'Are you sure you want to restore this backup? This will overwrite your existing cloud data and this action cannot be undone.',
            confirmLabel: 'Restore Data',
            confirmClass: 'btn-danger',
            onConfirm: async () => {
                try {
                    showLoader('Restoring data...');
                    const userEmail = getRequiredEmail();

                    for (const f of filesToUpload) {
                        const fileRef = ref(state.storage, `${userEmail}/${f.basename}`);
                        if (f.basename.endsWith('.csv')) {
                            // uploadFile encrypts the content if encryption is enabled
                            await uploadFile(fileRef, f.content);
                        } else {
                            // For non-csv files (e.g. user_settings.json), upload directly without encryption
                            await uploadString(fileRef, f.content);
                        }
                    }

                    toast('Backup restored successfully! Refreshing...', 'success');
                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                } catch (error) {
                    console.error('Restore failed', error);
                    toast('Failed to restore data.', 'error');
                } finally {
                    hideLoader();
                }
            }
        });

    } catch (error) {
        console.error('Validation failed', error);
        toast('Failed to validate backup file.', 'error');
        hideLoader();
    }
}
