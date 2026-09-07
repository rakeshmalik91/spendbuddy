import { applyUserSettings, updateUserSettings, loadUserSettings } from '../js/services/user_settings.js';
import { state } from '../js/core/state.js';

jest.mock('https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js', () => ({
    ref: jest.fn(() => 'mock-ref'),
    uploadString: jest.fn().mockResolvedValue(true)
}), { virtual: true });

jest.mock('../js/services/auth.js', () => ({
    getRequiredEmail: jest.fn(() => 'testuser@gmail.com')
}));

let mockCsvContent = null;
jest.mock('../js/services/storage.js', () => ({
    getCsvContent: jest.fn(async (filename) => {
        if (filename === 'user_settings.json') {
            return mockCsvContent;
        }
        return null;
    })
}));

describe('User Settings Service', () => {
    beforeEach(() => {
        localStorage.clear();
        mockCsvContent = null;
        state.hideIncome = false;
        state.hideInvestment = false;
        state.hideTransfer = false;
        state.mergeRefunds = true;
        jest.clearAllMocks();
    });

    describe('applyUserSettings', () => {
        it('applies grouped ui settings to state and localStorage', () => {
            const settings = {
                ui: {
                    hideIncome: true,
                    hideInvestment: true,
                    hideTransfer: true,
                    mergeRefunds: false
                }
            };

            const changed = applyUserSettings(settings);
            expect(changed).toBe(true);
            expect(state.hideIncome).toBe(true);
            expect(state.hideInvestment).toBe(true);
            expect(state.hideTransfer).toBe(true);
            expect(state.mergeRefunds).toBe(false);
            expect(localStorage.getItem('expman_hide_income')).toBe('true');
            expect(localStorage.getItem('expman_hide_investment')).toBe('true');
            expect(localStorage.getItem('expman_hide_transfer')).toBe('true');
            expect(localStorage.getItem('expman_merge_refunds')).toBe('false');
        });

        it('applies grouped googleDrive settings to localStorage', () => {
            const settings = {
                googleDrive: {
                    connected: true,
                    email: 'backup@gmail.com',
                    autoBackup: true,
                    frequency: 'monthly',
                    retention: '7_days',
                    lastBackup: 1787808172726,
                    clientId: 'client-123.apps.googleusercontent.com'
                }
            };

            const changed = applyUserSettings(settings);
            expect(changed).toBe(true);
            expect(localStorage.getItem('expman_gdrive_connected')).toBe('true');
            expect(localStorage.getItem('expman_gdrive_email')).toBe('backup@gmail.com');
            expect(localStorage.getItem('expman_gdrive_auto_backup')).toBe('true');
            expect(localStorage.getItem('expman_gdrive_frequency')).toBe('monthly');
            expect(localStorage.getItem('expman_gdrive_retention')).toBe('7_days');
            expect(localStorage.getItem('expman_gdrive_last_backup')).toBe('1787808172726');
            expect(localStorage.getItem('expman_gdrive_custom_client_id')).toBe('client-123.apps.googleusercontent.com');
        });

        it('syncs gmail credentials to Android bridge if available', () => {
            window.Android = {
                saveImapCredentials: jest.fn(),
                getSavedImapEmail: jest.fn(() => 'old@gmail.com'),
                getSavedImapPassword: jest.fn(() => 'oldpass')
            };

            const settings = {
                gmail: {
                    email: 'new@gmail.com',
                    pass: 'newpass'
                }
            };

            applyUserSettings(settings);
            expect(window.Android.saveImapCredentials).toHaveBeenCalledWith('new@gmail.com', 'newpass');
            delete window.Android;
        });
    });

    describe('updateUserSettings', () => {
        it('deep merges grouped objects cleanly', async () => {
            const fbStorage = require('./__mocks__/firebase-mock.js');
            const mockUpload = jest.fn().mockResolvedValue(true);
            fbStorage.uploadString = mockUpload;
            
            // Existing grouped JSON in cloud
            mockCsvContent = JSON.stringify({
                ui: {
                    hideIncome: false,
                    hideTransfer: true
                },
                googleDrive: {
                    connected: true,
                    clientId: 'old-client-id'
                }
            });

            // Update with new settings
            const result = await updateUserSettings({
                googleDrive: {
                    clientId: 'new-client-id',
                    autoBackup: true
                }
            });

            expect(result.ui).toEqual({
                hideIncome: false,
                hideTransfer: true
            });
            expect(result.googleDrive.connected).toBe(true);
            expect(result.googleDrive.clientId).toBe('new-client-id');
            expect(result.googleDrive.autoBackup).toBe(true);

            expect(mockUpload).toHaveBeenCalled();
            const savedJson = JSON.parse(mockUpload.mock.calls[0][1]);
            expect(savedJson.googleDrive.clientId).toBe('new-client-id');
            expect(savedJson.googleDrive.connected).toBe(true);
        });

        it('deletes gmail credentials when updated with null', async () => {
            mockCsvContent = JSON.stringify({
                gmail: {
                    email: 'test@gmail.com',
                    pass: 'secret'
                }
            });

            const result = await updateUserSettings({ gmail: null });
            expect(result.gmail).toBeUndefined();
        });
    });
});
