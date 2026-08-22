import { getDistance, resetLocationPermissionDenied } from '../js/utils/helpers.js';
import { prefillLocation } from '../js/ui/form.js';
import { state } from '../js/core/state.js';
import { getLastLocation } from '../js/utils/helpers.js';

// Mock DOM
const mockLocInput = { value: '' };
jest.mock('../js/core/init.js', () => ({
    $: jest.fn((sel) => {
        if (sel === '#input-location') return mockLocInput;
        return null;
    })
}));

describe('Location Auto-tagging', () => {
    beforeEach(() => {
        mockLocInput.value = '';
        state.locationsConfig = [];
        delete global.navigator.geolocation;
        delete global.navigator.permissions;
        localStorage.clear();
        resetLocationPermissionDenied();
        jest.clearAllMocks();
    });

    it('calculates Haversine distance correctly', () => {
        // Distance between Gurugram (28.4595, 77.0266) and New Delhi (28.6139, 77.2090)
        // Expected ~ 24.8 km
        const dist = getDistance(28.4595, 77.0266, 28.6139, 77.2090);
        expect(dist).toBeGreaterThan(24000);
        expect(dist).toBeLessThan(26000);

        // Distance to same point is 0
        expect(getDistance(28.4595, 77.0266, 28.4595, 77.0266)).toBeCloseTo(0);
    });

    it('does NOT call navigator.geolocation.getCurrentPosition when locationsConfig is empty', async () => {
        state.expenses = [{ location: 'Gurugram' }];
        state.locationsConfig = [];

        const getPosMock = jest.fn();
        global.navigator.geolocation = { getCurrentPosition: getPosMock };

        await prefillLocation();

        expect(getPosMock).not.toHaveBeenCalled();
        expect(mockLocInput.value).toBe('Gurugram');
    });

    it('falls back to getLastLocation if GPS is not available', async () => {
        state.expenses = [{ location: 'Gurugram' }];
        
        await prefillLocation();
        
        expect(mockLocInput.value).toBe('Gurugram');
    });

    it('falls back to getLastLocation and persists permission denial if GPS permission error occurs', async () => {
        state.expenses = [{ location: 'Last Loc' }];
        state.locationsConfig = [{ tag: 'Home', lat: 28.0, lon: 77.0, radius: 100 }];
        
        // Mock geolocation with permission error (code 1)
        const getPosMock = jest.fn((success, error) => {
            const err = new Error('User denied Geolocation');
            err.code = 1;
            error(err);
        });
        global.navigator.geolocation = { getCurrentPosition: getPosMock };

        await prefillLocation();
        
        expect(mockLocInput.value).toBe('Last Loc');
        expect(localStorage.getItem('expman_location_permission_denied')).toBe('true');

        // Subsequent call should skip getCurrentPosition completely because permission denial is saved
        getPosMock.mockClear();
        await prefillLocation();
        expect(getPosMock).not.toHaveBeenCalled();
    });

    it('clears permission denial when resetLocationPermissionDenied is called', async () => {
        state.expenses = [{ location: 'Last Loc' }];
        state.locationsConfig = [{ tag: 'Home', lat: 28.0, lon: 77.0, radius: 100 }];
        
        // Trigger a permission error first to set locationPermissionDenied = true
        const deniedMock = jest.fn((success, error) => {
            const err = new Error('Denied');
            err.code = 1;
            error(err);
        });
        global.navigator.geolocation = { getCurrentPosition: deniedMock };
        await prefillLocation();
        expect(localStorage.getItem('expman_location_permission_denied')).toBe('true');

        // Subsequent call skips geolocation
        const successMock = jest.fn((success) => {
            success({ coords: { latitude: 28.0, longitude: 77.0 } });
        });
        global.navigator.geolocation = { getCurrentPosition: successMock };
        await prefillLocation();
        expect(successMock).not.toHaveBeenCalled();

        // Call resetLocationPermissionDenied (e.g. user clicked GPS button in settings)
        resetLocationPermissionDenied();
        expect(localStorage.getItem('expman_location_permission_denied')).toBeNull();

        // Now prefillLocation calls geolocation again
        await prefillLocation();
        expect(successMock).toHaveBeenCalled();
        expect(mockLocInput.value).toBe('Home');
    });

    it('sets tag if GPS matches a location within radius', async () => {
        state.locationsConfig = [
            { tag: 'Home', lat: 28.4595, lon: 77.0266, radius: 5000 },
            { tag: 'Office', lat: 28.5355, lon: 77.3910, radius: 2000 }
        ];

        // Mock geolocation returning a point 1km from Home
        global.navigator.geolocation = {
            getCurrentPosition: jest.fn((success) => {
                success({ coords: { latitude: 28.4685, longitude: 77.0266 } });
            })
        };

        await prefillLocation();
        
        expect(mockLocInput.value).toBe('Home');
    });

    it('falls back to getLastLocation if GPS does not match any location within radius', async () => {
        state.expenses = [{ location: 'Random Place' }];
        state.locationsConfig = [
            { tag: 'Home', lat: 28.4595, lon: 77.0266, radius: 100 } // 100m radius
        ];

        // Point is 1km away, outside 100m radius
        global.navigator.geolocation = {
            getCurrentPosition: jest.fn((success) => {
                success({ coords: { latitude: 28.4685, longitude: 77.0266 } });
            })
        };

        await prefillLocation();
        
        expect(mockLocInput.value).toBe('Random Place');
    });

    it('does not override existing input value', async () => {
        mockLocInput.value = 'Already Filled';
        
        await prefillLocation();
        
        expect(mockLocInput.value).toBe('Already Filled');
    });
});
