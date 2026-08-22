import { state } from '../js/core/state.js';

// Mocks
const mockSignupUser = jest.fn();
const mockLoginUser = jest.fn();
const mockLogoutUser = jest.fn();
const mockSendUserEmailVerification = jest.fn();
const mockDeriveKey = jest.fn();
const mockUpdateUserSettings = jest.fn();

jest.mock('../js/services/auth.js', () => ({
    initAuth: jest.fn(),
    getUserEmail: jest.fn(() => 'newuser@example.com'),
    getRequiredEmail: jest.fn(() => 'newuser@example.com'),
    loginUser: (...args) => mockLoginUser(...args),
    signupUser: (...args) => mockSignupUser(...args),
    logoutUser: (...args) => mockLogoutUser(...args),
    deleteUserAccount: jest.fn(),
    sendResetEmail: jest.fn(),
    verifyPassword: jest.fn(),
    sendUserEmailVerification: (...args) => mockSendUserEmailVerification(...args)
}));

jest.mock('../js/utils/crypto.js', () => ({
    deriveKey: (...args) => mockDeriveKey(...args),
    encryptData: jest.fn((key, data) => Promise.resolve(`ENC:${data}`)),
    decryptData: jest.fn((key, data) => Promise.resolve(data.replace('ENC:', '')))
}));

jest.mock('../js/services/user_settings.js', () => ({
    updateUserSettings: (...args) => mockUpdateUserSettings(...args),
    loadUserSettings: jest.fn().mockResolvedValue({}),
    applyUserSettings: jest.fn()
}));

jest.mock('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js', () => ({
    initializeApp: jest.fn(() => ({}))
}), { virtual: true });

jest.mock('https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js', () => ({
    getStorage: jest.fn(() => ({})),
    ref: jest.fn(() => ({})),
    uploadString: jest.fn().mockResolvedValue({})
}), { virtual: true });

