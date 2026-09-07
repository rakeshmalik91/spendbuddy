import { ref, uploadString } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getRequiredEmail } from "./auth.js";
import { state } from "../core/state.js";
import { getCsvContent } from "./storage.js";

export function applyUserSettings(settings) {
    if (!settings) return false;
    let localChanged = false;

    // UI Group (or top-level if present)
    const ui = settings.ui || {};
    if (ui.hideIncome !== undefined && ui.hideIncome !== state.hideIncome) {
        state.hideIncome = ui.hideIncome;
        localStorage.setItem('expman_hide_income', ui.hideIncome ? 'true' : 'false');
        localChanged = true;
    }
    if (ui.hideInvestment !== undefined && ui.hideInvestment !== state.hideInvestment) {
        state.hideInvestment = ui.hideInvestment;
        localStorage.setItem('expman_hide_investment', ui.hideInvestment ? 'true' : 'false');
        localChanged = true;
    }
    if (ui.hideTransfer !== undefined && ui.hideTransfer !== state.hideTransfer) {
        state.hideTransfer = ui.hideTransfer;
        localStorage.setItem('expman_hide_transfer', ui.hideTransfer ? 'true' : 'false');
        localChanged = true;
    }
    if (ui.mergeRefunds !== undefined && ui.mergeRefunds !== state.mergeRefunds) {
        state.mergeRefunds = ui.mergeRefunds;
        localStorage.setItem('expman_merge_refunds', ui.mergeRefunds ? 'true' : 'false');
        localChanged = true;
    }

    // Google Drive Group
    const gdrive = settings.googleDrive || {};
    if (gdrive.connected !== undefined) {
        const val = gdrive.connected ? 'true' : 'false';
        if (localStorage.getItem('expman_gdrive_connected') !== val) {
            localStorage.setItem('expman_gdrive_connected', val);
            localChanged = true;
        }
    }
    if (gdrive.email !== undefined) {
        const val = gdrive.email || '';
        if (localStorage.getItem('expman_gdrive_email') !== val) {
            localStorage.setItem('expman_gdrive_email', val);
            localChanged = true;
        }
    }
    if (gdrive.autoBackup !== undefined) {
        const val = gdrive.autoBackup ? 'true' : 'false';
        if (localStorage.getItem('expman_gdrive_auto_backup') !== val) {
            localStorage.setItem('expman_gdrive_auto_backup', val);
            localChanged = true;
        }
    }
    if (gdrive.frequency !== undefined) {
        if (localStorage.getItem('expman_gdrive_frequency') !== gdrive.frequency) {
            localStorage.setItem('expman_gdrive_frequency', gdrive.frequency);
            localChanged = true;
        }
    }
    if (gdrive.retention !== undefined) {
        if (localStorage.getItem('expman_gdrive_retention') !== gdrive.retention) {
            localStorage.setItem('expman_gdrive_retention', gdrive.retention);
            localChanged = true;
        }
    }
    if (gdrive.lastBackup !== undefined) {
        const val = gdrive.lastBackup ? gdrive.lastBackup.toString() : '';
        if (localStorage.getItem('expman_gdrive_last_backup') !== val) {
            if (val) {
                localStorage.setItem('expman_gdrive_last_backup', val);
            } else {
                localStorage.removeItem('expman_gdrive_last_backup');
            }
            localChanged = true;
        }
    }
    if (gdrive.clientId !== undefined) {
        const trimmed = gdrive.clientId ? gdrive.clientId.trim() : '';
        const current = localStorage.getItem('expman_gdrive_custom_client_id') || '';
        if (current !== trimmed) {
            if (trimmed) {
                localStorage.setItem('expman_gdrive_custom_client_id', trimmed);
            } else {
                localStorage.removeItem('expman_gdrive_custom_client_id');
            }
            localChanged = true;
        }
    }

    // Gmail Group
    if (settings.gmail !== undefined && window.Android && typeof window.Android.saveImapCredentials === 'function') {
        const gmail = settings.gmail || {};
        if (gmail.email && gmail.pass) {
            const currentEmail = window.Android.getSavedImapEmail ? window.Android.getSavedImapEmail() : '';
            const currentPassword = window.Android.getSavedImapPassword ? window.Android.getSavedImapPassword() : '';
            if (currentEmail !== gmail.email || currentPassword !== gmail.pass) {
                window.Android.saveImapCredentials(gmail.email, gmail.pass);
                console.log("Restored Gmail credentials from user settings");
            }
        }
    }

    return localChanged;
}

export async function loadUserSettings() {
    try {
        // We use getCsvContent instead of a direct Firebase getDownloadURL() 
        // to take advantage of the local cache + md5Hash optimization flow,
        // preventing duplicate network calls on startup.
        const content = await getCsvContent('user_settings.json');
        if (content) {
            return JSON.parse(content);
        }
    } catch (e) {
        // Ignore if file doesn't exist or is invalid JSON
    }
    return {};
}

async function saveUserSettings(settings) {
    const userEmail = getRequiredEmail();
    const fileRef = ref(state.storage, `${userEmail}/user_settings.json`);
    await uploadString(fileRef, JSON.stringify(settings));
}

export async function updateUserSettings(updates) {
    const current = await loadUserSettings();
    const merged = {};

    if (current.encryptionEnabled !== undefined || updates.encryptionEnabled !== undefined) {
        merged.encryptionEnabled = updates.encryptionEnabled !== undefined ? updates.encryptionEnabled : current.encryptionEnabled;
    }

    // Merge UI
    if (current.ui || updates.ui) {
        merged.ui = {
            ...(current.ui || {}),
            ...(updates.ui || {})
        };
    }

    // Merge Google Drive
    if (current.googleDrive || updates.googleDrive) {
        merged.googleDrive = {
            ...(current.googleDrive || {}),
            ...(updates.googleDrive || {})
        };
    }

    // Merge Gmail
    if (updates.gmail !== undefined) {
        if (updates.gmail !== null) {
            merged.gmail = { ...(current.gmail || {}), ...updates.gmail };
        }
    } else if (current.gmail) {
        merged.gmail = current.gmail;
    }

    await saveUserSettings(merged);
    return merged;
}
