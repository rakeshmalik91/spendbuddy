import { openModal } from "./modal.js";
import { populateFormDropdowns } from "./form_dropdowns.js";
import { showLoader, $$, hideLoader, $ } from "../core/init.js";
import { toast, escHtml, stripEmojiPrefix, resetLocationPermissionDenied } from "../utils/helpers.js";
import { saveMetadataCSV, bulkUpdateCSVs, saveLocationCSV } from "./form.js";
import { populateFilterOptions } from "./filters.js";
import { exportAllDataAsZip, restoreDataFromZip } from "../services/export.js";
import { getGoogleDriveConnectionState, connectGoogleDrive, disconnectGoogleDrive, backupToGoogleDrive, getDriveApiEnableUrl, STORAGE_KEYS } from "../services/google_drive.js";
import { state } from "../core/state.js";
import { PROTECTED_CATEGORIES, PROTECTED_TXN_MODES } from "../../config.js";
import { isGmailSupported, syncGmail, unlinkGmail, getLinkedGmail } from "../services/gmail.js";
import { updateUserSettings, loadUserSettings } from "../services/user_settings.js";

/* ══════════════ SETTINGS — CATEGORY & TXN TYPE CRUD ══════════════ */

// Returns true if a category name matches one of the protected defaults.
export function isCategoryProtected(name) {
    const stripped = stripEmojiPrefix(name);
    return PROTECTED_CATEGORIES.some(p => p.toLowerCase() === stripped.toLowerCase());
}

// Returns true if a txn mode name matches one of the protected defaults.
export function isTxnModeProtected(name) {
    const stripped = stripEmojiPrefix(name);
    return PROTECTED_TXN_MODES.some(p => p.toLowerCase() === stripped.toLowerCase());
}

// Drag and Drop reordering logic via SortableJS
export function initSortable(tbodySelector, dragType) {
    const tbody = $(tbodySelector);
    if (!tbody) return;

    if (tbody.sortableInstance) {
        tbody.sortableInstance.destroy();
    }

    tbody.sortableInstance = new Sortable(tbody, {
        animation: 250,
        handle: '.drag-handle',
        ghostClass: 'sortable-ghost',
        onEnd: async function (evt) {
            if (evt.oldIndex === evt.newIndex) return;

            showLoader('Syncing new order...');
            let success = false;

            const rows = [...tbody.querySelectorAll('tr[data-index]')];
            const newOrderIndices = rows.map(row => parseInt(row.dataset.index, 10));

            if (dragType === 'category') {
                const newArr = newOrderIndices.map(idx => state.categories[idx]);
                state.categories.length = 0;
                state.categories.push(...newArr);
                try { await saveMetadataCSV(); success = true; } catch (err) { console.error(err); }
            } else if (dragType === 'txnmode') {
                const newArr = newOrderIndices.map(idx => state.txnModes[idx]);
                state.txnModes.length = 0;
                state.txnModes.push(...newArr);
                try { await saveMetadataCSV(); success = true; } catch (err) { console.error(err); }
            }

            hideLoader();
            if (success) {
                toast('Order saved to cloud', 'success');
            } else {
                toast('Failed to save order to cloud', 'error');
            }
            onSettingsChanged();
        }
    });
}

export const updateEnableApiLink = () => {
    const gdriveEnableApiLink = $('#gdrive-enable-api-link');
    if (gdriveEnableApiLink) {
        gdriveEnableApiLink.href = getDriveApiEnableUrl();
    }
};

export function updateGoogleDriveUI() {
    const driveState = getGoogleDriveConnectionState();
    const statusLabel = $('#gdrive-status-label');
    const statusEmail = $('#gdrive-status-email');
    const btnConnect = $('#btn-gdrive-connect');
    const btnDisconnect = $('#btn-gdrive-disconnect');
    const settingsPanel = $('#gdrive-settings-panel');
    const toggleAuto = $('#toggle-gdrive-auto');
    const selectFreq = $('#select-gdrive-frequency');
    const lastBackupText = $('#gdrive-last-backup-text');
    const errorBanner = $('#gdrive-error-banner');

    const btnBackupNow = $('#btn-gdrive-backup-now');
    if (btnBackupNow) {
        btnBackupNow.disabled = !driveState.isConnected;
        if (!driveState.isConnected) {
            btnBackupNow.title = 'Please connect Google Drive first';
            btnBackupNow.style.opacity = '0.5';
            btnBackupNow.style.cursor = 'not-allowed';
        } else {
            btnBackupNow.title = '';
            btnBackupNow.style.opacity = '1';
            btnBackupNow.style.cursor = 'pointer';
        }
    }

    const freqRow = $('#gdrive-frequency-row');
    const retentionRow = $('#gdrive-retention-row');

    if (statusLabel) {
        if (driveState.isConnected) {
            statusLabel.textContent = 'Google Account Connected';
            if (statusEmail) statusEmail.textContent = driveState.email || 'Connected';
            if (btnConnect) btnConnect.style.display = 'none';
            if (btnDisconnect) btnDisconnect.style.display = 'inline-block';
            if (settingsPanel) settingsPanel.style.display = 'block';
            if (toggleAuto) toggleAuto.checked = driveState.autoBackup;
            const selectRetention = $('#select-gdrive-retention');
            if (selectFreq) {
                selectFreq.value = driveState.frequency;
                selectFreq.disabled = !driveState.autoBackup;
            }
            if (selectRetention) {
                selectRetention.value = driveState.retention || '90_days';
                selectRetention.disabled = !driveState.autoBackup;
            }
            if (freqRow) {
                if (driveState.autoBackup) {
                    freqRow.style.opacity = '1';
                    freqRow.style.pointerEvents = 'auto';
                } else {
                    freqRow.style.opacity = '0.45';
                    freqRow.style.pointerEvents = 'none';
                }
            }
            if (retentionRow) {
                if (driveState.autoBackup) {
                    retentionRow.style.opacity = '1';
                    retentionRow.style.pointerEvents = 'auto';
                } else {
                    retentionRow.style.opacity = '0.45';
                    retentionRow.style.pointerEvents = 'none';
                }
            }
            if (lastBackupText) {
                lastBackupText.textContent = driveState.lastBackup 
                    ? `Last successful backup: ${driveState.lastBackup}` 
                    : 'Last backup: Never';
            }
        } else {
            statusLabel.textContent = 'Google Account';
            if (statusEmail) statusEmail.textContent = 'Not connected';
            if (btnConnect) btnConnect.style.display = 'inline-block';
            if (btnDisconnect) btnDisconnect.style.display = 'none';
            if (settingsPanel) settingsPanel.style.display = 'none';
            if (lastBackupText) {
                lastBackupText.textContent = 'Last backup: Never';
            }
        }
    }

    if (errorBanner) {
        if (driveState.lastError) {
            const timeStr = driveState.lastErrorTime 
                ? ` (${new Date(driveState.lastErrorTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` 
                : '';
            errorBanner.innerHTML = `<div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; padding: 8px 12px; color: var(--amount-negative); line-height: 1.4; text-align: left; font-size: 0.82rem;">
                <span style="font-weight: 600;">⚠️ Last Backup Failed${timeStr}:</span><br>
                <span>${escHtml(driveState.lastError)}</span>
            </div>`;
            errorBanner.style.display = 'block';
        } else {
            errorBanner.style.display = 'none';
            errorBanner.innerHTML = '';
        }
    }

    const inputClient = $('#input-gdrive-client-id');
    if (inputClient && document.activeElement !== inputClient) {
        inputClient.value = localStorage.getItem(STORAGE_KEYS.CUSTOM_CLIENT_ID) || '';
    }

    const gdriveOriginCode = $('#gdrive-current-origin');
    if (gdriveOriginCode && typeof window !== 'undefined' && window.location && window.location.origin) {
        gdriveOriginCode.textContent = window.location.origin;
    }

    updateEnableApiLink();
}

