import { GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_BACKUP_FOLDER } from "../../config.js";
import { generateBackupZip } from "./export.js";
import { toast, getLocalDateString } from "../utils/helpers.js";
import { updateUserSettings, loadUserSettings } from "./user_settings.js";
import { getUserEmail } from "./auth.js";
import { openModal } from "../ui/modal.js";

// Storage Keys
export const STORAGE_KEYS = {
    CONNECTED: 'expman_gdrive_connected',
    TOKEN: 'expman_gdrive_token',
    EXPIRES_AT: 'expman_gdrive_expires_at',
    EMAIL: 'expman_gdrive_email',
    LAST_BACKUP: 'expman_gdrive_last_backup',
    AUTO_BACKUP: 'expman_gdrive_auto_backup',
    FREQUENCY: 'expman_gdrive_frequency',
    RETENTION: 'expman_gdrive_retention',
    CUSTOM_CLIENT_ID: 'expman_gdrive_custom_client_id',
    LAST_ERROR: 'expman_gdrive_last_error',
    LAST_ERROR_TIME: 'expman_gdrive_last_error_time'
};

// Frequency intervals in milliseconds
export const BACKUP_INTERVALS_MS = {
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000
};

// Retention periods in milliseconds
export const RETENTION_THRESHOLDS_MS = {
    '7_days': 7 * 24 * 60 * 60 * 1000,
    '30_days': 30 * 24 * 60 * 60 * 1000,
    '60_days': 60 * 24 * 60 * 60 * 1000,
    '90_days': 90 * 24 * 60 * 60 * 1000,
    '180_days': 180 * 24 * 60 * 60 * 1000,
    '365_days': 365 * 24 * 60 * 60 * 1000
};

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email openid';
let tokenClient = null;

/**
 * Dynamically loads the Google Identity Services (GIS) client script if not already present.
 * @returns {Promise<void>}
 */
export function loadGisScript() {
    return new Promise((resolve, reject) => {
        if (window.google && window.google.accounts && window.google.accounts.oauth2) {
            resolve();
            return;
        }

        const existingScript = document.getElementById('gis-client-script');
        if (existingScript) {
            existingScript.addEventListener('load', () => resolve());
            existingScript.addEventListener('error', (err) => reject(err));
            return;
        }

        const script = document.createElement('script');
        script.id = 'gis-client-script';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = (err) => reject(new Error('Failed to load Google Identity Services SDK'));
        document.head.appendChild(script);
    });
}

/**
 * Gets the active Google Client ID (custom or default).
 */
export function getGoogleClientId() {
    const custom = localStorage.getItem(STORAGE_KEYS.CUSTOM_CLIENT_ID);
    return (custom && custom.trim()) ? custom.trim() : GOOGLE_DRIVE_CLIENT_ID;
}

/**
 * Returns connection state and settings for Google Drive backup.
 */
export function getGoogleDriveConnectionState() {
    const isExplicitlyConnected = localStorage.getItem(STORAGE_KEYS.CONNECTED) === 'true';
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    const expiresAt = parseInt(localStorage.getItem(STORAGE_KEYS.EXPIRES_AT) || '0', 10);
    const savedEmail = localStorage.getItem(STORAGE_KEYS.EMAIL);
    const lastBackup = localStorage.getItem(STORAGE_KEYS.LAST_BACKUP);
    const autoBackup = localStorage.getItem(STORAGE_KEYS.AUTO_BACKUP) === 'true';
    const frequency = localStorage.getItem(STORAGE_KEYS.FREQUENCY) || 'weekly';
    const retention = localStorage.getItem(STORAGE_KEYS.RETENTION) || '90_days';
    const lastError = localStorage.getItem(STORAGE_KEYS.LAST_ERROR) || null;
    const lastErrorTime = localStorage.getItem(STORAGE_KEYS.LAST_ERROR_TIME) ? parseInt(localStorage.getItem(STORAGE_KEYS.LAST_ERROR_TIME), 10) : null;

    const isConnected = isExplicitlyConnected || !!(token && (Date.now() < expiresAt || savedEmail));
    const isTokenExpired = !token || Date.now() >= expiresAt;
    const email = savedEmail || (isConnected ? (getUserEmail() || 'Connected') : '');

    return {
        isConnected,
        isTokenExpired,
        email,
        lastBackup: lastBackup ? new Date(parseInt(lastBackup, 10)).toLocaleString() : null,
        lastBackupTimestamp: lastBackup ? parseInt(lastBackup, 10) : 0,
        autoBackup,
        frequency,
        retention,
        lastError,
        lastErrorTime
    };
}

