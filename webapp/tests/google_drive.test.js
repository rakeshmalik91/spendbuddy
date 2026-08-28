import {
    isBackupDue,
    getGoogleDriveConnectionState,
    disconnectGoogleDrive,
    ensureBackupFolder,
    uploadBackupToDrive,
    cleanupOldBackups,
    backupToGoogleDrive,
    getValidAccessToken,
    STORAGE_KEYS,
    BACKUP_INTERVALS_MS,
    RETENTION_THRESHOLDS_MS
} from '../js/services/google_drive.js';

// Mock helpers and dependencies
jest.mock('../js/utils/helpers.js', () => ({
    toast: jest.fn(),
    getLocalDateString: jest.fn(() => '20260827')
}));

jest.mock('../js/services/user_settings.js', () => ({
    updateUserSettings: jest.fn().mockResolvedValue({}),
    loadUserSettings: jest.fn().mockResolvedValue({})
}));

jest.mock('../js/services/export.js', () => ({
    generateBackupZip: jest.fn().mockResolvedValue({
        blob: new Blob(['mock zip']),
        filename: 'ExpenseIQ_Backup_20260827.zip'
    })
}));

jest.mock('../js/ui/modal.js', () => ({
    openModal: jest.fn()
}));

describe('Google Drive Backup Service', () => {
    beforeEach(() => {
        localStorage.clear();
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    describe('isBackupDue logic', () => {
        const NOW = 1787700000000; // Fixed timestamp

        it('should return false if frequency is manual or invalid', () => {
            expect(isBackupDue(0, 'manual', NOW)).toBe(false);
            expect(isBackupDue(0, '', NOW)).toBe(false);
            expect(isBackupDue(NOW - 100000, null, NOW)).toBe(false);
        });

        it('should return true if no previous backup has been made', () => {
            expect(isBackupDue(0, 'daily', NOW)).toBe(true);
            expect(isBackupDue(null, 'weekly', NOW)).toBe(true);
            expect(isBackupDue(-1, 'monthly', NOW)).toBe(true);
        });

        it('should correctly evaluate daily backup interval (24 hours)', () => {
            const twentyThreeHoursAgo = NOW - (23 * 60 * 60 * 1000);
            const twentyFourHoursAgo = NOW - (24 * 60 * 60 * 1000);
            const twentyFiveHoursAgo = NOW - (25 * 60 * 60 * 1000);

            expect(isBackupDue(twentyThreeHoursAgo, 'daily', NOW)).toBe(false);
            expect(isBackupDue(twentyFourHoursAgo, 'daily', NOW)).toBe(true);
            expect(isBackupDue(twentyFiveHoursAgo, 'daily', NOW)).toBe(true);
        });

        it('should correctly evaluate weekly backup interval (7 days)', () => {
            const sixDaysAgo = NOW - (6 * 24 * 60 * 60 * 1000);
            const sevenDaysAgo = NOW - (7 * 24 * 60 * 60 * 1000);
            const eightDaysAgo = NOW - (8 * 24 * 60 * 60 * 1000);

            expect(isBackupDue(sixDaysAgo, 'weekly', NOW)).toBe(false);
            expect(isBackupDue(sevenDaysAgo, 'weekly', NOW)).toBe(true);
            expect(isBackupDue(eightDaysAgo, 'weekly', NOW)).toBe(true);
        });

        it('should correctly evaluate monthly backup interval (30 days)', () => {
            const twentyNineDaysAgo = NOW - (29 * 24 * 60 * 60 * 1000);
            const thirtyDaysAgo = NOW - (30 * 24 * 60 * 60 * 1000);
            const thirtyOneDaysAgo = NOW - (31 * 24 * 60 * 60 * 1000);

            expect(isBackupDue(twentyNineDaysAgo, 'monthly', NOW)).toBe(false);
            expect(isBackupDue(thirtyDaysAgo, 'monthly', NOW)).toBe(true);
            expect(isBackupDue(thirtyOneDaysAgo, 'monthly', NOW)).toBe(true);
        });
    });

    describe('getGoogleDriveConnectionState', () => {
        it('should return disconnected when no credentials in localStorage', () => {
            const state = getGoogleDriveConnectionState();
            expect(state.isConnected).toBe(false);
            expect(state.email).toBe('');
            expect(state.autoBackup).toBe(false);
        });

        it('should return connected state with proper flags when token and email exist', () => {
            const future = Date.now() + 3600000;
            localStorage.setItem(STORAGE_KEYS.TOKEN, 'mock_access_token');
            localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, future.toString());
            localStorage.setItem(STORAGE_KEYS.EMAIL, 'testuser@gmail.com');
            localStorage.setItem(STORAGE_KEYS.AUTO_BACKUP, 'true');
            localStorage.setItem(STORAGE_KEYS.FREQUENCY, 'daily');
            localStorage.setItem(STORAGE_KEYS.LAST_BACKUP, '1787700000000');

            const state = getGoogleDriveConnectionState();
            expect(state.isConnected).toBe(true);
            expect(state.isTokenExpired).toBe(false);
            expect(state.email).toBe('testuser@gmail.com');
            expect(state.autoBackup).toBe(true);
            expect(state.frequency).toBe('daily');
            expect(state.lastBackupTimestamp).toBe(1787700000000);
        });

        it('should detect expired token', () => {
            const past = Date.now() - 3600000;
            localStorage.setItem(STORAGE_KEYS.TOKEN, 'mock_access_token');
            localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, past.toString());
            localStorage.setItem(STORAGE_KEYS.EMAIL, 'testuser@gmail.com');

            const state = getGoogleDriveConnectionState();
            expect(state.isConnected).toBe(true);
            expect(state.isTokenExpired).toBe(true);
        });
    });

    describe('disconnectGoogleDrive', () => {
        it('should clear stored credentials and auto backup setting from localStorage', async () => {
            localStorage.setItem(STORAGE_KEYS.TOKEN, 'mock_token');
            localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, '123456');
            localStorage.setItem(STORAGE_KEYS.EMAIL, 'test@gmail.com');
            localStorage.setItem(STORAGE_KEYS.AUTO_BACKUP, 'true');

            await disconnectGoogleDrive();

            expect(localStorage.getItem(STORAGE_KEYS.TOKEN)).toBeNull();
            expect(localStorage.getItem(STORAGE_KEYS.EXPIRES_AT)).toBeNull();
            expect(localStorage.getItem(STORAGE_KEYS.EMAIL)).toBeNull();
            expect(localStorage.getItem(STORAGE_KEYS.AUTO_BACKUP)).toBeNull();
        });
    });

    describe('ensureBackupFolder', () => {
        it('should return existing folder ID if folder is found in Drive', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ files: [{ id: 'folder_123', name: 'ExpenseIQ Backups' }] })
            });

            const folderId = await ensureBackupFolder('mock_token');
            expect(folderId).toBe('folder_123');
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('https://www.googleapis.com/drive/v3/files?q='),
                expect.objectContaining({
                    headers: { Authorization: 'Bearer mock_token' }
                })
            );
        });

        it('should create and return new folder ID if folder is not found', async () => {
            // 1st call: Search returns no files
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ files: [] })
            });
            // 2nd call: Create returns new folder
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 'new_folder_456', name: 'ExpenseIQ Backups' })
            });

            const folderId = await ensureBackupFolder('mock_token');
            expect(folderId).toBe('new_folder_456');
            expect(global.fetch).toHaveBeenCalledTimes(2);
        });
    });

    describe('uploadBackupToDrive', () => {
        it('should perform multipart upload of zip blob', async () => {
            // 1st call: Search folder
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ files: [{ id: 'folder_123' }] })
            });
            // 2nd call: Multipart upload
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 'file_789', name: 'ExpenseIQ_Backup_20260827.zip' })
            });

            const dummyBlob = new Blob(['mock zip content'], { type: 'application/zip' });
            // Mock arrayBuffer for Node/jsdom Blob
            dummyBlob.arrayBuffer = async () => new ArrayBuffer(8);

            const result = await uploadBackupToDrive(dummyBlob, 'ExpenseIQ_Backup_20260827.zip', 'mock_token');
            expect(result.id).toBe('file_789');
            expect(global.fetch).toHaveBeenCalledWith(
                'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        Authorization: 'Bearer mock_token'
                    })
                })
            );
        });
    });

    describe('cleanupOldBackups', () => {
        const NOW = 1787700000000;
        const ONE_DAY = 24 * 60 * 60 * 1000;

        it('should do nothing if retention policy is keep_all or null', async () => {
            const countNull = await cleanupOldBackups('mock_token', null);
            const countKeep = await cleanupOldBackups('mock_token', 'keep_all');
            expect(countNull).toBe(0);
            expect(countKeep).toBe(0);
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('should not delete files if 3 or fewer backups exist', async () => {
            // Folder check
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ files: [{ id: 'folder_123' }] })
            });
            // List backups (3 files, all older than 30 days)
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    files: [
                        { id: 'backup_1', name: 'ExpenseIQ_Backup_1.zip', createdTime: new Date(NOW - 40 * ONE_DAY).toISOString() },
                        { id: 'backup_2', name: 'ExpenseIQ_Backup_2.zip', createdTime: new Date(NOW - 50 * ONE_DAY).toISOString() },
                        { id: 'backup_3', name: 'ExpenseIQ_Backup_3.zip', createdTime: new Date(NOW - 60 * ONE_DAY).toISOString() }
                    ]
                })
            });

            const deleted = await cleanupOldBackups('mock_token', '30_days', NOW);
            expect(deleted).toBe(0);
            expect(global.fetch).toHaveBeenCalledTimes(2);
        });

        it('should delete older backups exceeding retention limit while preserving at least the 3 newest backups', async () => {
            // 1st call: Search folder
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ files: [{ id: 'folder_123' }] })
            });
            // 2nd call: List files (5 files: 3 newest preserved, 4th and 5th deleted if older than cutoff)
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    files: [
                        { id: 'backup_1', name: 'ExpenseIQ_Backup_1.zip', createdTime: new Date(NOW - 10 * ONE_DAY).toISOString() },
                        { id: 'backup_2', name: 'ExpenseIQ_Backup_2.zip', createdTime: new Date(NOW - 20 * ONE_DAY).toISOString() },
                        { id: 'backup_3', name: 'ExpenseIQ_Backup_3.zip', createdTime: new Date(NOW - 35 * ONE_DAY).toISOString() },
                        { id: 'backup_4', name: 'ExpenseIQ_Backup_4.zip', createdTime: new Date(NOW - 40 * ONE_DAY).toISOString() },
                        { id: 'backup_5', name: 'ExpenseIQ_Backup_5.zip', createdTime: new Date(NOW - 50 * ONE_DAY).toISOString() }
                    ]
                })
            });
            // 3rd call: Delete backup_4
            global.fetch.mockResolvedValueOnce({ ok: true });
            // 4th call: Delete backup_5
            global.fetch.mockResolvedValueOnce({ ok: true });

            const deleted = await cleanupOldBackups('mock_token', '30_days', NOW);
            expect(deleted).toBe(2);
            // backup_1, backup_2, backup_3 (top 3) must NOT be deleted
            expect(global.fetch).not.toHaveBeenCalledWith(
                'https://www.googleapis.com/drive/v3/files/backup_1',
                expect.anything()
            );
            expect(global.fetch).not.toHaveBeenCalledWith(
                'https://www.googleapis.com/drive/v3/files/backup_2',
                expect.anything()
            );
            expect(global.fetch).not.toHaveBeenCalledWith(
                'https://www.googleapis.com/drive/v3/files/backup_3',
                expect.anything()
            );
            expect(global.fetch).toHaveBeenCalledWith(
                'https://www.googleapis.com/drive/v3/files/backup_4',
                expect.objectContaining({ method: 'DELETE' })
            );
            expect(global.fetch).toHaveBeenCalledWith(
                'https://www.googleapis.com/drive/v3/files/backup_5',
                expect.objectContaining({ method: 'DELETE' })
            );
        });

        it('should support 7_days retention policy with minimum 3 backups preserved', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ files: [{ id: 'folder_123' }] })
            });
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    files: [
                        { id: 'backup_1', name: 'ExpenseIQ_Backup_1.zip', createdTime: new Date(NOW - 2 * ONE_DAY).toISOString() },
                        { id: 'backup_2', name: 'ExpenseIQ_Backup_2.zip', createdTime: new Date(NOW - 4 * ONE_DAY).toISOString() },
                        { id: 'backup_3', name: 'ExpenseIQ_Backup_3.zip', createdTime: new Date(NOW - 6 * ONE_DAY).toISOString() },
                        { id: 'backup_4', name: 'ExpenseIQ_Backup_4.zip', createdTime: new Date(NOW - 10 * ONE_DAY).toISOString() }
                    ]
                })
            });
            global.fetch.mockResolvedValueOnce({ ok: true });

            const deleted = await cleanupOldBackups('mock_token', '7_days', NOW);
            expect(deleted).toBe(1);
            expect(global.fetch).toHaveBeenCalledWith(
                'https://www.googleapis.com/drive/v3/files/backup_4',
                expect.objectContaining({ method: 'DELETE' })
            );
        });
    });

    describe('backupToGoogleDrive failure handling', () => {
        it('should record last error in localStorage when upload fails', async () => {
            // Valid token in storage
            localStorage.setItem(STORAGE_KEYS.TOKEN, 'valid_token');
            localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, (Date.now() + 3600000).toString());

            // 1st call: Search folder succeeds
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ files: [{ id: 'folder_123' }] })
            });
            // 2nd call: Upload fails with 500
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: async () => 'Internal Server Error'
            });

            // Blob arrayBuffer polyfill for jsdom
            Blob.prototype.arrayBuffer = jest.fn().mockResolvedValue(new ArrayBuffer(8));

            const success = await backupToGoogleDrive(false);
            expect(success).toBe(false);

            const state = getGoogleDriveConnectionState();
            expect(state.lastError).toContain('Google Drive upload failed: 500');
            expect(state.lastErrorTime).toBeGreaterThan(0);
        });

        it('should clear last error from localStorage upon successful backup', async () => {
            localStorage.setItem(STORAGE_KEYS.TOKEN, 'valid_token');
            localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, (Date.now() + 3600000).toString());
            localStorage.setItem(STORAGE_KEYS.LAST_ERROR, 'Previous failed backup');
            localStorage.setItem(STORAGE_KEYS.LAST_ERROR_TIME, (Date.now() - 10000).toString());

            // 1st call: Search folder succeeds
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ files: [{ id: 'folder_123' }] })
            });
            // 2nd call: Upload succeeds
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 'file_success_123' })
            });
            // 3rd call: Folder check for cleanup
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ files: [{ id: 'folder_123' }] })
            });
            // 4th call: List files for cleanup (1 file)
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ files: [{ id: 'file_success_123' }] })
            });

            Blob.prototype.arrayBuffer = jest.fn().mockResolvedValue(new ArrayBuffer(8));

            const success = await backupToGoogleDrive(false);
            expect(success).toBe(true);

            const state = getGoogleDriveConnectionState();
            expect(state.lastError).toBeNull();
            expect(state.lastErrorTime).toBeNull();
            expect(state.lastBackup).not.toBeNull();
        });
    });

    describe('getValidAccessToken', () => {
        it('returns cached token if still valid (> 2 minutes remaining)', async () => {
            const future = Date.now() + 10 * 60 * 1000;
            localStorage.setItem(STORAGE_KEYS.TOKEN, 'active_valid_token');
            localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, future.toString());

            const token = await getValidAccessToken(false);
            expect(token).toBe('active_valid_token');
        });

        it('attempts silent token refresh when token is expired and user is connected', async () => {
            const expired = Date.now() - 1000;
            localStorage.setItem(STORAGE_KEYS.CONNECTED, 'true');
            localStorage.setItem(STORAGE_KEYS.TOKEN, 'expired_token');
            localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, expired.toString());
            localStorage.setItem(STORAGE_KEYS.EMAIL, 'user@gmail.com');
            localStorage.setItem(STORAGE_KEYS.CUSTOM_CLIENT_ID, 'mock-client-id');

            window.google = {
                accounts: {
                    oauth2: {
                        initTokenClient: jest.fn(({ callback }) => ({
                            requestAccessToken: jest.fn(() => {
                                callback({
                                    access_token: 'refreshed_silent_token',
                                    expires_in: 3600
                                });
                            })
                        }))
                    }
                }
            };

            const token = await getValidAccessToken(false);
            expect(token).toBe('refreshed_silent_token');
            expect(localStorage.getItem(STORAGE_KEYS.TOKEN)).toBe('refreshed_silent_token');
            expect(parseInt(localStorage.getItem(STORAGE_KEYS.EXPIRES_AT))).toBeGreaterThan(Date.now());
        });
    });
});