export function setupSettings() {
    // Add category
    $('#btn-add-category').addEventListener('click', async () => {
        const input = $('#new-category-input');
        const name = input.value.trim();
        if (!name) return;
        if (state.categories.includes(name)) { toast('Category already exists', 'error'); return; }

        const btn = $('#btn-add-category');
        const origText = btn.textContent;
        btn.textContent = '...';
        btn.disabled = true;

        try {
            state.categories.push(name);
            await saveMetadataCSV();
            input.value = '';
            toast(`Category "${name}" added`, 'success');
            onSettingsChanged();
        } catch (err) {
            console.error(err);
            state.categories.pop();
            toast('Failed to save to cloud', 'error');
        } finally {
            btn.textContent = origText;
            btn.disabled = false;
        }
    });
    $('#new-category-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); $('#btn-add-category').click(); }
    });

    // Add txn type
    $('#btn-add-txnmode').addEventListener('click', async () => {
        const input = $('#new-txnmode-input');
        const name = input.value.trim();
        if (!name) return;
        if (state.txnModes.includes(name)) { toast('Transaction type already exists', 'error'); return; }

        const btn = $('#btn-add-txnmode');
        const origText = btn.textContent;
        btn.textContent = '...';
        btn.disabled = true;

        try {
            state.txnModes.push(name);
            await saveMetadataCSV();
            input.value = '';
            toast(`Transaction type "${name}" added`, 'success');
            onSettingsChanged();
        } catch (err) {
            console.error(err);
            state.txnModes.pop();
            toast('Failed to save to cloud', 'error');
        } finally {
            btn.textContent = origText;
            btn.disabled = false;
        }
    });
    $('#new-txnmode-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); $('#btn-add-txnmode').click(); }
    });


    const btnGmail = $('#btn-setup-gmail');
    if (btnGmail) {
        btnGmail.addEventListener('click', () => {
            if (localStorage.getItem('expman_disable_email_sync')) {
                toast('Email syncing is temporarily disabled. Please enable it in the sync settings below.', 'error');
                return;
            }
            if (isGmailSupported()) {
                const email = getUserEmail() || '';
                syncGmail(email);
            } else {
                toast('This feature is only available within the Android App', 'error');
            }
        });
    }

    const btnUnlink = $('#btn-unlink-gmail');
    if (btnUnlink) {
        btnUnlink.addEventListener('click', () => {
            if (unlinkGmail()) {
                updateAccountView();
                toast('Gmail account unlinked', 'info');
            }
        });
    }

    const toggleSms = $('#toggle-sms-sync');
    if (toggleSms) {
        toggleSms.addEventListener('change', (e) => {
            if (e.target.checked) {
                localStorage.removeItem('expman_disable_sms_sync');
                toast('SMS syncing enabled', 'success');
            } else {
                localStorage.setItem('expman_disable_sms_sync', 'true');
                toast('SMS syncing disabled', 'info');
            }
        });
    }

    const toggleEmail = $('#toggle-email-sync');
    if (toggleEmail) {
        toggleEmail.addEventListener('change', (e) => {
            if (e.target.checked) {
                localStorage.removeItem('expman_disable_email_sync');
                toast('Email syncing enabled', 'success');
            } else {
                localStorage.setItem('expman_disable_email_sync', 'true');
                toast('Email syncing disabled', 'info');
            }
        });
    }

    const btnExportData = $('#btn-export-data');
    if (btnExportData) {
        btnExportData.addEventListener('click', async () => {
            await exportAllDataAsZip();
        });
    }

    const btnRestoreData = $('#btn-restore-data');
    const inputRestoreZip = $('#input-restore-zip');
    if (btnRestoreData && inputRestoreZip) {
        btnRestoreData.addEventListener('click', () => {
            inputRestoreZip.click();
        });

        inputRestoreZip.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await restoreDataFromZip(file);
            }
            e.target.value = ''; // Reset input
        });
    }

    // Initialize custom Google Client ID input and current origin
    const inputGdriveClientId = $('#input-gdrive-client-id');
    const gdriveOriginCode = $('#gdrive-current-origin');
    const btnSaveGdriveClientId = $('#btn-save-gdrive-client-id');

    if (gdriveOriginCode && typeof window !== 'undefined' && window.location) {
        gdriveOriginCode.textContent = window.location.origin;
    }

    if (inputGdriveClientId) {
        inputGdriveClientId.value = localStorage.getItem(STORAGE_KEYS.CUSTOM_CLIENT_ID) || '';
    }

    updateGoogleDriveUI();

    if (gdriveOriginCode && typeof window !== 'undefined' && window.location) {
        gdriveOriginCode.textContent = window.location.origin;
    }

    if (inputGdriveClientId) {
        inputGdriveClientId.value = localStorage.getItem(STORAGE_KEYS.CUSTOM_CLIENT_ID) || '';
    }

    updateEnableApiLink();

    if (btnSaveGdriveClientId && inputGdriveClientId) {
        btnSaveGdriveClientId.addEventListener('click', async () => {
            const val = inputGdriveClientId.value.trim();
            if (val) {
                localStorage.setItem(STORAGE_KEYS.CUSTOM_CLIENT_ID, val);
                try {
                    await updateUserSettings({ gdriveClientId: val });
                } catch (e) {
                    console.warn('Failed to sync gdriveClientId to cloud', e);
                }
                toast('Google OAuth Client ID saved & synced!', 'success');
            } else {
                localStorage.removeItem(STORAGE_KEYS.CUSTOM_CLIENT_ID);
                try {
                    await updateUserSettings({ gdriveClientId: '' });
                } catch (e) {
                    console.warn('Failed to sync gdriveClientId removal to cloud', e);
                }
                toast('Custom Client ID cleared.', 'info');
            }
            updateEnableApiLink();
        });
    }

    updateGoogleDriveUI();

    const btnGdriveConnect = $('#btn-gdrive-connect');
    if (btnGdriveConnect) {
        btnGdriveConnect.addEventListener('click', async () => {
            try {
                btnGdriveConnect.disabled = true;
                btnGdriveConnect.textContent = 'Connecting...';
                await connectGoogleDrive();
                toast('Connected to Google Drive successfully!', 'success');
                updateGoogleDriveUI();
            } catch (err) {
                console.error('Google Drive connection failed:', err);
                toast(err.message || 'Failed to connect to Google Drive', 'error');
            } finally {
                btnGdriveConnect.disabled = false;
                btnGdriveConnect.textContent = 'Connect';
            }
        });
    }

    const btnGdriveDisconnect = $('#btn-gdrive-disconnect');
    if (btnGdriveDisconnect) {
        btnGdriveDisconnect.addEventListener('click', async () => {
            await disconnectGoogleDrive();
            toast('Google Drive disconnected', 'info');
            updateGoogleDriveUI();
        });
    }

    const toggleGdriveAuto = $('#toggle-gdrive-auto');
    if (toggleGdriveAuto) {
        toggleGdriveAuto.addEventListener('change', async (e) => {
            localStorage.setItem(STORAGE_KEYS.AUTO_BACKUP, e.target.checked ? 'true' : 'false');
            try {
                await updateUserSettings({ gdriveAutoBackup: e.target.checked });
            } catch (err) {
                console.warn('Failed to sync gdriveAutoBackup to cloud', err);
            }
            updateGoogleDriveUI();
            toast(e.target.checked ? 'Auto-backup enabled on app launch' : 'Auto-backup disabled', 'info');
        });
    }

    const selectGdriveFreq = $('#select-gdrive-frequency');
    if (selectGdriveFreq) {
        selectGdriveFreq.addEventListener('change', async (e) => {
            localStorage.setItem(STORAGE_KEYS.FREQUENCY, e.target.value);
            try {
                await updateUserSettings({ gdriveFrequency: e.target.value });
            } catch (err) {
                console.warn('Failed to sync gdriveFrequency to cloud', err);
            }
            toast(`Backup frequency set to ${e.target.value}`, 'info');
        });
    }

    const selectGdriveRetention = $('#select-gdrive-retention');
    if (selectGdriveRetention) {
        selectGdriveRetention.addEventListener('change', async (e) => {
            localStorage.setItem(STORAGE_KEYS.RETENTION, e.target.value);
            try {
                await updateUserSettings({ gdriveRetention: e.target.value });
            } catch (err) {
                console.warn('Failed to sync gdriveRetention to cloud', err);
            }
            toast('Backup retention policy updated', 'info');
        });
    }

    const btnGdriveBackupNow = $('#btn-gdrive-backup-now');
    if (btnGdriveBackupNow) {
        btnGdriveBackupNow.addEventListener('click', async () => {
            btnGdriveBackupNow.disabled = true;
            btnGdriveBackupNow.innerHTML = '<span>⏳</span> Backing up to Google Drive...';
            try {
                await backupToGoogleDrive(false);
            } catch (err) {
                console.error(err);
                toast(err.message || 'Backup failed', 'error');
            } finally {
                btnGdriveBackupNow.disabled = false;
                btnGdriveBackupNow.innerHTML = '<span>☁️</span> Backup Now to Google Drive';
                updateGoogleDriveUI();
            }
        });
    }


    const toggleHideIncome = $('#toggle-hide-income');
    if (toggleHideIncome) {
        toggleHideIncome.checked = state.hideIncome;
        toggleHideIncome.addEventListener('change', async (e) => {
            state.hideIncome = e.target.checked;
            localStorage.setItem('expman_hide_income', e.target.checked ? 'true' : 'false');
            try { await updateUserSettings({ hideIncome: state.hideIncome }); } catch(err) { console.error('Failed to sync hideIncome to cloud', err); }
            toast(e.target.checked ? 'Income data hidden' : 'Income data visible', 'info');
            onSettingsChanged();
            if (window.updateDashboardUI) window.updateDashboardUI(); // Force dashboard update if it exists
        });
    }

    const toggleHideInvestment = $('#toggle-hide-investment');
    if (toggleHideInvestment) {
        toggleHideInvestment.checked = state.hideInvestment;
        toggleHideInvestment.addEventListener('change', async (e) => {
            state.hideInvestment = e.target.checked;
            localStorage.setItem('expman_hide_investment', e.target.checked ? 'true' : 'false');
            try { await updateUserSettings({ hideInvestment: state.hideInvestment }); } catch(err) { console.error('Failed to sync hideInvestment to cloud', err); }
            toast(e.target.checked ? 'Investment data hidden' : 'Investment data visible', 'info');
            onSettingsChanged();
            if (window.updateDashboardUI) window.updateDashboardUI();
        });
    }

    const toggleHideTransfer = $('#toggle-hide-transfer');
    if (toggleHideTransfer) {
        toggleHideTransfer.checked = state.hideTransfer;
        toggleHideTransfer.addEventListener('change', async (e) => {
            state.hideTransfer = e.target.checked;
            localStorage.setItem('expman_hide_transfer', e.target.checked ? 'true' : 'false');
            try { await updateUserSettings({ hideTransfer: state.hideTransfer }); } catch(err) { console.error('Failed to sync hideTransfer to cloud', err); }
            toast(e.target.checked ? 'Transfer data hidden' : 'Transfer data visible', 'info');
            onSettingsChanged();
            if (window.updateDashboardUI) window.updateDashboardUI();
        });
    }

    updateAccountView();
}

