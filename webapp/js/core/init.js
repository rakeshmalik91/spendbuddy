import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { initAuth, getUserEmail, loginUser, signupUser, logoutUser, deleteUserAccount, sendResetEmail, verifyPassword, sendUserEmailVerification } from "../services/auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { setupSort, setupFilters } from "../ui/filters.js";
import { loadMetadata, loadAllCSVs, loadScheduledCSV, processScheduledTransactions, syncCloudDataInBackground, startBackgroundRefresh, loadLocationsCsv } from "../services/storage.js";
import { state } from "./state.js";
import { toast, validatePasswordStrength } from "../utils/helpers.js";
import { setupForm } from "../ui/form.js";
import { SESSION_VALIDITY_MINUTES, FIREBASE_CONFIG, USE_LOCAL_DATA } from "../../config.js";
import { setupNavigation } from "../ui/navigation.js";
import { populateFormDropdowns } from "../ui/form_dropdowns.js";
import { setupMobileMenu } from "../ui/mobile_menu.js";
import { setupSettings } from "../ui/settings.js";
import { setupModal, openModal } from "../ui/modal.js";
import { setupTimeFilter } from "../ui/time_filter.js";
import { renderAll } from "../ui/render_all.js";
import { setupSmsApproval, initSmsFromCache } from "../ui/sms_approval.js";
import { initBatchUpdate } from "../ui/batch_update.js";

/* ══════════════ GLOBAL ERROR LOGGING ══════════════ */
window.onerror = function(message, source, lineno, colno, error) {
    const errorDetails = `[JS Error] ${message} at ${source}:${lineno}:${colno}`;
    console.error(errorDetails, error);
};

window.onunhandledrejection = function(event) {
    console.error(`[JS Unhandled Rejection]`, event.reason);
};

/* ══════════════ EXPORTS ══════════════ */
export { receiveSmsTransactions } from "../ui/sms_approval.js";

/* ══════════════ LOADER ══════════════ */
let hideLoaderTimeout;
export function showLoader(text = 'Syncing cloud data...') {
    const loader = document.getElementById('global-loader');
    if (!loader) return;
    if (hideLoaderTimeout) {
        clearTimeout(hideLoaderTimeout);
        hideLoaderTimeout = null;
    }
    loader.style.display = 'flex';
    // Trigger reflow for transition
    void loader.offsetWidth;
    loader.style.opacity = '1';
    
    const loaderText = loader.querySelector('p');
    if (loaderText) loaderText.textContent = text;
};

export function hideLoader() {
    const loader = document.getElementById('global-loader');
    if (!loader) return;
    loader.style.opacity = '0';
    if (hideLoaderTimeout) clearTimeout(hideLoaderTimeout);
    hideLoaderTimeout = setTimeout(() => { loader.style.display = 'none'; }, 300);
};

/**
 * Creates (or reuses) a collapsible scanner spinner toast for SMS/Email scanning.
 * @param {string} elementId - DOM id for the spinner element
 * @param {string} emoji - Emoji to display in the spinner
 * @param {string} label - Text label (e.g. 'Scanning SMS...')
 */
