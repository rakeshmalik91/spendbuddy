import fs from 'fs';
import path from 'path';
import { state } from '../js/core/state.js';

jest.mock('../js/services/activity.js', () => ({
    recordActivity: jest.fn().mockResolvedValue({ id: 'activity-test' })
}));
jest.mock('../js/ui/form.js', () => ({ saveYearCSV: jest.fn().mockResolvedValue(true) }));
jest.mock('../js/services/storage.js', () => ({
    amountToStr: value => String(value),
    saveScheduledCSV: jest.fn().mockResolvedValue(true)
}));
jest.mock('../js/utils/helpers.js', () => ({
    toast: jest.fn(),
    getCurrentLocationTag: jest.fn().mockResolvedValue('')
}));
jest.mock('../js/ui/render_all.js', () => ({ renderAll: jest.fn() }));
jest.mock('../js/core/init.js', () => ({ showLoader: jest.fn(), hideLoader: jest.fn() }));

import { executeScheduledCommit } from '../js/ui/scheduled_approval.js';
import { recordActivity } from '../js/services/activity.js';

const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

describe('transaction activity-history coverage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        state.expenses = [];
        state.scheduledTransactions = [];
        state.fileHashes = {};
    });

    it('records each successfully persisted scheduled transaction', async () => {
        const candidate = {
            date: '2026-11-10', amount: 250, category: 'Bills', txnType: 'Expense',
            txnMode: 'UPI', note: 'Internet', source: 'Schedule', txnId: 'sched-1'
        };
        await executeScheduledCommit({ approvedCandidates: [candidate], simulationData: [] });
        expect(recordActivity).toHaveBeenCalledTimes(1);
        expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({
            action: 'added', type: 'txn', source: 'Schedule', txn: expect.objectContaining({ note: 'Internet' })
        }));
    });

    it('wires manual form and inline quick edit to update/add activity events', () => {
        const form = source('js/ui/form.js');
        const inline = source('js/ui/transactions.js');
        expect(form).toMatch(/action:\s*"updated",\s*type:\s*"txn"/);
        expect(form).toMatch(/action:\s*"added",\s*type:/);
        expect(inline).toMatch(/action:\s*'updated',\s*type:\s*'txn'/);
    });

    it('wires dashboard Quick Add and SMS/Email quick approval to add activity events', () => {
        const dashboard = source('js/ui/dashboard.js');
        const sms = source('js/ui/sms_approval.js');
        expect(dashboard).toMatch(/action:\s*'added',\s*type:\s*'quickadd'/);
        expect(dashboard).toMatch(/action:\s*'added',\s*type:\s*'txn'/);
        expect(sms).toMatch(/action:\s*'added',\s*type:\s*'txn'/);
    });

    it('wires bulk edits, refunds, refund-link edits and deletion paths', () => {
        expect(source('js/ui/batch_update.js')).toMatch(/action:\s*'updated',\s*type:\s*'txn'/);
        expect(source('js/ui/form.js')).toMatch(/action:\s*'added',\s*type:\s*'txn',\s*source:\s*'Refund Action'/);
        expect(source('js/ui/refund_linking_modal.js')).toMatch(/action:\s*'updated',\s*type:\s*'txn'/);
        expect(source('js/ui/modal.js')).toMatch(/action:\s*"deleted",\s*type:\s*"txn"/);
    });
});