export function updateAccountView() {
    const savedEmail = getLinkedGmail();
    const btnSetup = $('#btn-setup-gmail');
    const btnUnlink = $('#btn-unlink-gmail');
    const linkedText = $('#gmail-linked-text');
    const linkedEmail = $('#gmail-linked-email');

    if (btnSetup && btnUnlink && linkedText && linkedEmail) {
        if (savedEmail) {
            btnSetup.textContent = 'Sync Gmail IMAP';
            btnUnlink.style.display = 'inline-block';
            linkedText.style.display = 'block';
            linkedEmail.textContent = savedEmail;
        } else {
            btnSetup.textContent = 'Setup / Sync Gmail IMAP';
            btnUnlink.style.display = 'none';
            linkedText.style.display = 'none';
            linkedEmail.textContent = '';
        }
    }

    const toggleSms = $('#toggle-sms-sync');
    if (toggleSms) {
        toggleSms.checked = !localStorage.getItem('expman_disable_sms_sync');
    }

    const toggleEmail = $('#toggle-email-sync');
    if (toggleEmail) {
        toggleEmail.checked = !localStorage.getItem('expman_disable_email_sync');
    }
}
window.updateAccountView = updateAccountView;

export function onSettingsChanged() {
    populateFormDropdowns();
    populateFilterOptions();
    renderSettings();
}