/**
 * Prompts the user to authorize Google Drive access via GIS OAuth popup.
 * @returns {Promise<string>} Access token
 */
export async function connectGoogleDrive() {
    await loadGisScript();
    const clientId = getGoogleClientId();

    if (!clientId) {
        throw new Error('Google Client ID is missing. Please configure your OAuth Client ID in Settings.');
    }

    return new Promise((resolve, reject) => {
        let isSettled = false;
        const cleanup = (timeoutId) => {
            isSettled = true;
            if (timeoutId) clearTimeout(timeoutId);
        };

        const timeoutId = setTimeout(() => {
            if (!isSettled) {
                cleanup(timeoutId);
                reject(new Error('Google authorization request timed out or was closed.'));
            }
        }, 60000);

        try {
            tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: DRIVE_SCOPE,
                callback: async (tokenResponse) => {
                    cleanup(timeoutId);
                    if (tokenResponse.error) {
                        reject(new Error(tokenResponse.error_description || tokenResponse.error));
                        return;
                    }

                    const accessToken = tokenResponse.access_token;
                    const expiresIn = parseInt(tokenResponse.expires_in || '3599', 10);
                    const expiresAt = Date.now() + (expiresIn * 1000);

                    localStorage.setItem(STORAGE_KEYS.CONNECTED, 'true');
                    localStorage.setItem(STORAGE_KEYS.TOKEN, accessToken);
                    localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, expiresAt.toString());

                    // Fetch user email from userinfo endpoint
                    let userEmail = '';
                    try {
                        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                            headers: { Authorization: `Bearer ${accessToken}` }
                        });
                        if (userInfoRes.ok) {
                            const userInfo = await userInfoRes.json();
                            if (userInfo.email) {
                                userEmail = userInfo.email;
                            }
                        }
                    } catch (err) {
                        console.warn('Could not fetch userinfo from Google', err);
                    }

                    if (!userEmail) {
                        userEmail = getUserEmail() || 'Connected Google Account';
                    }
                    localStorage.setItem(STORAGE_KEYS.EMAIL, userEmail);

                    // Default autoBackup to true, frequency to weekly, retention to 90_days if not set
                    if (localStorage.getItem(STORAGE_KEYS.AUTO_BACKUP) === null) {
                        localStorage.setItem(STORAGE_KEYS.AUTO_BACKUP, 'true');
                    }
                    if (!localStorage.getItem(STORAGE_KEYS.FREQUENCY)) {
                        localStorage.setItem(STORAGE_KEYS.FREQUENCY, 'weekly');
                    }
                    if (!localStorage.getItem(STORAGE_KEYS.RETENTION)) {
                        localStorage.setItem(STORAGE_KEYS.RETENTION, '90_days');
                    }

                    // Sync settings to cloud
                    try {
                        await updateUserSettings({
                            googleDrive: {
                                connected: true,
                                email: userEmail,
                                autoBackup: localStorage.getItem(STORAGE_KEYS.AUTO_BACKUP) === 'true',
                                frequency: localStorage.getItem(STORAGE_KEYS.FREQUENCY),
                                retention: localStorage.getItem(STORAGE_KEYS.RETENTION)
                            }
                        });
                    } catch (e) {
                        console.warn('Failed to sync GDrive settings to cloud', e);
                    }

                    resolve(accessToken);
                },
                error_callback: (err) => {
                    cleanup(timeoutId);
                    reject(new Error(err && (err.message || err.type) ? (err.message || err.type) : 'Google authorization popup closed or cancelled.'));
                }
            });

            tokenClient.requestAccessToken({ prompt: 'consent' });
        } catch (err) {
            cleanup(timeoutId);
            reject(err);
        }
    });
}

