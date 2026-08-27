import { ref, uploadString } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getRequiredEmail } from "./auth.js";
import { state } from "../core/state.js";
import { getCsvContent } from "./storage.js";

export function applyUserSettings(settings) {
    if (!settings) return false;
    let localChanged = false;
    if (settings.hideIncome !== undefined && settings.hideIncome !== state.hideIncome) {
        state.hideIncome = settings.hideIncome;
        localStorage.setItem('expman_hide_income', settings.hideIncome ? 'true' : 'false');
        localChanged = true;
    }
    if (settings.hideInvestment !== undefined && settings.hideInvestment !== state.hideInvestment) {
        state.hideInvestment = settings.hideInvestment;
        localStorage.setItem('expman_hide_investment', settings.hideInvestment ? 'true' : 'false');
        localChanged = true;
    }
    if (settings.hideTransfer !== undefined && settings.hideTransfer !== state.hideTransfer) {
        state.hideTransfer = settings.hideTransfer;
        localStorage.setItem('expman_hide_transfer', settings.hideTransfer ? 'true' : 'false');
        localChanged = true;
    }
    if (settings.gdriveConnected !== undefined) {
        const val = settings.gdriveConnected ? 'true' : 'false';
        if (localStorage.getItem('expman_gdrive_connected') !== val) {
            localStorage.setItem('expman_gdrive_connected', val);
            localChanged = true;
        }
    }
    if (settings.gdriveEmail !== undefined) {
        const val = settings.gdriveEmail || '';
        if (localStorage.getItem('expman_gdrive_email') !== val) {
            localStorage.setItem('expman_gdrive_email', val);
            localChanged = true;
        }
    }
    if (settings.gdriveAutoBackup !== undefined) {
        const val = settings.gdriveAutoBackup ? 'true' : 'false';
        if (localStorage.getItem('expman_gdrive_auto_backup') !== val) {
            localStorage.setItem('expman_gdrive_auto_backup', val);
            localChanged = true;
        }
    }
    if (settings.gdriveFrequency !== undefined) {
        if (localStorage.getItem('expman_gdrive_frequency') !== settings.gdriveFrequency) {
            localStorage.setItem('expman_gdrive_frequency', settings.gdriveFrequency);
            localChanged = true;
        }
    }
    if (settings.gdriveRetention !== undefined) {
        if (localStorage.getItem('expman_gdrive_retention') !== settings.gdriveRetention) {
            localStorage.setItem('expman_gdrive_retention', settings.gdriveRetention);
            localChanged = true;
        }
    }
    if (settings.gdriveLastBackup !== undefined) {
        const val = settings.gdriveLastBackup.toString();
        if (localStorage.getItem('expman_gdrive_last_backup') !== val) {
            localStorage.setItem('expman_gdrive_last_backup', val);
            localChanged = true;
        }
    }
    if (settings.gdriveClientId !== undefined) {
        const trimmed = settings.gdriveClientId ? settings.gdriveClientId.trim() : '';
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
    const merged = { ...current, ...updates };
    await saveUserSettings(merged);
    return merged;
}