export function renderSettings() {
    updateGoogleDriveUI();
    // Categories table
    const catTbody = $('#category-tbody');
    catTbody.innerHTML = state.categories.map((cat, i) => {
        const locked = isCategoryProtected(cat);
        return `
        <tr data-type="category" data-index="${i}">
            <td><span class="drag-handle" style="color: var(--text-muted); margin-right: 8px; cursor: grab; padding: 4px;">☰</span> ${escHtml(cat)}</td>
            <td>
                <div class="row-actions">
                    ${locked
                ? '<span class="row-btn protected-badge" title="Built-in (cannot edit or delete)">🔒</span>'
                : `<button class="row-btn" onclick="editCategory(${i})" title="Rename">✏️</button>
                           <button class="row-btn delete" onclick="deleteCategory(${i})" title="Delete">🗑️</button>`
            }
                </div>
            </td>
        </tr>`;
    }).join('');

    // Txn types table
    const txnTbody = $('#txnmode-tbody');
    txnTbody.innerHTML = state.txnModes.map((t, i) => {
        const locked = isTxnModeProtected(t);
        return `
        <tr data-type="txnmode" data-index="${i}">
            <td><span class="drag-handle" style="color: var(--text-muted); margin-right: 8px; cursor: grab; padding: 4px;">☰</span> ${escHtml(t)}</td>
            <td>
                <div class="row-actions">
                    ${locked
                ? '<span class="row-btn protected-badge" title="Built-in (cannot edit or delete)">🔒</span>'
                : `<button class="row-btn" onclick="editTxnMode(${i})" title="Rename">✏️</button>
                           <button class="row-btn delete" onclick="deleteTxnMode(${i})" title="Delete">🗑️</button>`
            }
                </div>
            </td>
        </tr>`;
    }).join('');

    // Locations card list
    const locList = $('#location-list');
    if (locList) {
        // Collect all unique locations from expenses and count them
        const locCounts = {};
        state.expenses.forEach(e => {
            if (e.location) {
                const locStr = e.location.trim();
                if (locStr) {
                    locCounts[locStr] = (locCounts[locStr] || 0) + 1;
                }
            }
        });

        // Union of configured and used locations
        const configuredTags = state.locationsConfig ? state.locationsConfig.map(l => l.tag) : [];
        const allTags = new Set([...Object.keys(locCounts), ...configuredTags]);
        const sortedTags = Array.from(allTags).sort((a, b) => a.localeCompare(b));

        if (sortedTags.length === 0) {
            locList.innerHTML = `<p style="text-align: center; color: var(--text-muted); font-style: italic; padding: 20px 0;">No locations configured or used.</p>`;
        } else {
            locList.innerHTML = sortedTags.map((tag) => {
                const count = locCounts[tag] || 0;
                const configIdx = state.locationsConfig ? state.locationsConfig.findIndex(l => l.tag === tag) : -1;
                const isConfigured = configIdx !== -1;
                const config = isConfigured ? state.locationsConfig[configIdx] : null;

                const coordsText = isConfigured
                    ? `${config.lat}, ${config.lon}, ${config.radius}m`
                    : 'Not configured';

                const coordsStyle = isConfigured
                    ? 'color: var(--text-dim);'
                    : 'color: var(--text-muted); font-style: italic;';

                return `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; background: rgba(255, 255, 255, 0.03); border-radius: 10px; border: 1px solid var(--border); flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 16px; flex: 1; flex-wrap: wrap; min-width: 0;">
                        <div style="font-weight: 600; color: var(--text-primary); flex: 0 0 120px; min-width: 120px;">
                            ${escHtml(tag)} <span style="color: var(--text-dim); font-weight: 400; font-size: 0.85rem;">(${count})</span>
                        </div>
                        <button data-tag="${escHtml(tag)}" onclick="editLocation(this.getAttribute('data-tag'))" 
                            style="background: none; border: none; cursor: pointer; padding: 6px 10px; border-radius: 8px; font-size: 0.85rem; ${coordsStyle} display: flex; align-items: center; gap: 4px; transition: background 0.15s; flex: 1; min-width: 200px; justify-content: flex-start; text-align: left;"
                            onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background='none'"
                            title="Edit location">
                            📍<span style="font-size: 0.82rem; word-break: break-word;">${coordsText}</span>
                        </button>
                    </div>
                    ${isConfigured ? `<button onclick="deleteLocation(${configIdx})" 
                        style="background: none; border: none; cursor: pointer; padding: 6px 8px; border-radius: 8px; font-size: 1rem; transition: background 0.15s; flex-shrink: 0;"
                        onmouseover="this.style.background='rgba(239,68,68,0.15)'" onmouseout="this.style.background='none'"
                        title="Delete">🗑️</button>` : `<div style="width: 32px; flex-shrink: 0;"></div>`}
                </div>`;
            }).join('');
        }
    }

    initSortable('#category-tbody', 'category');
    initSortable('#txnmode-tbody', 'txnmode');
}