/**
 * Disconnects Google Drive and revokes cached access tokens.
 */
export async function disconnectGoogleDrive() {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (token && window.google && window.google.accounts && window.google.accounts.oauth2) {
        try {
            window.google.accounts.oauth2.revoke(token, () => {
                console.log('Google Drive token revoked.');
            });
        } catch (e) {
            console.warn('Error revoking Google Drive token', e);
        }
    }

    localStorage.removeItem(STORAGE_KEYS.CONNECTED);
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.EXPIRES_AT);
    localStorage.removeItem(STORAGE_KEYS.EMAIL);
    localStorage.removeItem(STORAGE_KEYS.AUTO_BACKUP);

    try {
        await updateUserSettings({
            googleDrive: {
                connected: false,
                email: '',
                autoBackup: false
            }
        });
    } catch (e) {
        console.warn('Failed to sync disconnect state to cloud', e);
    }
}

/**
 * Retrieves a valid access token or requests a new one if interactive is true.
 */
export async function getValidAccessToken(interactive = false) {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    const expiresAt = parseInt(localStorage.getItem(STORAGE_KEYS.EXPIRES_AT) || '0', 10);

    // If valid token exists and has > 2 minutes remaining
    if (token && Date.now() < expiresAt - (2 * 60 * 1000)) {
        return token;
    }

    if (interactive) {
        return await connectGoogleDrive();
    }

    // Attempt silent token refresh if user is already connected
    if (localStorage.getItem(STORAGE_KEYS.CONNECTED) === 'true') {
        try {
            await loadGisScript();
            const clientId = getGoogleClientId();
            if (clientId && window.google && window.google.accounts && window.google.accounts.oauth2) {
                return new Promise((resolve) => {
                    const silentClient = window.google.accounts.oauth2.initTokenClient({
                        client_id: clientId,
                        scope: DRIVE_SCOPE,
                        callback: (tokenResponse) => {
                            if (tokenResponse.access_token) {
                                const accessToken = tokenResponse.access_token;
                                const expiresIn = parseInt(tokenResponse.expires_in || '3599', 10);
                                const newExpiresAt = Date.now() + (expiresIn * 1000);
                                localStorage.setItem(STORAGE_KEYS.TOKEN, accessToken);
                                localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, newExpiresAt.toString());
                                resolve(accessToken);
                            } else {
                                resolve(null);
                            }
                        },
                        error_callback: () => resolve(null)
                    });
                    silentClient.requestAccessToken({ prompt: '' });
                });
            }
        } catch (e) {
            console.warn('Silent token refresh failed:', e);
        }
    }

    // Return null if expired and cannot refresh silently
    return null;
}

/**
 * Ensures the 'ExpenseIQ Backups' folder exists in Google Drive and returns its ID.
 * @param {string} accessToken
 * @returns {Promise<string>} Folder ID
 */
