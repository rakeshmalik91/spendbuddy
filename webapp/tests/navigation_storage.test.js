import * as storage from '../js/services/storage.js';
import { switchView } from '../js/ui/navigation.js';
import { state } from '../js/core/state.js';
import * as init from '../js/core/init.js';
import * as formDropdowns from '../js/ui/form_dropdowns.js';
import * as renderAll from '../js/ui/render_all.js';
import * as helpers from '../js/utils/helpers.js';
import * as settings from '../js/ui/settings.js';

// Helper to mock document queries globally
const domElements = {};
const getOrCreateMockDom = (selector) => {
    if (!domElements[selector]) {
        domElements[selector] = {
            classList: { add: jest.fn(), remove: jest.fn() },
            style: {},
            id: selector.replace(/^[.#]/, ''),
            addEventListener: jest.fn()
        };
    }
    return domElements[selector];
};
global.mockDomFn = getOrCreateMockDom;

// Mock dependencies
jest.mock("https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js", () => require('./__mocks__/firebase-mock.js'), {virtual: true});

jest.mock('../js/core/init.js', () => ({
    showLoader: jest.fn(),
    hideLoader: jest.fn(),
    $: jest.fn((sel) => global.mockDomFn(sel)),
    $$: jest.fn((sel) => [global.mockDomFn(sel)])
}));

jest.mock('../js/ui/form_dropdowns.js', () => ({
    populateNoteSuggestions: jest.fn()
}));
jest.mock('../js/ui/render_all.js', () => ({
    renderAll: jest.fn()
}));
jest.mock('../js/utils/helpers.js', () => ({
    toast: jest.fn(),
    getLocalDateString: jest.fn(),
    getUserEmail: jest.fn(),
    isMobileView: jest.fn(() => false)
}));

jest.mock('../js/ui/settings.js', () => ({ renderSettings: jest.fn() }));
jest.mock('../js/ui/time_filter.js', () => ({ updateTimeFilterUI: jest.fn() }));
jest.mock('../js/ui/dashboard.js', () => ({ renderDashboard: jest.fn() }));
jest.mock('../js/ui/transactions.js', () => ({ renderTransactions: jest.fn() }));
jest.mock('../js/ui/charts.js', () => ({ renderChartsPage: jest.fn() }));
jest.mock('../js/ui/chart_builders.js', () => ({ renderScheduledTransactions: jest.fn() }));
jest.mock('../js/ui/form.js', () => ({ resetForm: jest.fn() }));

// Mock Papa parse globally
global.Papa = {
    parse: jest.fn()
};

beforeAll(() => {
    // Setup globals needed for navigation view logic
    document.querySelector = jest.fn(selector => {
        if (selector === '.view.active') return { id: 'view-dashboard' };
        return getOrCreateMockDom(selector);
    });
    
    document.getElementById = jest.fn(id => getOrCreateMockDom('#' + id));
    
    // History API
    window.history.pushState = jest.fn();
    window.scrollTo = jest.fn();
    
    // Background sync function
    window.syncCloudDataInBackground = jest.fn();
});

describe('Historical Data Fetching & Cache Handling', () => {

    beforeEach(() => {
        // Reset state
        state.loadedYears = new Set();
        state.availableFiles = null;
        state.expenses = [];
        state.historicalLoaded = false;

        // Reset mocks
        jest.clearAllMocks();

        // Clear local storage & Android cache
        localStorage.clear();
        delete window.Android;
    });

    describe('isCsvInCache', () => {
        it('returns true when file is in Android cache', () => {
            window.Android = { readLocalCsv: jest.fn().mockReturnValue('dummy,csv,data') };
            expect(storage.isCsvInCache('2024.csv')).toBe(true);
            expect(window.Android.readLocalCsv).toHaveBeenCalledWith('2024.csv');
        });

        it('returns true when file is in web localStorage', () => {
            localStorage.setItem('expman_cache_2023.csv', 'some,csv,data');
            expect(storage.isCsvInCache('2023.csv')).toBe(true);
        });

        it('returns false when cache is empty', () => {
            expect(storage.isCsvInCache('2022.csv')).toBe(false);
        });
    });

    describe('fetchYearCSVIfNeeded', () => {
        beforeEach(() => {
            // Provide a dummy CSV in localStorage for fetchYearCSVIfNeeded to read
            // Because we don't want to mock the internal getCsvContent function
            localStorage.setItem('expman_cache_2024.csv', 'id,Amount,Date\n1,100,2024-05-01');
            
            Papa.parse.mockReturnValue({
                data: [{ id: '1', Amount: '100', Date: '2024-05-01' }]
            });

            // Prevent early return due to file not existing in availableFiles
            state.availableFiles = new Set(['2024.csv', '2025.csv']);
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('skips fetching if year is already loaded', async () => {
            state.loadedYears.add(2023);
            await storage.fetchYearCSVIfNeeded(2023);
            expect(Papa.parse).not.toHaveBeenCalled();
        });

        it('skips fetching if availableFiles is loaded but year is missing', async () => {
            // override the beforeEach value
            state.availableFiles = new Set(['2024.csv']);
            await storage.fetchYearCSVIfNeeded(2022);
            expect(Papa.parse).not.toHaveBeenCalled();
            expect(state.loadedYears.has(2022)).toBe(true);
        });

        it('shows loader if CSV is not in cache (needs network)', async () => {
            // Firebase mock will return empty string by default which causes Papa to not be called, 
            // but loader should show
            await storage.fetchYearCSVIfNeeded(2025);
            expect(init.showLoader).toHaveBeenCalledWith('Fetching 2025 data...');
            expect(init.hideLoader).toHaveBeenCalled();
        });

        it('does not show loader if CSV is present in cache', async () => {
            await storage.fetchYearCSVIfNeeded(2024);
            expect(init.showLoader).not.toHaveBeenCalled();
            // hideLoader shouldn't be called if network wasn't needed
            expect(init.hideLoader).not.toHaveBeenCalled();
        });

        it('parses data, updates state, and triggers UI renders', async () => {
            helpers.isMobileView.mockReturnValue(false);
            await storage.fetchYearCSVIfNeeded(2024);
            expect(Papa.parse).toHaveBeenCalled();
            expect(state.expenses.length).toBe(1);
            expect(state.expenses[0].amount).toBe(100);
            expect(formDropdowns.populateNoteSuggestions).toHaveBeenCalled();
            expect(renderAll.renderAll).toHaveBeenCalled();
            expect(helpers.toast).toHaveBeenCalledWith('Loaded 1 transactions for 2024', 'success');
        });

        it('suppresses loaded toast when on mobile', async () => {
            helpers.toast.mockClear();
            helpers.isMobileView.mockReturnValue(true);
            await storage.fetchYearCSVIfNeeded(2024);
            expect(helpers.toast).not.toHaveBeenCalledWith(expect.stringContaining('Loaded'), expect.anything());
        });
    });

    describe('loadHistoricalData', () => {
        let listAllMock;
        let getBytesMock;

        beforeEach(() => {
            // Mock firebase functions
            const firebaseStorage = require('https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js');
            listAllMock = jest.spyOn(firebaseStorage, 'listAll').mockResolvedValue({ items: [
                {name: '2022.csv'}, {name: '2023.csv'}, {name: '2024.csv'}, {name: '2025.csv'}
            ] });
            getBytesMock = jest.spyOn(firebaseStorage, 'getBytes').mockResolvedValue(new Uint8Array());
            
            Papa.parse.mockImplementation((text) => {
                if (text.includes('200')) {
                    return { data: [{ id: '2', Amount: '200', Date: '2023-01-01' }] };
                }
                return { data: [] };
            });
            
            // Mock current year
            jest.useFakeTimers().setSystemTime(new Date('2024-01-01'));
        });

        afterEach(() => {
            jest.useRealTimers();
            jest.restoreAllMocks();
        });

        it('skips if already historically loaded', async () => {
            state.historicalLoaded = true;
            await storage.loadHistoricalData();
            expect(listAllMock).not.toHaveBeenCalled();
        });

        it('loads adjacent years (currentYear-1, currentYear-2, currentYear+1)', async () => {
            // Load them into cache to avoid firebase fetch complexity for this test
            localStorage.setItem('expman_cache_2022.csv', 'dummy');
            localStorage.setItem('expman_cache_2023.csv', 'id,Amount,Date\n2,200,2023-01-01');
            localStorage.setItem('expman_cache_2025.csv', 'dummy');
            
            await storage.loadHistoricalData();
            
            expect(state.loadedYears.has(2022)).toBe(true);
            expect(state.loadedYears.has(2023)).toBe(true);
            expect(state.loadedYears.has(2025)).toBe(true);
            expect(state.historicalLoaded).toBe(true);
            expect(state.expenses.length).toBe(1);
            expect(state.expenses[0].amount).toBe(200);
        });

        it('filters years based on availableFiles if set', async () => {
            // Mock listAll to return specific files
            listAllMock.mockResolvedValue({ items: [{name: '2023.csv'}, {name: '2024.csv'}] });
            localStorage.setItem('expman_cache_2023.csv', 'dummy');

            await storage.loadHistoricalData();
            
            expect(state.loadedYears.has(2023)).toBe(true);
            expect(state.loadedYears.has(2022)).toBe(false); // Filtered out
            expect(state.loadedYears.has(2025)).toBe(false); // Filtered out
        });

        it('handles caching UI correctly when loading historical data', async () => {
            // In loadHistoricalData, needsNetwork becomes true if ANY file is not in cache
            localStorage.setItem('expman_cache_2023.csv', 'dummy');
            // 2022 and 2025 are missing from cache -> needsNetwork = true
            
            // Mock document.getElementById for sync-indicator
            const classListMock = { remove: jest.fn(), add: jest.fn() };
            document.getElementById = jest.fn().mockReturnValue({ classList: classListMock });
            
            await storage.loadHistoricalData();
            
            expect(init.showLoader).toHaveBeenCalledWith('Fetching historical data...');
            expect(init.hideLoader).toHaveBeenCalled();
            // syncCloudDataInBackground will call classList.remove('hidden')
            expect(classListMock.remove).toHaveBeenCalledWith('hidden');
        });

        it('shows sync indicator instead of loader if all files are in cache', async () => {
            localStorage.setItem('expman_cache_2022.csv', 'dummy');
            localStorage.setItem('expman_cache_2023.csv', 'dummy');
            localStorage.setItem('expman_cache_2025.csv', 'dummy');

            const classListMock = { remove: jest.fn(), add: jest.fn() };
            document.getElementById = jest.fn().mockReturnValue({ classList: classListMock });

            await storage.loadHistoricalData();

            expect(init.showLoader).not.toHaveBeenCalled();
            expect(classListMock.remove).toHaveBeenCalledWith('hidden'); // shows sync indicator directly or via syncCloudDataInBackground
            // hides it after sync complete
        });
    });

});

describe('Navigation (switchView) - Settings & Caching/Fetching', () => {
    
    beforeAll(() => {
        // Re-apply DOM mocks because previous test suites might have overwritten them
        document.querySelector = jest.fn(selector => {
            if (selector === '.view.active') return { id: 'view-dashboard' };
            return getOrCreateMockDom(selector);
        });
        
        document.getElementById = jest.fn(id => getOrCreateMockDom('#' + id));
    });

    beforeEach(() => {
        jest.clearAllMocks();
        state.previousView = 'dashboard';
        
        // Advance mock Date.now to control the 5-minute cooldown and avoid cross-test pollution
        global.mockTime = (global.mockTime || 1000000) + 10 * 60 * 1000;
        jest.spyOn(Date, 'now').mockImplementation(() => global.mockTime);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('navigating to settings fetches user_settings.json in background', () => {
        switchView('settings', false);
        
        expect(settings.renderSettings).toHaveBeenCalled();
        expect(window.syncCloudDataInBackground).toHaveBeenCalledWith(['user_settings.json']);
    });

    it('navigating to categories fetches metadata.csv in background', () => {
        switchView('categories', false);
        
        expect(settings.renderSettings).toHaveBeenCalled();
        expect(window.syncCloudDataInBackground).toHaveBeenCalledWith(['metadata.csv']);
    });

    it('navigating to txnmodes fetches metadata.csv in background', () => {
        switchView('txnmodes', false);
        
        expect(settings.renderSettings).toHaveBeenCalled();
        expect(window.syncCloudDataInBackground).toHaveBeenCalledWith(['metadata.csv']);
    });

    it('navigating to locations calls renderSettings but does not fetch metadata.csv', () => {
        switchView('locations', false);
        
        expect(settings.renderSettings).toHaveBeenCalled();
        // user_settings.json or metadata.csv should not be fetched just for locations view
        expect(window.syncCloudDataInBackground).not.toHaveBeenCalled();
    });

    it('skips fetching if navigating within the cooldown period (rate limited)', () => {
        // First navigation should sync
        switchView('settings', false);
        expect(window.syncCloudDataInBackground).toHaveBeenCalledTimes(1);
        
        // Reset mocks, but time hasn't advanced
        jest.clearAllMocks();
        
        // Let's change previous view so it thinks we navigated away and back
        document.querySelector.mockReturnValueOnce({ id: 'view-dashboard' });
        
        // Second navigation should NOT sync because of 5 minute cooldown
        switchView('settings', false);
        expect(settings.renderSettings).toHaveBeenCalled();
        expect(window.syncCloudDataInBackground).not.toHaveBeenCalled();
        
        // Advance time by 5 minutes and 1 second
        global.mockTime += 5 * 60 * 1000 + 1000;
        
        document.querySelector.mockReturnValueOnce({ id: 'view-dashboard' });
        switchView('settings', false);
        expect(window.syncCloudDataInBackground).toHaveBeenCalledWith(['user_settings.json']);
    });

    it('skips fetching if navigating within the same view type', () => {
        // Mock the active view to already be 'settings'
        document.querySelector.mockReturnValueOnce({ id: 'view-settings' });
        
        switchView('settings', false);
        
        // previousViewId is 'settings', so we don't fetch it again
        expect(window.syncCloudDataInBackground).not.toHaveBeenCalled();
    });
});