// ── Category CRUD ──

export function editCategory(idx) {
    const oldName = state.categories[idx];
    if (isCategoryProtected(oldName)) { toast('This is a built-in category and cannot be renamed', 'error'); return; }
    openModal({
        title: 'Rename Category',
        message: `Rename "${oldName}" to:`,
        confirmLabel: 'Rename',
        confirmClass: 'btn-primary',
        showInput: true,
        inputValue: oldName,
        onConfirm: async () => {
            const newName = $('#modal-edit-input').value.trim();
            if (!newName || newName === oldName) return;
            if (state.categories.includes(newName)) { toast('Category already exists', 'error'); return; }

            showLoader('Bulk updating all records...');
            state.expenses.forEach(e => {
                if (e.category === oldName) {
                    e.category = newName;
                }
            });
            state.categories[idx] = newName;

            try {
                await bulkUpdateCSVs('category', oldName, newName);
                await saveMetadataCSV();
                hideLoader();
                toast(`Renamed "${oldName}" → "${newName}"`, 'success');
            } catch (err) {
                hideLoader();
                console.error(err);
                toast('Failed to save changes to cloud', 'error');
            }
            onSettingsChanged();
        }
    });
}

export function deleteCategory(idx) {
    const name = state.categories[idx];
    if (isCategoryProtected(name)) { toast('This is a built-in category and cannot be deleted', 'error'); return; }
    const usedCount = state.expenses.filter(e => e.category === name).length;
    const availableOptions = state.categories.filter((c, i) => i !== idx);

    if (usedCount > 0 && availableOptions.length === 0) {
        availableOptions.push('Others');
    }

    openModal({
        title: 'Delete Category?',
        message: `Delete "${name}"?${usedCount > 0 ? ` It is used in ${usedCount} transaction(s). Select a replacement:` : ''}`,
        confirmLabel: 'Delete',
        confirmClass: 'btn-danger',
        showSelect: usedCount > 0,
        selectOptions: usedCount > 0 ? availableOptions : [],
        onConfirm: async () => {
            const fallback = usedCount > 0 ? $('#modal-select-input').value : null;

            showLoader('Bulk updating all records...');
            state.expenses.forEach(e => {
                if (e.category === name) {
                    e.category = fallback;
                }
            });
            state.categories.splice(idx, 1);
            if (fallback && !state.categories.includes(fallback)) state.categories.push(fallback);

            try {
                await bulkUpdateCSVs('category', name, fallback);
                await saveMetadataCSV();
                hideLoader();
                toast(`Category "${name}" deleted`, 'info');
            } catch (err) {
                hideLoader();
                console.error(err);
                toast('Failed to save changes to cloud', 'error');
            }
            onSettingsChanged();
        }
    });
}

// ── Transaction Mode CRUD ──

export function editTxnMode(idx) {
    const oldName = state.txnModes[idx];
    if (isTxnModeProtected(oldName)) { toast('This is a built-in transaction mode and cannot be renamed', 'error'); return; }
    openModal({
        title: 'Rename Transaction Mode',
        message: `Rename "${oldName}" to:`,
        confirmLabel: 'Rename',
        confirmClass: 'btn-primary',
        showInput: true,
        inputValue: oldName,
        onConfirm: async () => {
            const newName = $('#modal-edit-input').value.trim();
            if (!newName || newName === oldName) return;
            if (state.txnModes.includes(newName)) { toast('Transaction type already exists', 'error'); return; }

            showLoader('Bulk updating all records...');
            state.expenses.forEach(e => {
                if (e.txnMode === oldName) {
                    e.txnMode = newName;
                }
            });
            state.txnModes[idx] = newName;

            try {
                await bulkUpdateCSVs('txnmode', oldName, newName);
                await saveMetadataCSV();
                hideLoader();
                toast(`Renamed "${oldName}" → "${newName}"`, 'success');
            } catch (err) {
                hideLoader();
                console.error(err);
                toast('Failed to save changes to cloud', 'error');
            }
            onSettingsChanged();
        }
    });
}