export async function ensureBackupFolder(accessToken) {
    const folderName = GOOGLE_DRIVE_BACKUP_FOLDER;
    const query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

    const searchRes = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!searchRes.ok) {
        let errDetails = '';
        try {
            const errJson = await searchRes.json();
            errDetails = errJson.error?.message || '';
        } catch (_) {}

        if (searchRes.status === 403) {
            throw new Error(`Google Drive API (403 Forbidden): ${errDetails || 'Please ensure Google Drive API is enabled in Google Cloud Console: https://console.cloud.google.com/apis/library/drive.googleapis.com'}`);
        }
        throw new Error(`Google Drive folder search failed (${searchRes.status}): ${errDetails || searchRes.statusText}`);
    }

    const data = await searchRes.json();
    if (data.files && data.files.length > 0) {
        return data.files[0].id;
    }

    // Create folder
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder'
        })
    });

    if (!createRes.ok) {
        let errDetails = '';
        try {
            const errJson = await createRes.json();
            errDetails = errJson.error?.message || '';
        } catch (_) {}
        throw new Error(`Failed to create Google Drive folder (${createRes.status}): ${errDetails || createRes.statusText}`);
    }

    const createdFolder = await createRes.json();
    return createdFolder.id;
}

/**
 * Uploads a backup ZIP blob to Google Drive via multipart upload.
 * @param {Blob} blob 
 * @param {string} filename 
 * @param {string} accessToken 
 * @returns {Promise<object>} Upload response
 */
export async function uploadBackupToDrive(blob, filename, accessToken) {
    const folderId = await ensureBackupFolder(accessToken);

    const metadata = {
        name: filename,
        mimeType: 'application/zip',
        parents: [folderId]
    };

    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const closeDelim = "\r\n--" + boundary + "--";

    // Read blob as ArrayBuffer or Base64 for multipart request
    const buffer = await blob.arrayBuffer();

    const multipartRequestBody = new Blob([
        delimiter,
        'Content-Type: application/json; charset=UTF-8\r\n\r\n',
        JSON.stringify(metadata),
        delimiter,
        'Content-Type: application/zip\r\n\r\n',
        buffer,
        closeDelim
    ], { type: `multipart/related; boundary=${boundary}` });

    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartRequestBody
    });

    if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        throw new Error(`Google Drive upload failed: ${uploadRes.status} ${errorText}`);
    }

    return await uploadRes.json();
}

/**
 * Deletes backup files in Google Drive that exceed the configured retention period.
 * Always preserves at least the 3 most recent backup files.
 * @param {string} accessToken
 * @param {string} retentionPolicy - e.g. '7_days', '30_days', '60_days', '90_days', '180_days', '365_days', 'keep_all'
 * @param {number} currentTimestamp - Optional timestamp for testing
 * @returns {Promise<number>} Number of deleted files
 */
