import { getDownloadURL, ref, listAll } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { state } from "../core/state.js";
import { toast, getLocalDateString } from "../utils/helpers.js";
import { showLoader, hideLoader } from "../core/init.js";
import { USE_LOCAL_DATA } from "../../config.js";
import { decryptData } from "../utils/crypto.js";
import { uploadFile } from "./storage.js";
import { uploadString } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getRequiredEmail } from "./auth.js";
import { openModal } from "../ui/modal.js";

/**
 * Exports all user data from Firebase Storage into a single ZIP file.
 */
export async function exportAllDataAsZip() {
    if (USE_LOCAL_DATA) {
        toast('Export not available in local mode.', 'error');
        return;
    }
    
    if (typeof JSZip === 'undefined') {
        toast('JSZip library not loaded.', 'error');
        return;
    }

    try {
        showLoader('Preparing backup...');
        const zip = new JSZip();
        
        const userEmail = getRequiredEmail();
        const folderRef = ref(state.storage, userEmail + '/');
        const result = await listAll(folderRef);

        let fileCount = 0;
        
        for (const itemRef of result.items) {
            try {
                const url = await getDownloadURL(itemRef);
                const res = await fetch(url);
                if (!res.ok) continue;
                
                let content = await res.text();
                
                // Decrypt if it's an encrypted CSV
                if (content.startsWith('ENC:')) {
                    if (state.encryptionKey) {
                        content = await decryptData(state.encryptionKey, content);
                    } else {
                        toast('Error: Cannot decrypt ' + itemRef.name + '. Please unlock encryption first.', 'error');
                        hideLoader();
                        return;
                    }
                }
                
                zip.file(itemRef.name, content);
                fileCount++;
            } catch (err) {
                console.warn(`Failed to process ${itemRef.name}`, err);
            }
        }
        
        if (fileCount === 0) {
            toast('No data found to export.', 'info');
            hideLoader();
            return;
        }

        const filename = `ExpenseIQ_Backup_${getLocalDateString(new Date()).replace(/-/g, '')}.zip`;

        if (window.Android && window.Android.saveBackup) {
            const base64 = await zip.generateAsync({type: "base64"});
            window.Android.saveBackup(base64, filename);
            toast('Backup downloaded successfully!');
        } else {
            const blob = await zip.generateAsync({type: "blob"});
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
            toast('Backup downloaded successfully!');
        }
    } catch (error) {
        console.error('Export failed', error);
        toast('Failed to export data.', 'error');
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