export function deleteTxnMode(idx) {
    const name = state.txnModes[idx];
    if (isTxnModeProtected(name)) { toast('This is a built-in transaction mode and cannot be deleted', 'error'); return; }
    const usedCount = state.expenses.filter(e => e.txnMode === name).length;
    const availableOptions = state.txnModes.filter((c, i) => i !== idx);

    if (usedCount > 0 && availableOptions.length === 0) {
        availableOptions.push('Cash');
    }

    openModal({
        title: 'Delete Transaction Mode?',
        message: `Delete "${name}"?${usedCount > 0 ? ` It is used in ${usedCount} transaction(s). Select a replacement:` : ''}`,
        confirmLabel: 'Delete',
        confirmClass: 'btn-danger',
        showSelect: usedCount > 0,
        selectOptions: usedCount > 0 ? availableOptions : [],
        onConfirm: async () => {
            const fallback = usedCount > 0 ? $('#modal-select-input').value : null;

            showLoader('Bulk updating all records...');
            state.expenses.forEach(e => {
                if (e.txnMode === name) {
                    e.txnMode = fallback;
                }
            });
            state.txnModes.splice(idx, 1);
            if (fallback && !state.txnModes.includes(fallback)) state.txnModes.push(fallback);

            try {
                await bulkUpdateCSVs('txnmode', name, fallback);
                await saveMetadataCSV();
                hideLoader();
                toast(`Transaction type "${name}" deleted`, 'info');
            } catch (err) {
                hideLoader();
                console.error(err);
                toast('Failed to save changes to cloud', 'error');
            }
            onSettingsChanged();
        }
    });
}

// ── Map state globals
let _mapInstance = null;
let _mapMarker = null;
let _mapCircle = null;
let _mapEdgeMarker = null;
let _mapSaveCallback = null;

/**
 * Opens the full-screen map location picker.
 * @param {string} tag - The location tag (may be empty for brand-new locations)
 */