export async function cleanupOldBackups(accessToken, retentionPolicy, currentTimestamp = Date.now()) {
    if (!retentionPolicy || retentionPolicy === 'keep_all' || !RETENTION_THRESHOLDS_MS[retentionPolicy]) {
        return 0;
    }

    const maxAgeMs = RETENTION_THRESHOLDS_MS[retentionPolicy];
    const cutoffTime = currentTimestamp - maxAgeMs;

    try {
        const folderId = await ensureBackupFolder(accessToken);
        const query = `'${folderId}' in parents and trashed = false and name contains 'ExpenseIQ_Backup_'`;
        const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime)&orderBy=createdTime desc`;

        const res = await fetch(listUrl, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!res.ok) {
            console.warn('Could not list backups for retention cleanup:', res.statusText);
            return 0;
        }

        const data = await res.json();
        const files = data.files || [];

        // If 3 or fewer backups exist, preserve all of them regardless of age
        if (files.length <= 3) {
            return 0;
        }

        // Always preserve the 3 newest backups (indices 0, 1, 2); evaluate older ones starting at index 3
        const filesToDelete = [];
        for (let i = 3; i < files.length; i++) {
            const file = files[i];
            const fileTime = new Date(file.createdTime).getTime();
            if (fileTime < cutoffTime) {
                filesToDelete.push(file);
            }
        }

        if (filesToDelete.length === 0) {
            return 0;
        }

        // Delete outdated files concurrently
        const deleteResults = await Promise.allSettled(filesToDelete.map(async (file) => {
            try {
                const delRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                if (delRes.ok) {
                    console.log(`[Google Drive Cleanup] Deleted old backup: ${file.name} (${file.id})`);
                    return true;
                }
            } catch (delErr) {
                console.warn(`Failed to delete old backup file ${file.id}:`, delErr);
            }
            return false;
        }));

        const deletedCount = deleteResults.filter(r => r.status === 'fulfilled' && r.value === true).length;
        return deletedCount;
    } catch (err) {
        console.warn('Error during backup retention cleanup:', err);
        return 0;
    }
}

/**
 * Checks if a backup is due based on the last backup timestamp and frequency.
 * @param {number} lastBackupTimestamp
 * @param {string} frequency 'daily' | 'weekly' | 'monthly' | 'manual'
 * @param {number} currentTimestamp (defaults to Date.now())
 * @returns {boolean}
 */
export function isBackupDue(lastBackupTimestamp, frequency, currentTimestamp = Date.now()) {
    if (!frequency || frequency === 'manual') {
        return false;
    }

    const interval = BACKUP_INTERVALS_MS[frequency];
    if (!interval) return false;

    if (!lastBackupTimestamp || lastBackupTimestamp <= 0) {
        return true;
    }

    return (currentTimestamp - lastBackupTimestamp) >= interval;
}

/**
 * Performs a complete backup and uploads to Google Drive.
 * @param {boolean} isAutomated - True if triggered by app launch auto-check
 */
export async function backupToGoogleDrive(isAutomated = false) {
    try {
        const accessToken = await getValidAccessToken(!isAutomated);
        if (!accessToken) {
            const errReason = 'Google Drive account is not connected or authorization expired.';
            localStorage.setItem(STORAGE_KEYS.LAST_ERROR, errReason);
            localStorage.setItem(STORAGE_KEYS.LAST_ERROR_TIME, Date.now().toString());
            if (!isAutomated) {
                toast('Please connect your Google Drive account first.', 'warning');
            }
            return false;
        }

        if (!isAutomated) {
            toast('Preparing and uploading backup to Google Drive...', 'info');
        }

        const { blob, filename } = await generateBackupZip();
        await uploadBackupToDrive(blob, filename, accessToken);

        // Perform automated retention cleanup asynchronously in background without blocking
        const retention = localStorage.getItem(STORAGE_KEYS.RETENTION) || '90_days';
        if (retention !== 'keep_all') {
            cleanupOldBackups(accessToken, retention)
                .then((deletedCount) => {
                    if (deletedCount > 0) {
                        console.log(`[Google Drive Cleanup] Removed ${deletedCount} backup file(s) exceeding retention limit (${retention}).`);
                    }
                })
                .catch((cleanupErr) => {
                    console.warn('[Google Drive Cleanup] Non-fatal retention cleanup error:', cleanupErr);
                });
        }

        const now = Date.now();
        localStorage.setItem(STORAGE_KEYS.LAST_BACKUP, now.toString());
        localStorage.setItem(STORAGE_KEYS.CONNECTED, 'true');
        const email = localStorage.getItem(STORAGE_KEYS.EMAIL) || getUserEmail() || '';
        if (email) localStorage.setItem(STORAGE_KEYS.EMAIL, email);

        localStorage.removeItem(STORAGE_KEYS.LAST_ERROR);
        localStorage.removeItem(STORAGE_KEYS.LAST_ERROR_TIME);

        try {
            await updateUserSettings({
                googleDrive: {
                    lastBackup: now,
                    connected: true,
                    email: email
                }
            });
        } catch (e) {
            console.warn('Could not sync last backup timestamp to cloud', e);
        }

        if (isAutomated) {
            toast('Automatic backup saved to Google Drive', 'info');
        } else {
            toast('Backup uploaded to Google Drive successfully!', 'success');
        }
        return true;
    } catch (error) {
        console.error('Google Drive backup failed:', error);
        const errMsg = error.message || '';
        const isApiDisabled = errMsg.includes('403') || errMsg.includes('not been used in project') || errMsg.includes('disabled') || errMsg.includes('Google Drive API');

        let cleanReason = errMsg || 'Upload failed';
        if (isApiDisabled) {
            cleanReason = 'Google Drive API is not enabled in your Google Cloud project.';
        }
        localStorage.setItem(STORAGE_KEYS.LAST_ERROR, cleanReason);
        localStorage.setItem(STORAGE_KEYS.LAST_ERROR_TIME, Date.now().toString());

        if (!isAutomated) {
            if (isApiDisabled) {
                const enableUrl = getDriveApiEnableUrl(errMsg);
                showEnableDriveApiModal(enableUrl);
            } else {
                toast(cleanReason, 'error');
            }
        }
        return false;
    }
}

/**
 * Resolves the direct project-specific Google Cloud console link to enable the Drive API.
 * @param {string} errMessage
 * @returns {string} Enable API URL
 */
export function getDriveApiEnableUrl(errMessage = '') {
    const urlMatch = errMessage && errMessage.match(/https?:\/\/[^\s"'<>]+/);
    if (urlMatch) {
        return urlMatch[0];
    }
    const clientId = getGoogleClientId() || '';
    const projectNum = clientId.split('-')[0];
    if (/^\d+$/.test(projectNum)) {
        return `https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=${projectNum}`;
    }
    return 'https://console.cloud.google.com/apis/library/drive.googleapis.com';
}

/**
 * Displays a modal with a direct clickable link to enable the Drive API in Google Cloud Console.
 * @param {string} enableUrl
 */
export function showEnableDriveApiModal(enableUrl) {
    openModal({
        title: '☁️ Google Drive API Required',
        message: 'The Google Drive API is not yet enabled for your project in Google Cloud Console.',
        customHtml: `
            <div style="font-size: 0.95rem; line-height: 1.5; color: var(--text-main); margin-bottom: 16px;">
                Before ExpenseIQ can create backups in your Google Drive, the <strong>Google Drive API</strong> must be enabled in your Google Cloud project.
            </div>
            <div style="background: var(--bg-alt); padding: 14px; border-radius: 8px; border: 1px solid var(--border-subtle); margin-bottom: 16px;">
                <ol style="padding-left: 18px; margin: 0; font-size: 0.88rem; line-height: 1.6; color: var(--text-main);">
                    <li>Click the link button below to open Google Cloud Console.</li>
                    <li>Click the blue <strong>Enable</strong> button.</li>
                    <li>Wait ~15 seconds, then return here and click <strong>Retry Backup</strong>.</li>
                </ol>
            </div>
            <div style="text-align: center; margin-bottom: 8px;">
                <a href="${enableUrl}" target="_blank" class="btn btn-primary" style="display: inline-block; padding: 10px 20px; text-decoration: none; font-weight: 600; color: white;">
                    🚀 Open Google Cloud & Enable API ↗
                </a>
            </div>
        `,
        confirmLabel: 'Retry Backup',
        confirmClass: 'btn-primary',
        onConfirm: async () => {
            await backupToGoogleDrive(false);
        }
    });
}

/**
 * Checks on app boot if an automated Google Drive backup is due and runs it silently.
 */
export async function checkAndTriggerAutoBackup() {
    try {
        const state = getGoogleDriveConnectionState();
        if (!state.isConnected || !state.autoBackup) {
            return;
        }

        if (isBackupDue(state.lastBackupTimestamp, state.frequency)) {
            console.log(`[Google Drive Backup] Auto-backup is due (Frequency: ${state.frequency}). Triggering backup...`);
            await backupToGoogleDrive(true);
        }
    } catch (err) {
        console.warn('[Google Drive Backup] Auto-backup check encountered error:', err);
    }
}
