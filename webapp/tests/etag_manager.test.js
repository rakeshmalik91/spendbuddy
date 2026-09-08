import { storeFileHash, verifyFileHashBeforeUpload } from '../js/services/etag_manager.js';
import { state } from '../js/core/state.js';

const fbStorage = require("https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js");

describe('ETag Manager', () => {
    const originalGetMetadata = fbStorage.getMetadata;

    beforeEach(() => {
        state.fileHashes = {};
        fbStorage.getMetadata = originalGetMetadata;
    });

    afterEach(() => {
        fbStorage.getMetadata = originalGetMetadata;
    });

    describe('storeFileHash', () => {
        it('stores the md5Hash from file metadata in state.fileHashes', async () => {
            fbStorage.getMetadata = jest.fn().mockResolvedValue({ md5Hash: 'hash_abc123' });
            const fileRef = { fullPath: 'user@gmail.com/2026.csv' };

            await storeFileHash(fileRef);

            expect(fbStorage.getMetadata).toHaveBeenCalledWith(fileRef);
            expect(state.fileHashes['user@gmail.com/2026.csv']).toBe('hash_abc123');
        });

        it('sets hash to null if metadata fetch fails', async () => {
            fbStorage.getMetadata = jest.fn().mockRejectedValue(new Error('Object not found'));
            const fileRef = { fullPath: 'user@gmail.com/newfile.csv' };

            await storeFileHash(fileRef);

            expect(state.fileHashes['user@gmail.com/newfile.csv']).toBeNull();
        });
    });

    describe('verifyFileHashBeforeUpload', () => {
        const fileRef = { fullPath: 'user@gmail.com/2026.csv' };

        it('throws CONFLICT_DETECTED if local hash is undefined and file exists in cloud (prevents blind overwrite from stale/unverified device)', async () => {
            fbStorage.getMetadata = jest.fn().mockResolvedValue({ md5Hash: 'cloud_hash_999' });
            delete state.fileHashes[fileRef.fullPath];

            await expect(verifyFileHashBeforeUpload(fileRef)).rejects.toThrow('CONFLICT_DETECTED');
        });

        it('throws CONFLICT_DETECTED if local hash is null and file exists in cloud', async () => {
            fbStorage.getMetadata = jest.fn().mockResolvedValue({ md5Hash: 'cloud_hash_999' });
            state.fileHashes[fileRef.fullPath] = null;

            await expect(verifyFileHashBeforeUpload(fileRef)).rejects.toThrow('CONFLICT_DETECTED');
        });

        it('throws CONFLICT_DETECTED if local hash does not match cloud md5Hash', async () => {
            fbStorage.getMetadata = jest.fn().mockResolvedValue({ md5Hash: 'cloud_hash_newer' });
            state.fileHashes[fileRef.fullPath] = 'local_hash_older';

            await expect(verifyFileHashBeforeUpload(fileRef)).rejects.toThrow('CONFLICT_DETECTED');
        });

        it('succeeds without error when local hash matches cloud md5Hash', async () => {
            fbStorage.getMetadata = jest.fn().mockResolvedValue({ md5Hash: 'matching_hash' });
            state.fileHashes[fileRef.fullPath] = 'matching_hash';

            await expect(verifyFileHashBeforeUpload(fileRef)).resolves.toBeUndefined();
        });

        it('succeeds without error when file does not exist in cloud (storage/object-not-found)', async () => {
            const notFoundErr = new Error('Object does not exist');
            notFoundErr.code = 'storage/object-not-found';
            fbStorage.getMetadata = jest.fn().mockRejectedValue(notFoundErr);

            await expect(verifyFileHashBeforeUpload(fileRef)).resolves.toBeUndefined();
        });

        it('rethrows unexpected network errors to prevent unverified uploads', async () => {
            const networkErr = new Error('Network timeout');
            networkErr.code = 'storage/retry-limit-exceeded';
            fbStorage.getMetadata = jest.fn().mockRejectedValue(networkErr);

            await expect(verifyFileHashBeforeUpload(fileRef)).rejects.toThrow('Network timeout');
        });
    });

    describe('processScheduledTransactions conflict handling', () => {
        it('aborts, rolls back next_run_date, and does not call saveScheduledCSV when saveYearCSV encounters a CONFLICT_DETECTED', async () => {
            const storageModule = require('../js/services/storage.js');
            const formModule = require('../js/ui/form.js');

            const spySaveYear = jest.spyOn(formModule, 'saveYearCSV').mockRejectedValue(new Error('CONFLICT_DETECTED'));
            const spySaveSched = jest.spyOn(storageModule, 'saveScheduledCSV').mockResolvedValue();

            state.expenses = [];
            state.scheduledTransactions = [{
                id: 'sched_test_conflict',
                frequency: 'monthly',
                amount: 500,
                category: 'Bills',
                txnType: 'Expense',
                txnMode: 'UPI',
                note: 'Wifi',
                start_date: '2026-01-01',
                next_run_date: '2026-01-01',
                run_count: 0,
                disabled: false
            }];

            const result = await storageModule.processScheduledTransactions();

            expect(result).toBe(false);
            expect(spySaveYear).toHaveBeenCalled();
            expect(spySaveSched).not.toHaveBeenCalled();

            // Crucial check: next_run_date MUST NOT be advanced so the transaction is not skipped permanently
            expect(state.scheduledTransactions[0].next_run_date).toBe('2026-01-01');
            expect(state.scheduledTransactions[0].run_count).toBe(0);
            expect(state.expenses.length).toBe(0);

            spySaveYear.mockRestore();
            spySaveSched.mockRestore();
        });

        it('does not splice one-off scheduled transactions when saveYearCSV encounters CONFLICT_DETECTED', async () => {
            const storageModule = require('../js/services/storage.js');
            const formModule = require('../js/ui/form.js');

            const spySaveYear = jest.spyOn(formModule, 'saveYearCSV').mockRejectedValue(new Error('CONFLICT_DETECTED'));
            const spySaveSched = jest.spyOn(storageModule, 'saveScheduledCSV').mockResolvedValue();

            state.expenses = [];
            state.scheduledTransactions = [{
                id: 'sched_oneoff_conflict',
                frequency: 'one-off',
                amount: 1500,
                category: 'Shopping',
                txnType: 'Expense',
                txnMode: 'Card',
                note: 'Gift',
                start_date: '2026-01-01',
                next_run_date: '2026-01-01',
                disabled: false
            }];

            const result = await storageModule.processScheduledTransactions();

            expect(result).toBe(false);
            // One-off schedule must still be present and not deleted
            expect(state.scheduledTransactions.length).toBe(1);
            expect(state.scheduledTransactions[0].id).toBe('sched_oneoff_conflict');
            expect(state.scheduledTransactions[0].next_run_date).toBe('2026-01-01');

            spySaveYear.mockRestore();
            spySaveSched.mockRestore();
        });

        it('reverts next_run_date if saveScheduledCSV fails with CONFLICT_DETECTED', async () => {
            const storageModule = require('../js/services/storage.js');
            const formModule = require('../js/ui/form.js');

            const spySaveYear = jest.spyOn(formModule, 'saveYearCSV').mockResolvedValue();

            // Set up a hash mismatch for scheduled_transaction.csv
            state.fileHashes['testuser@gmail.com/scheduled_transaction.csv'] = 'local_sched_hash';
            fbStorage.getMetadata = jest.fn().mockImplementation((ref) => {
                if (ref.fullPath.includes('scheduled_transaction.csv')) {
                    return Promise.resolve({ md5Hash: 'conflict_cloud_hash' });
                }
                return Promise.resolve({ md5Hash: 'matching_hash' });
            });

            state.expenses = [];
            state.scheduledTransactions = [{
                id: 'sched_save_fail',
                frequency: 'monthly',
                amount: 200,
                category: 'Food',
                txnType: 'Expense',
                txnMode: 'UPI',
                note: 'Snacks',
                start_date: '2026-01-01',
                next_run_date: '2026-01-01',
                run_count: 0,
                disabled: false
            }];

            const result = await storageModule.processScheduledTransactions();

            expect(result).toBe(false);
            expect(state.scheduledTransactions[0].next_run_date).toBe('2026-01-01');

            spySaveYear.mockRestore();
        });
    });
});