export function editLocation(tag) {
    if (!state.locationsConfig) state.locationsConfig = [];
    const configIdx = state.locationsConfig.findIndex(l => l.tag === tag);
    const isNew = configIdx === -1;
    const loc = isNew ? { tag: tag || '', lat: null, lon: null, radius: 500 } : { ...state.locationsConfig[configIdx] };

    const backdrop = $('#map-picker-backdrop');
    const tagInput = $('#map-picker-tag');
    const radiusInput = $('#map-picker-radius');
    const latDisplay = $('#map-picker-lat-display');
    const lonDisplay = $('#map-picker-lon-display');
    const titleEl = $('#map-picker-title');

    // Populate controls
    tagInput.value = loc.tag;
    tagInput.disabled = !!loc.tag; // lock tag for existing names
    tagInput.style.opacity = loc.tag ? '0.7' : '1';
    radiusInput.value = loc.radius || 500;
    titleEl.textContent = isNew ? (loc.tag ? `Configure "${loc.tag}"` : 'Add Location') : `Edit "${loc.tag}"`;

    // Show backdrop + popup
    backdrop.style.display = 'flex';
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
    backdrop.onclick = (e) => {
        if (e.target === backdrop) closeMapPicker();
    };

    // Default center: configured coords, or a sensible default (will be overridden by GPS)
    const defaultLat = (loc.lat != null && loc.lat !== '') ? parseFloat(loc.lat) : 28.4595;
    const defaultLon = (loc.lon != null && loc.lon !== '') ? parseFloat(loc.lon) : 77.0266;
    const hasCoords = loc.lat != null && loc.lat !== '';

    // Initialize map (destroy previous if exists)
    if (_mapInstance) {
        _mapInstance.remove();
        _mapInstance = null;
    }

    // Small delay so the container has layout dimensions
    setTimeout(() => {
        _mapInstance = L.map('map-picker-container').setView([defaultLat, defaultLon], hasCoords ? 14 : 12);

        // Dark-themed tile layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> © <a href="https://carto.com/">CARTO</a>',
            maxZoom: 19
        }).addTo(_mapInstance);

        // Helper: get lat/lng at a given distance (meters) east of center
        const getDestinationEast = (lat, lon, distance) => {
            const earthRadius = 6378137;
            const dLon = distance / (earthRadius * Math.cos(Math.PI * lat / 180));
            return [lat, lon + (dLon * 180 / Math.PI)];
        };

        // Helper: update marker + circle at given coords
        const placeMarker = (lat, lon) => {
            const radius = parseInt(radiusInput.value, 10) || 500;
            if (_mapMarker) {
                _mapMarker.setLatLng([lat, lon]);
            } else {
                _mapMarker = L.marker([lat, lon], { draggable: true }).addTo(_mapInstance);
                // Allow dragging the center marker
                _mapMarker.on('drag', () => {
                    const pos = _mapMarker.getLatLng();
                    if (_mapCircle) _mapCircle.setLatLng(pos);
                    if (_mapEdgeMarker) {
                        const r = parseInt(radiusInput.value, 10) || 500;
                        _mapEdgeMarker.setLatLng(getDestinationEast(pos.lat, pos.lng, r));
                    }
                    latDisplay.textContent = pos.lat.toFixed(6);
                    lonDisplay.textContent = pos.lng.toFixed(6);
                });
                _mapMarker.on('dragend', () => {
                    const pos = _mapMarker.getLatLng();
                    placeMarker(pos.lat, pos.lng);
                });
            }

            if (_mapCircle) {
                _mapCircle.setLatLng([lat, lon]).setRadius(radius);
            } else {
                _mapCircle = L.circle([lat, lon], {
                    radius: radius,
                    color: '#6366f1',
                    fillColor: '#6366f1',
                    fillOpacity: 0.15,
                    weight: 2
                }).addTo(_mapInstance);
            }

            // Edge marker for resizing
            const edgePos = getDestinationEast(lat, lon, radius);
            if (_mapEdgeMarker) {
                _mapEdgeMarker.setLatLng(edgePos);
            } else {
                const resizeIcon = L.divIcon({
                    html: '<div style="background: white; border: 2px solid #6366f1; border-radius: 50%; width: 12px; height: 12px; cursor: ew-resize; box-shadow: 0 1px 4px rgba(0,0,0,0.3);"></div>',
                    className: '',
                    iconSize: [12, 12],
                    iconAnchor: [6, 6]
                });
                _mapEdgeMarker = L.marker(edgePos, { draggable: true, icon: resizeIcon }).addTo(_mapInstance);
                _mapEdgeMarker.on('drag', () => {
                    const center = _mapMarker.getLatLng();
                    const edge = _mapEdgeMarker.getLatLng();
                    import('../utils/helpers.js').then(({ getDistance }) => {
                        const newRadius = Math.round(getDistance(center.lat, center.lng, edge.lat, edge.lng));
                        if (newRadius >= 50 && newRadius <= 50000) {
                            radiusInput.value = newRadius;
                            if (_mapCircle) _mapCircle.setRadius(newRadius);
                        }
                    });
                });
                _mapEdgeMarker.on('dragend', () => {
                    const center = _mapMarker.getLatLng();
                    const edge = _mapEdgeMarker.getLatLng();
                    import('../utils/helpers.js').then(({ getDistance }) => {
                        let newRadius = Math.round(getDistance(center.lat, center.lng, edge.lat, edge.lng));
                        newRadius = Math.max(50, Math.min(newRadius, 50000));
                        radiusInput.value = newRadius;
                        placeMarker(center.lat, center.lng);
                    });
                });
            }

            latDisplay.textContent = lat.toFixed(6);
            lonDisplay.textContent = lon.toFixed(6);
        };

        // Place initial marker if we have coords
        if (hasCoords) {
            placeMarker(defaultLat, defaultLon);
        }

        // Click on map to place marker
        _mapInstance.on('click', (e) => {
            placeMarker(e.latlng.lat, e.latlng.lng);
        });

        // Radius input updates circle live
        radiusInput.addEventListener('input', () => {
            if (_mapCircle) {
                const r = parseInt(radiusInput.value, 10) || 500;
                _mapCircle.setRadius(r);
                if (_mapMarker && _mapEdgeMarker) {
                    const pos = _mapMarker.getLatLng();
                    _mapEdgeMarker.setLatLng(getDestinationEast(pos.lat, pos.lng, r));
                }
            }
        });

        // Scroll wheel on radius input to resize
        radiusInput.addEventListener('wheel', (e) => {
            e.preventDefault();
            let r = parseInt(radiusInput.value, 10) || 500;
            const step = e.shiftKey ? 500 : 50; // Shift for faster scroll
            if (e.deltaY < 0) {
                r += step;
            } else {
                r -= step;
            }
            r = Math.max(50, Math.min(r, 50000));
            radiusInput.value = r;
            radiusInput.dispatchEvent(new Event('input'));
        });

        // GPS button: fly to current position
        $('#map-picker-gps').onclick = () => {
            resetLocationPermissionDenied();
            if (!navigator.geolocation && !(window.Android && window.Android.requestLocation)) {
                toast('Geolocation not supported', 'error');
                return;
            }
            const btn = $('#map-picker-gps');
            btn.disabled = true;
            btn.textContent = '⏳ Locating...';
            const handleSuccess = (lat, lon) => {
                _mapInstance.flyTo([lat, lon], 15);
                placeMarker(lat, lon);
                btn.disabled = false;
                btn.textContent = '📍 My Location';
                toast('GPS location found', 'success');
            };
            const handleError = (err) => {
                console.warn('Geolocation error:', err);
                btn.disabled = false;
                btn.textContent = '📍 My Location';
                toast('Failed to get GPS location', 'error');
            };

            if (window.Android && window.Android.requestLocation) {
                window.onAndroidLocationReceived = (lat, lon) => {
                    handleSuccess(lat, lon);
                    delete window.onAndroidLocationReceived;
                    delete window.onAndroidLocationError;
                };
                window.onAndroidLocationError = (msg) => {
                    handleError({ message: msg });
                    delete window.onAndroidLocationReceived;
                    delete window.onAndroidLocationError;
                };
                window.Android.requestLocation();
            } else {
                navigator.geolocation.getCurrentPosition(
                    (pos) => handleSuccess(pos.coords.latitude, pos.coords.longitude),
                    handleError,
                    { timeout: 10000, maximumAge: 0 }
                );
            }
        };

        // If no coords yet, auto-trigger GPS to center the map
        if (!hasCoords) {
            $('#map-picker-gps').click();
        }

        // Search logic using Nominatim API
        const searchInput = $('#map-picker-search');
        const searchBtn = $('#map-picker-search-btn');
        if (searchInput && searchBtn) {
            const doSearch = async () => {
                const query = searchInput.value.trim();
                if (!query) return;
                
                searchBtn.disabled = true;
                searchBtn.textContent = '⏳...';
                try {
                    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
                    const data = await response.json();
                    if (data && data.length > 0) {
                        const lat = parseFloat(data[0].lat);
                        const lon = parseFloat(data[0].lon);
                        _mapInstance.flyTo([lat, lon], 14);
                        placeMarker(lat, lon);
                        toast('Location found', 'success');
                    } else {
                        toast('Location not found', 'error');
                    }
                } catch (e) {
                    console.error('Geocoding error:', e);
                    toast('Search failed', 'error');
                } finally {
                    searchBtn.disabled = false;
                    searchBtn.textContent = '🔍 Search';
                }
            };
            
            searchBtn.onclick = doSearch;
            searchInput.onkeydown = (e) => {
                if (e.key === 'Enter') doSearch();
            };
        }
    }, 50);

    // Save handler
    _mapSaveCallback = async () => {
        const finalTag = tagInput.value.trim();
        if (!finalTag) { toast('Tag is required', 'error'); return; }
        if (!_mapMarker) { toast('Tap the map to select a location', 'error'); return; }

        const pos = _mapMarker.getLatLng();
        const lat = parseFloat(pos.lat.toFixed(6));
        const lon = parseFloat(pos.lng.toFixed(6));
        const radius = parseInt(radiusInput.value, 10);
        if (isNaN(radius) || radius <= 0) { toast('Valid radius > 0 required', 'error'); return; }
        const existingIdx = state.locationsConfig.findIndex(l => l.tag === finalTag);

        try {
            const config = state.locationsConfig;
            if (existingIdx >= 0) {
                config[existingIdx] = { tag: finalTag, lat, lon, radius };
            } else {
                config.push({ tag: finalTag, lat, lon, radius });
            }
            
            // Close picker and update UI immediately
            closeMapPicker();
            onSettingsChanged();

            // Save in background without full-screen loader
            toast(`Saving location "${finalTag}"...`, 'info');
            await saveLocationCSV();
            toast(`Location "${finalTag}" ${existingIdx >= 0 ? 'updated' : 'configured'}`, 'success');
        } catch (err) {
            console.error(err);
            if (existingIdx < 0) state.locationsConfig.pop();
            toast('Failed to save location', 'error');
            onSettingsChanged(); // Revert UI
        }
    };

    // Wire up buttons (replace handlers to avoid duplicate listeners)
    $('#map-picker-save').onclick = () => { if (_mapSaveCallback) _mapSaveCallback(); };
    $('#map-picker-cancel').onclick = closeMapPicker;
}

