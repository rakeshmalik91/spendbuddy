import { updateUserSettings, loadUserSettings } from "./user_settings.js";
import { getUserEmail } from "./auth.js";

/**
 * Checks if Gmail sync features are supported by the current environment (Android WebView).
 */
export function isGmailSupported() {
    return window.Android && typeof window.Android.fetchEmailTransactions === 'function';
}

/**
 * Triggers the Gmail IMAP sync flow natively.
 * @param {string} email The current user's email
 */
export function syncGmail(email) {
    if (isGmailSupported()) {
        window.Android.fetchEmailTransactions(email);
        return true;
    }
    return false;
}

/**
 * Unlinks the saved Gmail IMAP account.
 */
export function unlinkGmail() {
    if (window.Android && typeof window.Android.unlinkImapEmail === 'function') {
        window.Android.unlinkImapEmail();
        deleteGmailCredentialsFromCloud();
        return true;
    }
    return false;
}

/**
 * Returns the currently linked Gmail address, or null if none is linked.
 */
export function getLinkedGmail() {
    if (window.Android && typeof window.Android.getSavedImapEmail === 'function') {
        return window.Android.getSavedImapEmail() || null;
    }
    return null;
}

/**
 * Saves Gmail/IMAP credentials to user_settings.json in Firebase Storage.
 */
export async function saveGmailCredentialsToCloud(email, pass) {
    const userEmail = getUserEmail();
    if (!userEmail) return;

    try {
        await updateUserSettings({
            gmail: { email, pass }
        });
        console.log("Gmail credentials saved to user_settings.json");
    } catch (e) {
        console.error("Failed to save Gmail credentials to user settings", e);
    }
}

/**
 * Loads Gmail/IMAP credentials from user_settings.json and syncs them to the Android app.
 */
export async function loadGmailCredentialsFromCloud() {
    const userEmail = getUserEmail();
    if (!userEmail || !isGmailSupported()) return;

    try {
        const settings = await loadUserSettings();
        if (settings && settings.gmail && settings.gmail.email && settings.gmail.pass) {
            const credentials = settings.gmail;
            const currentEmail = getLinkedGmail();
            const currentPassword = window.Android.getSavedImapPassword ? window.Android.getSavedImapPassword() : "";
            // Only update the Android app if credentials differ from what's already stored locally
            if (currentEmail !== credentials.email || currentPassword !== credentials.pass) {
                window.Android.saveImapCredentials(credentials.email, credentials.pass);
                console.log("Restored Gmail credentials from user settings");
            }
        } else {
            // Automatically upload local credentials to Firebase Storage if they exist locally on the device
            const localEmail = getLinkedGmail();
            const localPassword = window.Android.getSavedImapPassword ? window.Android.getSavedImapPassword() : "";
            if (localEmail && localPassword) {
                console.log("Found local Gmail credentials on device. Syncing them to user settings...");
                await saveGmailCredentialsToCloud(localEmail, localPassword);
            }
        }
    } catch (e) {
        console.log("Error loading Gmail credentials from user settings:", e.message);
    }
}

/**
 * Deletes Gmail/IMAP credentials from user_settings.json in Firebase Storage.
 */
export async function deleteGmailCredentialsFromCloud() {
    const userEmail = getUserEmail();
    if (!userEmail) return;

    try {
        await updateUserSettings({ gmail: null });
        console.log("Gmail credentials deleted from user settings");
    } catch (e) {
        console.log("Failed to delete Gmail credentials from user settings", e.message);
    }
}
