import { state } from "../core/state.js";
import { openModal } from "../ui/modal.js";
import { showLoader, hideLoader, $ } from "../core/init.js";
import { toast, validatePasswordStrength } from "../utils/helpers.js";
import { deriveKey } from "../utils/crypto.js";
import { reEncryptAllCloudData } from "./storage.js";
import { updateUserSettings } from "./user_settings.js";
import { verifyPassword, changeUserPassword } from "./auth.js";
import { getDownloadURL, ref } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

export async function getEncryptionStatus(email) {
    try {
        const url = await getDownloadURL(ref(state.storage, email + '/user_settings.json'));
        const res = await fetch(url);
        if (res.ok) {
            const settings = await res.json();
            return settings.encryptionEnabled === true;
        }
    } catch (e) {
        console.log('Could not check encryption status:', e);
    }
    return false;
}

export async function checkEncryptionAndUnlock(onUnlockSuccess) {
    let encryptionEnabled = localStorage.getItem('expman_encryption_enabled') === 'true';
    
    if (localStorage.getItem('expman_encryption_enabled') === null) {
        const { loadUserSettings } = await import('./user_settings.js');
        const settings = await loadUserSettings();
        encryptionEnabled = !!settings.encryptionEnabled;
        localStorage.setItem('expman_encryption_enabled', encryptionEnabled ? 'true' : 'false');
    } else {
        // Fetch in background to update cache for next time
        import('./user_settings.js').then(({ loadUserSettings }) => {
            loadUserSettings().then(settings => {
                localStorage.setItem('expman_encryption_enabled', !!settings.encryptionEnabled ? 'true' : 'false');
            });
        });
    }

    if (encryptionEnabled) {
        state.encryptionEnabled = true;
        if (!state.encryptionKey) {
            hideLoader();
            document.getElementById('unlock-overlay').style.display = 'flex';
            setTimeout(() => document.getElementById('app-unlock-password').focus(), 50);
            return false;
        }
    }

    await onUnlockSuccess();
    return true;
}

export function setupUnlockForm(onUnlockSuccess) {
    const unlockForm = document.getElementById('unlock-form');
    if (!unlockForm) return;

    unlockForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pwd = document.getElementById('app-unlock-password').value;
        const unlockError = document.getElementById('unlock-error');

        try {
            unlockError.style.display = 'none';
            showLoader('Unlocking data...');

            // Verify password with Firebase to ensure it's correct
            await verifyPassword(pwd);

            state.encryptionKey = await deriveKey(pwd);
            document.getElementById('unlock-overlay').style.display = 'none';

            await onUnlockSuccess();
        } catch (err) {
            hideLoader();
            unlockError.style.display = 'block';
            unlockError.textContent = err.message || "Incorrect password";
        }
    });

    const cancelBtn = document.getElementById('btn-unlock-logout');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', async () => {
            const { logoutUser } = await import('./auth.js');
            logoutUser().then(() => location.reload());
        });
    }
}

export function setupEncryptionSettings() {
    const toggle = $('#toggle-encryption');
    if (!toggle) return;

    toggle.checked = state.encryptionEnabled;

    toggle.addEventListener('change', (e) => {
        const enabling = e.target.checked;
        e.target.checked = !enabling; // Revert immediately, we will set it after success

        openModal({
            title: enabling ? 'Enable Encryption' : 'Disable Encryption',
            message: enabling
                ? 'Enter your account password to encrypt your data. This may take a moment.'
                : 'Enter your account password to decrypt and store your data as plain text.',
            confirmLabel: enabling ? 'Encrypt Data' : 'Decrypt Data',
            confirmClass: 'btn-primary',
            showPasswordInput: true,
            onConfirm: async () => {
                const pwd = $('#modal-password-input').value;
                if (!pwd) return false;

                showLoader(enabling ? 'Encrypting data...' : 'Decrypting data...');
                try {
                    // Verify password
                    await verifyPassword(pwd);

                    // Derive key
                    const key = await deriveKey(pwd);

                    // Rewrite all files across all years
                    await reEncryptAllCloudData(enabling, enabling ? key : null);

                    // Set new state for subsequent uploads
                    state.encryptionKey = enabling ? key : null;
                    state.encryptionEnabled = enabling;

                    // Update settings
                    await updateUserSettings({ encryptionEnabled: enabling });
                    localStorage.setItem('expman_encryption_enabled', enabling ? 'true' : 'false');

                    toggle.checked = enabling;
                    toast(enabling ? 'Encryption enabled successfully' : 'Encryption disabled successfully', 'success');
                } catch (err) {
                    console.error("Encryption toggle error:", err);
                    toast('Failed: ' + (err.message || 'Incorrect password'), 'error');
                    return false;
                } finally {
                    hideLoader();
                }
            }
        });
    });

    // Override the default "Change Password" button behavior
    const changePwdBtn = $('#btn-change-password');
    if (changePwdBtn) {
        // Remove old event listeners if any by cloning
        const newBtn = changePwdBtn.cloneNode(true);
        changePwdBtn.parentNode.replaceChild(newBtn, changePwdBtn);

        newBtn.addEventListener('click', () => {
            openModal({
                title: 'Change Password',
                message: state.encryptionEnabled
                    ? 'Enter your current password and a new password. Your data will be re-encrypted.'
                    : 'Enter your current password and a new password.',
                confirmLabel: 'Change Password',
                confirmClass: 'btn-primary',
                showPasswordInput: true,
                showNewPasswordInput: true,
                onConfirm: async () => {
                    const currentPwd = $('#modal-password-input').value;
                    const newPwd = $('#modal-new-password-input').value;
                    if (!currentPwd || !newPwd) return false;

                    const pwdError = validatePasswordStrength(newPwd);
                    if (pwdError) {
                        toast(pwdError, 'error');
                        return false;
                    }

                    showLoader('Changing password...');
                    try {
                        await verifyPassword(currentPwd);

                        // Ensure old key is derived from current password in case it was cleared by auto-login
                        state.encryptionKey = await deriveKey(currentPwd);

                        const newKey = await deriveKey(newPwd);

                        // Re-upload/re-encrypt all encrypted files with new key
                        await reEncryptAllCloudData(state.encryptionEnabled, newKey);

                        state.encryptionKey = newKey; // Update to new key

                        await changeUserPassword(newPwd);
                        toast('Password updated successfully', 'success');
                    } catch (err) {
                        console.error("Password change error:", err);
                        toast('Failed to change password: ' + (err.message || 'Unknown error'), 'error');
                        return false;
                    } finally {
                        hideLoader();
                    }
                }
            });
        });
    }
}
