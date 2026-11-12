import { state } from '../js/core/state.js';

jest.mock('../js/services/storage.js', () => ({
    uploadFile: jest.fn().mockResolvedValue(true),
    getCsvContent: jest.fn().mockResolvedValue('')
}));
jest.mock('../js/services/auth.js', () => ({ getRequiredEmail: jest.fn(() => 'test@example.com') }));
jest.mock('../js/utils/helpers.js', () => ({ toast: jest.fn() }));
jest.mock('../js/services/split_service.js', () => ({
    saveSplitBills: jest.fn().mockResolvedValue(true)
}));

import { cleanupExpiredTrash } from '../js/services/activity.js';
import { saveSplitBills } from '../js/services/split_service.js';

describe('Split Tool trash retention', () => {
    beforeEach(() => {
        localStorage.clear();
        state.splitBills = [];
        state.activityHistory = [];
        state.activityLoaded = false;
        jest.clearAllMocks();
    });

    it('uses the configured retention period and permanently removes expired split bills', async () => {
        localStorage.setItem('expman_trash_retention_days', '30');
        const now = Date.now();
        state.splitBills = [
            { id: 'expired', deleted: true, deletedAt: new Date(now - 31 * 86400000).toISOString() },
            { id: 'recent', deleted: true, deletedAt: new Date(now - 29 * 86400000).toISOString() },
            { id: 'active', title: 'Still active' }
        ];

        const removed = await cleanupExpiredTrash();

        expect(removed).toBe(1);
        expect(state.splitBills.map(bill => bill.id)).toEqual(['recent', 'active']);
        expect(saveSplitBills).toHaveBeenCalledTimes(1);
    });

    it('defaults invalid retention settings to 90 days and enforces the 90-day maximum', async () => {
        localStorage.setItem('expman_trash_retention_days', 'never');
        const now = Date.now();
        state.splitBills = [
            { id: 'expired', deleted: true, deletedAt: new Date(now - 91 * 86400000).toISOString() },
            { id: 'recent', deleted: true, deletedAt: new Date(now - 89 * 86400000).toISOString() }
        ];

        const removed = await cleanupExpiredTrash();

        expect(localStorage.getItem('expman_trash_retention_days')).toBe('90');
        expect(removed).toBe(1);
        expect(state.splitBills.map(bill => bill.id)).toEqual(['recent']);
        expect(saveSplitBills).toHaveBeenCalledTimes(1);
    });
});