function closeMapPicker() {
    const backdrop = $('#map-picker-backdrop');
    backdrop.style.display = 'none';
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
    if (_mapInstance) {
        _mapInstance.remove();
        _mapInstance = null;
    }
    _mapMarker = null;
    _mapCircle = null;
    _mapEdgeMarker = null;
    _mapSaveCallback = null;
}

/**
 * Opens map picker for adding a brand-new location (no pre-existing tag).
 */
export function addNewLocation() {
    editLocation('');
}
window.addNewLocation = addNewLocation;
window.editLocation = editLocation;

export function deleteLocation(idx) {
    const loc = state.locationsConfig[idx];
    openModal({
        title: 'Delete Location?',
        message: `Are you sure you want to delete the configuration for "${loc.tag}"? (This will not delete existing transactions)`,
        confirmLabel: 'Delete',
        confirmClass: 'btn-danger',
        onConfirm: async () => {
            showLoader('Deleting location...');
            state.locationsConfig.splice(idx, 1);
            try {
                await saveLocationCSV();
                hideLoader();
                toast(`Location "${loc.tag}" deleted`, 'info');
                onSettingsChanged();
            } catch (err) {
                hideLoader();
                console.error(err);
                toast('Failed to save changes to cloud', 'error');
            }
        }
    });
}
window.deleteLocation = deleteLocation;

export function getDaySeparatorHTML(dateStr, dataset, totalCols = 7, selectedIndices = null) {
    if (!dateStr || !dataset) return `<tr class="day-separator"><td colspan="${totalCols}"></td></tr>`;
    // Only count Expense & Refund in the day total — Income/Investment/Transfer are excluded
    const dayBase = dataset.filter(x => x.date === dateStr && (!x.txnType || x.txnType === 'Expense' || x.txnType === 'Refund'));
    const dayAmount = dayBase.reduce((sum, x) => sum + x.amount, 0);
    const colorClass = dayAmount >= 0 ? 'amount-positive' : 'amount-negative';
    const sign = dayAmount >= 0 ? '' : '+';

    if (totalCols === 7) {
        const dayAllItems = dataset.filter(x => x.date === dateStr);
        const dayIndices = dayAllItems.map(item => state.expenses.indexOf(item)).filter(i => i >= 0);
        const selCount = selectedIndices ? dayIndices.filter(i => selectedIndices.has(i)).length : 0;
        const isChecked = dayIndices.length > 0 && selCount === dayIndices.length;
        const isIndet = selCount > 0 && selCount < dayIndices.length;

        return `<tr class="day-separator">
            <td class="col-batch-select hide-on-mobile" style="text-align: center;">
                <input type="checkbox" class="batch-select-checkbox batch-select-day" data-date="${dateStr}" ${isChecked ? 'checked' : ''} ${isIndet ? 'data-indeterminate="true"' : ''} onclick="event.stopPropagation(); window.toggleDaySelection('${dateStr}', this.checked);">
            </td>
            <td class="day-separator-empty" colspan="3"></td>
            <td class="day-separator-total">
                <span class="${colorClass}"><span class="amount-main"><span class="amount-sign">${sign ? sign : '&nbsp;'}</span><span class="amount-symbol">₹</span><span class="amount-val">${Math.abs(dayAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span></span>
            </td>
            <td class="day-separator-empty" colspan="2"></td>
        </tr>`;
    }

    const colsAfter = totalCols - 4; // 3 columns before Amount, 1 for Amount, remaining after
    return `<tr class="day-separator">
        <td class="day-separator-empty" colspan="3"></td>
        <td class="day-separator-total">
            <span class="${colorClass}"><span class="amount-main"><span class="amount-sign">${sign ? sign : '&nbsp;'}</span><span class="amount-symbol">₹</span><span class="amount-val">${Math.abs(dayAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span></span>
        </td>
        <td class="day-separator-empty" colspan="${colsAfter}"></td>
    </tr>`;
}

