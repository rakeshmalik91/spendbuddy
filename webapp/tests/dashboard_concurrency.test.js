import { state } from '../js/core/state.js';
import * as storage from '../js/services/storage.js';

jest.mock('../js/ui/render_all.js', () => ({
    renderAll: jest.fn()
}));

describe('Dashboard Quick-Add Concurrency & Failure Rollback', () => {
    beforeEach(() => {
        state.expenses = [];
        state.pendingSmsTransactions = [];
        state.rawSmsTransactions = [];
        state.scheduledTransactions = [];
        state.fileHashes = {};
        state.cloudSyncInProgress = false;
        jest.clearAllMocks();
        document.body.innerHTML = '';
    });

    it('should queue concurrent uploadFile calls to the same file path', async () => {
        const executionOrder = [];
        let currentCloudHash = 'hash-initial';

        // Mock uploadString to simulate network latency
        let resolveUpload1;
        const upload1Promise = new Promise(resolve => { resolveUpload1 = resolve; });

        let uploadCallCount = 0;
        const mockUploadString = jest.fn().mockImplementation(async (fileRef, content) => {
            uploadCallCount++;
            const callId = uploadCallCount;
            executionOrder.push(`start-${callId}`);
            if (callId === 1) {
                await upload1Promise;
            }
            currentCloudHash = `hash-${callId}`;
            executionOrder.push(`end-${callId}`);
            return { metadata: { md5Hash: `hash-${callId}` } };
        });

        const mockGetMetadata = jest.fn().mockImplementation(async (fileRef) => {
            return { md5Hash: currentCloudHash };
        });

        const fbStorage = require("https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js");
        const originalUploadString = fbStorage.uploadString;
        const originalGetMetadata = fbStorage.getMetadata;
        fbStorage.uploadString = mockUploadString;
        fbStorage.getMetadata = mockGetMetadata;

        try {
            const fileRef = { fullPath: 'user@test.com/2026.csv', name: '2026.csv' };
            state.fileHashes['user@test.com/2026.csv'] = 'hash-initial';

            // Start first upload
            const promise1 = storage.uploadFile(fileRef, 'content-1');
            // Start second upload immediately to same file
            const promise2 = storage.uploadFile(fileRef, 'content-2');

            // Wait a tick: start-1 should have executed, but start-2 should NOT have started yet
            await new Promise(r => setTimeout(r, 15));
            expect(executionOrder).toEqual(['start-1']);

            // Now resolve upload 1
            resolveUpload1();
            await Promise.all([promise1, promise2]);

            // Both should have finished in exact sequence: start-1, end-1, start-2, end-2
            expect(executionOrder).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
            expect(state.fileHashes['user@test.com/2026.csv']).toBe('hash-2');
        } finally {
            fbStorage.uploadString = originalUploadString;
            fbStorage.getMetadata = originalGetMetadata;
        }
    });

    it('should roll back state.expenses and re-enable button when saveYearCSV fails on quick-add', async () => {
        const { getLocalDateString } = require('../js/utils/date_helpers.js');
        const todayStr = getLocalDateString();

        // Setup pending SMS transaction for today
        state.pendingSmsTransactions = [
            {
                date: todayStr,
                amount: 250,
                merchant: 'Zomato',
                transactionMode: 'UPI',
                currency: 'INR',
                source: 'SMS: AD-HDFCBK'
            }
        ];

        // Setup DOM for quick-add container
        document.body.innerHTML = `
            <div id="dashboard-quick-add"></div>
        `;

        const formModule = require('../js/ui/form.js');
        const originalSaveYearCSV = formModule.saveYearCSV;
        formModule.saveYearCSV = jest.fn().mockRejectedValue(new Error('CONFLICT_DETECTED'));

        const dashboardModule = require('../js/ui/dashboard.js');
        dashboardModule.renderQuickAdd();

        const btn = document.querySelector('.sms-quick-add');
        expect(btn).not.toBeNull();

        // Click the quick add button
        btn.click();

        // Wait for async handler
        await new Promise(r => setTimeout(r, 30));

        // Expect entry was rolled back from state.expenses
        expect(state.expenses.length).toBe(0);

        // Expect button was re-enabled
        expect(btn.disabled).toBe(false);
        expect(btn.style.opacity).toBe('1');

        formModule.saveYearCSV = originalSaveYearCSV;
    });

    it('should retain entry in state.expenses and consume raw SMS when quick-add succeeds', async () => {
        const { getLocalDateString } = require('../js/utils/date_helpers.js');
        const todayStr = getLocalDateString();

        state.pendingSmsTransactions = [
            {
                date: todayStr,
                amount: 300,
                merchant: 'Swiggy',
                transactionMode: 'UPI',
                currency: 'INR',
                source: 'SMS: AD-SWIGGY'
            }
        ];

        document.body.innerHTML = `
            <div id="dashboard-quick-add"></div>
        `;

        const formModule = require('../js/ui/form.js');
        const originalSaveYearCSV = formModule.saveYearCSV;
        formModule.saveYearCSV = jest.fn().mockResolvedValue();

        const smsApprovalModule = require('../js/ui/sms_approval.js');
        const consumeSpy = jest.spyOn(smsApprovalModule, 'consumeRawSmsTransaction').mockImplementation(() => {});

        try {
            const dashboardModule = require('../js/ui/dashboard.js');
            dashboardModule.renderQuickAdd();

            const btn = document.querySelector('.sms-quick-add');
            expect(btn).not.toBeNull();

            btn.click();
            await new Promise(r => setTimeout(r, 30));

            // Expense should be saved in state.expenses
            expect(state.expenses.length).toBe(1);
            expect(state.expenses[0].note).toBe('Swiggy');
            expect(state.expenses[0].amount).toBe(300);

            // Raw SMS transaction should be consumed
            expect(consumeSpy).toHaveBeenCalled();
        } finally {
            formModule.saveYearCSV = originalSaveYearCSV;
            consumeSpy.mockRestore();
        }
    });
});