describe('Signup End-to-End Encryption', () => {
    let emailInput, pwdInput, signupToggle, signupWarning, signupBtn, errorMsg, passwordForm;

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="password-overlay">
                <form id="password-form">
                    <input type="email" id="app-email" value="">
                    <input type="password" id="app-password" value="">
                    <div id="signup-encryption-group">
                        <input type="checkbox" id="signup-toggle-encryption">
                        <div id="signup-encryption-warning" style="display: none;">Warning</div>
                    </div>
                    <button type="submit" id="btn-login">Login</button>
                    <button type="button" id="btn-signup">Sign Up</button>
                    <a href="#" id="btn-forgot-password">Forgot</a>
                </form>
                <p id="password-error" style="display: none;"></p>
            </div>
            <div id="unlock-overlay" style="display: none;"></div>
        `;

        emailInput = document.getElementById('app-email');
        pwdInput = document.getElementById('app-password');
        signupToggle = document.getElementById('signup-toggle-encryption');
        signupWarning = document.getElementById('signup-encryption-warning');
        signupBtn = document.getElementById('btn-signup');
        errorMsg = document.getElementById('password-error');
        passwordForm = document.getElementById('password-form');

        localStorage.clear();
        state.encryptionKey = null;
        state.encryptionEnabled = false;
        jest.clearAllMocks();

        mockDeriveKey.mockResolvedValue('mock-derived-crypto-key');
        mockUpdateUserSettings.mockResolvedValue({});
        mockLogoutUser.mockResolvedValue();
    });

    it('toggles encryption warning visibility when checkbox changes', async () => {
        const { setupAuthListeners } = await import('../js/core/init.js');
        setupAuthListeners();

        expect(signupWarning.style.display).toBe('none');

        signupToggle.checked = true;
        signupToggle.dispatchEvent(new Event('change'));
        expect(signupWarning.style.display).toBe('block');

        signupToggle.checked = false;
        signupToggle.dispatchEvent(new Event('change'));
        expect(signupWarning.style.display).toBe('none');
    });

    it('creates account with End-to-End Encryption enabled when checkbox is checked', async () => {
        emailInput.value = 'secureuser@example.com';
        pwdInput.value = 'StrongPass123!';
        signupToggle.checked = true;

        mockSignupUser.mockResolvedValue({
            email: 'secureuser@example.com',
            emailVerified: false
        });

        const { setupAuthListeners } = await import('../js/core/init.js');
        setupAuthListeners();

        signupBtn.click();

        // Wait for async handler
        await new Promise(r => setTimeout(r, 50));

        expect(mockSignupUser).toHaveBeenCalledWith('secureuser@example.com', 'StrongPass123!');
        expect(mockDeriveKey).toHaveBeenCalledWith('StrongPass123!');
        expect(state.encryptionEnabled).toBe(true);
        expect(state.encryptionKey).toBe('mock-derived-crypto-key');

        expect(mockUpdateUserSettings).toHaveBeenCalledWith({ encryptionEnabled: true });
        expect(localStorage.getItem('expman_encryption_enabled')).toBe('true');
        expect(mockLogoutUser).toHaveBeenCalled();

        expect(errorMsg.style.display).toBe('block');
        expect(errorMsg.textContent).toContain('End-to-End Encryption enabled');
    });

    it('creates standard account without encryption when checkbox is unchecked', async () => {
        emailInput.value = 'plainuser@example.com';
        pwdInput.value = 'StrongPass123!';
        signupToggle.checked = false;

        mockSignupUser.mockResolvedValue({
            email: 'plainuser@example.com',
            emailVerified: false
        });

        const { setupAuthListeners } = await import('../js/core/init.js');
        setupAuthListeners();

        signupBtn.click();
        await new Promise(r => setTimeout(r, 50));

        expect(mockSignupUser).toHaveBeenCalledWith('plainuser@example.com', 'StrongPass123!');
        expect(state.encryptionEnabled).toBe(false);
        expect(mockUpdateUserSettings).toHaveBeenCalledWith({ encryptionEnabled: false });
        expect(localStorage.getItem('expman_encryption_enabled')).toBe('false');
        expect(mockLogoutUser).toHaveBeenCalled();

        expect(errorMsg.textContent).toContain('Account created! Please check your email');
        expect(errorMsg.textContent).not.toContain('End-to-End Encryption');
    });

    it('stores pending encryption key if cloud settings update throws during signup', async () => {
        emailInput.value = 'fallbackuser@example.com';
        pwdInput.value = 'StrongPass123!';
        signupToggle.checked = true;

        mockSignupUser.mockResolvedValue({
            email: 'fallbackuser@example.com',
            emailVerified: false
        });
        mockUpdateUserSettings.mockRejectedValue(new Error('Network failure'));

        const { setupAuthListeners } = await import('../js/core/init.js');
        setupAuthListeners();

        signupBtn.click();
        await new Promise(r => setTimeout(r, 50));

        expect(localStorage.getItem('expman_encryption_pending_fallbackuser@example.com')).toBe('true');
    });

    it('syncs pending encryption setting on first successful login', async () => {
        emailInput.value = 'verifieduser@example.com';
        pwdInput.value = 'StrongPass123!';
        localStorage.setItem('expman_encryption_pending_verifieduser@example.com', 'true');

        mockLoginUser.mockResolvedValue({
            email: 'verifieduser@example.com',
            emailVerified: true
        });

        const { setupAuthListeners } = await import('../js/core/init.js');
        setupAuthListeners();

        passwordForm.dispatchEvent(new Event('submit', { cancelable: true }));
        await new Promise(r => setTimeout(r, 50));

        expect(mockLoginUser).toHaveBeenCalledWith('verifieduser@example.com', 'StrongPass123!');
        expect(state.encryptionEnabled).toBe(true);
        expect(localStorage.getItem('expman_encryption_enabled')).toBe('true');
        expect(localStorage.getItem('expman_encryption_pending_verifieduser@example.com')).toBeNull();
        expect(mockUpdateUserSettings).toHaveBeenCalledWith({ encryptionEnabled: true });
    });
});
