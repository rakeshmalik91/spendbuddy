import { state } from '../js/core/state.js';

const mockLoadSplitBills = jest.fn();
const mockCleanupExpiredTrash = jest.fn().mockResolvedValue(0);

jest.mock('../js/core/init.js', () => ({
    $: selector => document.querySelector(selector),
    $$: selector => document.querySelectorAll(selector),
    showLoader: jest.fn(),
    hideLoader: jest.fn()
}));
jest.mock('../js/utils/helpers.js', () => ({
    toast: jest.fn(),
    escHtml: value => String(value ?? ''),
    getLocalDateString: () => '2026-11-12',
    formatDate: value => String(value)
}));
jest.mock('../js/ui/modal.js', () => ({ openModal: jest.fn() }));
jest.mock('../js/services/activity.js', () => ({ cleanupExpiredTrash: mockCleanupExpiredTrash }));
jest.mock('../js/services/split_service.js', () => ({
    loadSplitBills: mockLoadSplitBills,
    saveSplitBills: jest.fn(),
    getKnownPeople: jest.fn(() => []),
    calculateSplit: jest.fn(value => value),
    addOrUpdateSplitBill: jest.fn(),
    deleteSplitBill: jest.fn(),
    restoreSplitBill: jest.fn(),
    permanentlyDeleteSplitBill: jest.fn(),
    roundAmount: value => Number(value) || 0
}));

import { renderSplitTool } from '../js/ui/split_tool.js';

describe('Split Tool Trash filter UI', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="split-group-filters"></div>
            <datalist id="split-known-groups-list"></datalist>
            <div id="split-history-list"></div>
            <div id="split-empty-state"><h3></h3><p></p></div>
            <div id="split-stat-count"></div>
            <div id="split-stat-volume"></div>
            <div id="split-stat-people"></div>
            <div id="split-stat-my-share"></div>
        `;
        state.splitBills = [];
        state.splitBillsLoaded = false;
        state.splitRecentPeople = [];
        mockLoadSplitBills.mockImplementation(async () => {
            state.splitBills = [
                { id: 'active', title: 'Current bill', group: 'Travel', participants: [] },
                { id: 'deleted', title: 'Trashed bill', group: 'Travel', deleted: true, deletedAt: new Date().toISOString(), participants: [] }
            ];
            state.splitBillsLoaded = true;
            return state.splitBills;
        });
        mockCleanupExpiredTrash.mockClear();
    });

    it('shows Trash beside built-in filters and displays its deleted count', async () => {
        await renderSplitTool();

        const filters = [...document.querySelectorAll('.split-group-filter')];
        expect(filters.map(button => button.dataset.group)).toEqual(['all', 'ungrouped', 'trash', 'Travel']);
        expect(filters[2].textContent).toContain('🗑️');
        expect(filters[2].textContent).toContain('Trash (1)');
        expect(filters[2].classList.contains('split-group-filter-trash')).toBe(true);
    });

    it('shows trashed bills with restore and permanent-delete actions', async () => {
        await renderSplitTool();

        document.querySelector('[data-group="trash"]').click();

        expect(document.querySelector('#split-history-list').textContent).toContain('Trashed bill');
        expect(document.querySelector('#split-history-list').innerHTML).toContain('restoreSplitBill');
        expect(document.querySelector('#split-history-list').innerHTML).toContain('confirmPermanentlyDeleteSplitBill');
    });

    it('runs the shared retention cleanup after split bills have loaded', async () => {
        await renderSplitTool();

        expect(mockLoadSplitBills).toHaveBeenCalled();
        expect(mockCleanupExpiredTrash).toHaveBeenCalled();
    });
});
