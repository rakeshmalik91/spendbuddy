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
