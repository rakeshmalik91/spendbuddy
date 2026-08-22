import { ref, uploadString, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { state } from "../core/state.js";
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
 * Saves Gmail/IMAP credentials to Firebase Storage as plain-text JSON.
 */
export async function saveGmailCredentialsToCloud(email, pass) {
    const userEmail = getUserEmail();
    if (!userEmail) return;

    try {
        const fileRef = ref(state.storage, `${userEmail}/gmail_credentials.json`);
        const content = JSON.stringify({ email, pass });
        await uploadString(fileRef, content);
        console.log("Gmail credentials saved to Firebase Storage (plain text)");
    } catch (e) {
        console.error("Failed to save Gmail credentials to Firebase Storage", e);
    }
}

/**
 * Loads Gmail/IMAP credentials from Firebase Storage and syncs them to the Android app.
 */
export async function loadGmailCredentialsFromCloud() {
    const userEmail = getUserEmail();
    if (!userEmail || !isGmailSupported()) return;

    try {
        const fileRef = ref(state.storage, `${userEmail}/gmail_credentials.json`);
        const url = await getDownloadURL(fileRef);
        const res = await fetch(url);
        if (res.ok) {
            const content = await res.text();
            const credentials = JSON.parse(content);
            if (credentials && credentials.email && credentials.pass) {
                const currentEmail = getLinkedGmail();
                const currentPassword = window.Android.getSavedImapPassword ? window.Android.getSavedImapPassword() : "";
                // Only update the Android app if credentials differ from what's already stored locally
                if (currentEmail !== credentials.email || currentPassword !== credentials.pass) {
                    window.Android.saveImapCredentials(credentials.email, credentials.pass);
                    console.log("Restored Gmail credentials from Firebase Storage");
                }
            }
        }
    } catch (e) {
        console.log("No Gmail credentials found in Firebase Storage, or access error:", e.message);
        // Automatically upload local credentials to Firebase Storage if they exist locally on the device
        const localEmail = getLinkedGmail();
        const localPassword = window.Android.getSavedImapPassword ? window.Android.getSavedImapPassword() : "";
        if (localEmail && localPassword) {
            console.log("Found local Gmail credentials on device. Syncing them to Firebase Storage...");
            await saveGmailCredentialsToCloud(localEmail, localPassword);
        }
    }
}

/**
 * Deletes Gmail/IMAP credentials from Firebase Storage.
 */
export async function deleteGmailCredentialsFromCloud() {
    const userEmail = getUserEmail();
    if (!userEmail) return;

    try {
        const fileRef = ref(state.storage, `${userEmail}/gmail_credentials.json`);
        await deleteObject(fileRef);
        console.log("Gmail credentials deleted from Firebase Storage");
    } catch (e) {
        console.log("Failed to delete Gmail credentials from Firebase Storage or not found", e.message);
    }
}