function showScannerSpinner(elementId, emoji, label) {
    let ind = document.getElementById(elementId);
    if (!ind) {
        ind = document.createElement('div');
        ind.id = elementId;
        ind.className = 'sync-indicator';
        ind.style.background = 'rgba(30, 41, 59, 0.9)';
        ind.style.transition = 'all 0.3s ease';
        ind.style.cursor = 'pointer';
        ind.style.marginBottom = '8px';
        ind.style.order = '50';
        
        ind.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <div style="font-size: 1.5rem; line-height: 1; animation: emoji-pulse 0.8s ease-in-out infinite alternate;">${emoji}</div>
                <span class="spinner-text" style="color: white; font-size: 0.85rem; font-weight: 500; white-space: nowrap;">${label}</span>
            </div>
        `;
        ind.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            const txt = ind.querySelector('.spinner-text');
            if (txt.style.display === 'none') {
                txt.style.display = 'block';
                ind.style.borderRadius = '20px';
                ind.style.padding = '8px 16px';
            } else {
                txt.style.display = 'none';
                ind.style.borderRadius = '50%';
                ind.style.padding = '8px';
            }
        };
        const container = document.getElementById('toast-container');
        if (container) container.appendChild(ind);
    }
    
    const txt = ind.querySelector('.spinner-text');
    if (txt) {
        txt.style.display = 'block';
        ind.style.borderRadius = '20px';
        ind.style.padding = '8px 16px';
        
        if (ind.collapseTimeout) clearTimeout(ind.collapseTimeout);
        ind.collapseTimeout = setTimeout(() => {
            if (txt.style.display === 'block') {
                txt.style.display = 'none';
                ind.style.borderRadius = '50%';
                ind.style.padding = '8px';
            }
        }, 2500);
    }
    
    ind.classList.remove('hidden');
}

function hideScannerSpinner(elementId) {
    const ind = document.getElementById(elementId);
    if (ind) ind.classList.add('hidden');
}

export function showSmsSpinner()   { showScannerSpinner('sms-spinner-toast', '💬', 'Scanning SMS...'); }
export function hideSmsSpinner()   { hideScannerSpinner('sms-spinner-toast'); }
export function showEmailSpinner() { showScannerSpinner('email-spinner-toast', '📧', 'Scanning Emails...'); }
export function hideEmailSpinner() { hideScannerSpinner('email-spinner-toast'); }

// ── DOM Refs ──
export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => document.querySelectorAll(sel);

// ── App Init Core ──
export const initApp = async () => {
    showLoader('Booting application...');

    
    // Dynamically import loadUserSettings to avoid circular dependency issues if any
    const { loadUserSettings, applyUserSettings } = await import('../services/user_settings.js');
    
    const [_, __, ___, ____, settings] = await Promise.all([
        loadAllCSVs(),
        loadMetadata(),
        loadLocationsCsv(),
        loadScheduledCSV(),
        loadUserSettings()
    ]);

    if (settings) {
        applyUserSettings(settings);
    }
    // (processScheduledTransactions removed from here, now safely executed after cloud sync)
    setupNavigation();
    setupForm();
    setupFilters();
    setupSort();
    setupModal();
    setupMobileMenu();
    setupSettings();
    import('../services/encryption_manager.js').then(m => m.setupEncryptionSettings());
    setupTimeFilter();
    populateFormDropdowns();
    initBatchUpdate();
    import('../ui/balance.js?v=4').then(m => m.initBalanceTracker());
    renderAll();

    // Pre-populate SMS/email pending transactions from JS-side cache immediately,
    // before Android finishes its background scan and calls receiveSmsTransactions.
    initSmsFromCache();

    try {
        const { loadGmailCredentialsFromCloud } = await import('../services/gmail.js');
        await loadGmailCredentialsFromCloud();
    } catch (e) {
        console.error("Failed to load Gmail credentials from cloud on boot:", e);
    }

    hideLoader();
    if (window.Android && window.Android.onWebAppReady) {
        window.Android.onWebAppReady();
    }

    // Sync fresh data from cloud in the background
    // (initial load used local cache for instant startup)
    syncCloudDataInBackground();

    // Schedule a background refresh every 5 minutes
    startBackgroundRefresh();

    // Check and trigger periodic Google Drive auto-backup if due
    import('../services/google_drive.js').then(m => m.checkAndTriggerAutoBackup()).catch(e => {
        console.warn('Google Drive auto-backup check failed on boot:', e);
    });
};

function setupChartDefaults() {
    if (typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
        Chart.defaults.plugins.datalabels = {
            color: '#ffffff',
            font: {
                weight: 'bold',
                size: 11,
                family: 'Inter, sans-serif'
            },
            textShadowColor: 'rgba(0, 0, 0, 0.75)',
            textShadowBlur: 4,
            textAlign: 'center',
            anchor: function (context) {
                return context.chart.config.type === 'bar' ? 'end' : 'center';
            },
            align: function (context) {
                return context.chart.config.type === 'bar' ? 'end' : 'center';
            },
            offset: 4,
            formatter: function (value, context) {
                if (value === 0) return '';
                const abs = Math.abs(value);
                const prefix = value < 0 ? '-' : '';
                let valStr = prefix + '₹' + Math.round(abs);
                if (abs >= 1000) valStr = prefix + '₹' + (abs / 1000).toFixed(2) + 'k';

                if (context.chart.config.type === 'doughnut' || context.chart.config.type === 'polarArea') {
                    let label = context.chart.data.labels[context.dataIndex] || '';
                    if (label.length > 12) label = label.substring(0, 10) + '..';
                    return label + '\n' + valStr;
                }
                return valStr;
            },
            display: function (context) {
                if (context.chart.config.type === 'line') return false;
                return 'auto';
            },
            clip: false,
        };
    }
}

/* ══════════════ SESSION & AUTH HELPERS ══════════════ */

/**
 * Clears all 'expman_*' keys from localStorage (used on logout / account deletion).
 */
function clearExpmanStorage() {
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key.startsWith('expman_')) localStorage.removeItem(key);
    }
}

/**
 * Sets up the session inactivity timer that auto-logs out the user
 * after SESSION_VALIDITY_MINUTES of inactivity.
 */
function setupSessionTimer() {
    if (SESSION_VALIDITY_MINUTES <= 0) return;
    const resetTimer = () => localStorage.setItem('expman_last_activity', Date.now().toString());
    resetTimer();
    ['click', 'keypress', 'scroll', 'mousemove'].forEach(evt => window.addEventListener(evt, resetTimer));
    setInterval(() => {
        if (!getUserEmail() && !localStorage.getItem('expman_user_email')) return;
        const last = localStorage.getItem('expman_last_activity');
        if (last && (Date.now() - parseInt(last)) > SESSION_VALIDITY_MINUTES * 60 * 1000) {
            logoutUser().then(() => location.reload());
        }
    }, 10000);
}

/**
 * Updates the sidebar and account page user-id elements with the given email.
 */
function updateUserIdDisplay(email) {
    if (!email) return;
    const sidebarUserId = document.getElementById('sidebar-user-id');
    if (sidebarUserId) sidebarUserId.textContent = email;
    const accountUserId = document.getElementById('account-user-id');
    if (accountUserId) accountUserId.textContent = email;
}

/**
 * Creates the common unlock-success callback used by both the optimistic boot
 * path and the Firebase auth-state callback path.
 * @param {string|null} email - User email to display, or null to read from localStorage
 */
function createUnlockHandler(email) {
    return async () => {
        await initApp();
        state.masterDataLoaded = true;
        updateUserIdDisplay(email || localStorage.getItem('expman_user_email'));
        setupSessionTimer();
        hideLoader();
    };
}

function startAuthFlow() {
    const overlay = document.getElementById('password-overlay');
    const errorMsg = document.getElementById('password-error');

    if (USE_LOCAL_DATA) {
        overlay.style.display = 'none';
        initApp();
    } else {
        state.app = initializeApp(FIREBASE_CONFIG);
        state.storage = getStorage(state.app);

        const isLocallyLoggedIn = localStorage.getItem('expman_is_logged_in') === 'true';
        let optimisticLoadTriggered = false;

        if (isLocallyLoggedIn) {
            overlay.style.display = 'none';
            errorMsg.style.display = 'none';
            optimisticLoadTriggered = true;
            
            (async () => {
                const { checkEncryptionAndUnlock, setupUnlockForm } = await import('../services/encryption_manager.js');
                const handler = createUnlockHandler(null);
                await checkEncryptionAndUnlock(handler);
                setupUnlockForm(handler);
            })();
        }

        initAuth(state.app, (user) => {
            if (user) {
                localStorage.setItem('expman_is_logged_in', 'true');
                localStorage.setItem('expman_user_email', user.email);

                if (!user.emailVerified) {
                    logoutUser();
                    if (!errorMsg.textContent.includes("Account created") && !errorMsg.textContent.includes("verification email sent")) {
                        overlay.style.display = 'flex';
                        errorMsg.style.color = 'var(--amount-negative)';
                        errorMsg.textContent = "Please verify your email before logging in.";
                        errorMsg.style.display = 'block';
                    }
                    return;
                }

                if (SESSION_VALIDITY_MINUTES > 0) {
                    const lastActive = localStorage.getItem('expman_last_activity');
                    const timeoutMs = SESSION_VALIDITY_MINUTES * 60 * 1000;
                    if (lastActive && (Date.now() - parseInt(lastActive)) > timeoutMs) {
                        logoutUser().then(() => location.reload());
                        return;
                    }
                }

                if (overlay.style.display !== 'none') {
                    window.location.hash = 'dashboard';
                    if (typeof window.switchView === 'function') {
                        window.switchView('dashboard');
                    }
                }
                overlay.style.display = 'none';
                errorMsg.style.display = 'none';
                
                if (!state.masterDataLoaded && !optimisticLoadTriggered) {
                    (async () => {
                        const { checkEncryptionAndUnlock, setupUnlockForm } = await import('../services/encryption_manager.js');
                        const handler = createUnlockHandler(user.email);
                        await checkEncryptionAndUnlock(handler);
                        setupUnlockForm(handler);
                    })();
                } else {
                    updateUserIdDisplay(user.email);
                }
            } else {
                if (optimisticLoadTriggered) {
                    clearExpmanStorage();
                    location.reload();
                } else {
                    overlay.style.display = 'flex';
                    hideLoader();
                    setupModal();
                }
            }
        });
    }
}

function setupAuthListeners() {
    const form = document.getElementById('password-form');
    const errorMsg = document.getElementById('password-error');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('app-email').value;
            const pwd = document.getElementById('app-password').value;

            try {
                errorMsg.style.display = 'none';
                const user = await loginUser(email, pwd);

                const { deriveKey } = await import('../utils/crypto.js');
                state.encryptionKey = await deriveKey(pwd);

                if (!user.emailVerified) {
                    await sendUserEmailVerification(user);
                    await logoutUser();
                    errorMsg.style.color = 'var(--green)';
                    errorMsg.textContent = "Your account is unverified. A new verification email sent. Please check your inbox.";
                    errorMsg.style.display = 'block';
                    return;
                }

                localStorage.setItem('expman_last_activity', Date.now().toString());
            } catch (error) {
                console.error("Login error:", error);
                errorMsg.style.color = 'var(--amount-negative)';
                errorMsg.textContent = "Invalid login or password";
                errorMsg.style.display = 'block';
            }
        });
    }

    const signupBtn = document.getElementById('btn-signup');
    if (signupBtn) {
        signupBtn.addEventListener('click', async () => {
            const email = document.getElementById('app-email').value;
            const pwd = document.getElementById('app-password').value;

            if (!email || !pwd) {
                errorMsg.textContent = "Please enter email and password.";
                errorMsg.style.display = 'block';
                return;
            }

            const pwdError = validatePasswordStrength(pwd);
            if (pwdError) {
                errorMsg.textContent = pwdError;
                errorMsg.style.display = 'block';
                return;
            }

            try {
                errorMsg.style.display = 'none';
                const user = await signupUser(email, pwd);

                errorMsg.style.color = 'var(--green)';
                errorMsg.textContent = "Account created! Please check your email to verify before logging in.";
                errorMsg.style.display = 'block';

                localStorage.setItem('expman_last_activity', Date.now().toString());
            } catch (error) {
                console.error("Sign up error:", error);
                errorMsg.style.color = 'var(--amount-negative)';
                errorMsg.textContent = error.message || "Failed to create account.";
                errorMsg.style.display = 'block';
            }
        });
    }

    const forgotPwdBtn = document.getElementById('btn-forgot-password');
    if (forgotPwdBtn) {
        forgotPwdBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = document.getElementById('app-email').value;

            if (!email) {
                errorMsg.style.color = 'var(--amount-negative)';
                errorMsg.textContent = "Please enter your email address above to reset password.";
                errorMsg.style.display = 'block';
                return;
            }

            try {
                errorMsg.style.display = 'none';
                showLoader('Checking account status...');

                const { getEncryptionStatus } = await import('../services/encryption_manager.js');
                const encryptionEnabled = await getEncryptionStatus(email);

                hideLoader();

                if (encryptionEnabled) {
                    openModal({
                        title: 'Warning: Potential Data Loss',
                        message: 'You have End-to-End Encryption enabled. Resetting your password will permanently lock you out of your existing encrypted data because the decryption key is tied to your current password.<br><br>Are you sure you want to proceed?',
                        confirmLabel: 'Reset Password',
                        confirmClass: 'btn-danger',
                        onConfirm: async () => {
                            showLoader('Sending reset email...');
                            try {
                                await sendResetEmail(email);
                                hideLoader();
                                errorMsg.style.color = 'var(--green)';
                                errorMsg.textContent = "Password reset email sent! Check your inbox.";
                                errorMsg.style.display = 'block';
                            } catch (err) {
                                hideLoader();
                                errorMsg.style.color = 'var(--amount-negative)';
                                errorMsg.textContent = err.message || "Failed to send reset email.";
                                errorMsg.style.display = 'block';
                            }
                        }
                    });
                    return;
                }

                showLoader('Sending reset email...');
                await sendResetEmail(email);
                hideLoader();

                errorMsg.style.color = 'var(--green)';
                errorMsg.textContent = "Password reset email sent! Check your inbox.";
                errorMsg.style.display = 'block';
            } catch (error) {
                hideLoader();
                console.error("Reset password error:", error);
                errorMsg.style.color = 'var(--amount-negative)';
                errorMsg.textContent = error.message || "Failed to send reset email.";
                errorMsg.style.display = 'block';
            }
        });
    }

    const lockBtn = document.getElementById('nav-lock');
    const accountLogoutBtn = document.getElementById('btn-account-logout');

    const handleLogout = async () => {
        clearExpmanStorage();
        if (getUserEmail()) {
            try {
                await logoutUser();
                location.reload();
            } catch (e) {
                console.error("Sign out error", e);
            }
        } else {
            location.reload();
        }
    };

    if (lockBtn) {
        lockBtn.addEventListener('click', handleLogout);
    }
    if (accountLogoutBtn) {
        accountLogoutBtn.addEventListener('click', handleLogout);
    }

    const deleteAccountBtn = document.getElementById('btn-delete-account');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', () => {
            openModal({
                title: 'Delete Account',
                message: 'Are you absolutely sure you want to permanently delete your account? Please enter your password to confirm.',
                confirmLabel: 'Delete Permanently',
                confirmClass: 'btn-danger',
                showPasswordInput: true,
                onConfirm: async () => {
                    const passInput = document.getElementById('modal-password-input');
                    const password = passInput.value;

                    if (!password) {
                        toast("Please enter your password", "error");
                        throw new Error("Empty password");
                    }

                    if (getUserEmail()) {
                        showLoader('Deleting account...');
                        try {
                            await verifyPassword(password);
                            await deleteUserAccount();
                            clearExpmanStorage();
                            location.reload();
                        } catch (error) {
                            hideLoader();
                            console.error("Error deleting account:", error);
                            if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                                toast('Incorrect password.', 'error');
                            } else {
                                toast('Failed to delete account: ' + error.message, 'error');
                            }
                            throw error;
                        }
                    }
                }
            });
        });
    }

    const changePasswordBtn = document.getElementById('btn-change-password');
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', () => {
            openModal({
                title: 'Change Password',
                message: 'Do you want to send a password reset email to your address?',
                confirmLabel: 'Send Email',
                confirmClass: 'btn-primary',
                onConfirm: async () => {
                    const email = getUserEmail();
                    if (email) {
                        showLoader('Sending email...');
                        try {
                            await sendResetEmail(email);
                            hideLoader();
                            toast('Password reset email sent! Check your inbox.', 'success');
                        } catch (error) {
                            hideLoader();
                            console.error("Error sending reset email:", error);
                            toast('Failed to send reset email: ' + error.message, 'error');
                        }
                    }
                }
            });
        });
    }
}

function setupFullscreenListeners() {
    const handleFullscreenChange = () => {
        const fElement = document.fullscreenElement || document.webkitFullscreenElement;

        document.querySelectorAll('.chart-wrap.is-fullscreen').forEach(el => {
            if (el !== fElement) el.classList.remove('is-fullscreen');
        });

        if (fElement && fElement.classList.contains('chart-wrap')) {
            fElement.classList.add('is-fullscreen');

            const canvas = fElement.querySelector('canvas');
            if (canvas && canvas.id) {
                const chart = state.chartInstances[canvas.id];
                if (chart) {
                    chart.options.animation = { duration: 800 };
                    chart.update();
                }
            }
        }

        if (!fElement) {
            if (window.innerWidth <= 768 || window.Android) {
                Object.values(state.chartInstances).forEach(chart => {
                    if (chart) {
                        chart.options.animation = false;
                        chart.update('none');
                    }
                });
            }
            if (screen.orientation && screen.orientation.unlock) {
                screen.orientation.unlock();
            }
        }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
    setupChartDefaults();
    setupAuthListeners();
    setupFullscreenListeners();
    setupSmsApproval();
    startAuthFlow();

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && !USE_LOCAL_DATA) {
            console.log('[App] Resumed from background, triggering cloud sync...');
            syncCloudDataInBackground();
        }
    });
});

window.onImapCredentialsSaved = async (email, pass) => {
    try {
        const { saveGmailCredentialsToCloud } = await import('../services/gmail.js');
        await saveGmailCredentialsToCloud(email, pass);
    } catch (e) {
        console.error("Failed to save IMAP credentials to cloud:", e);
    }
};
