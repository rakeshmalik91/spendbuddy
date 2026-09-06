import { getDistance, resetLocationPermissionDenied, getCurrentLocationTag } from '../js/utils/helpers.js';
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

    it('getLastLocation prioritizes expman_last_location from localStorage', () => {
        state.expenses = [{ location: 'ExpenseLoc' }];
        localStorage.setItem('expman_last_location', 'SavedInStorage');

        expect(getLastLocation()).toBe('SavedInStorage');
    });

    it('resets permission denial if Android reports permission is granted', async () => {
        state.locationsConfig = [{ tag: 'Home', lat: 28.4595, lon: 77.0266, radius: 1000 }];
        localStorage.setItem('expman_location_permission_denied', 'true');

        window.Android = {
            requestLocation: jest.fn(() => {
                window.onAndroidLocationReceived(28.4595, 77.0266);
            }),
            isLocationPermissionGranted: jest.fn(() => true)
        };

        await prefillLocation();

        expect(mockLocInput.value).toBe('Home');
        expect(localStorage.getItem('expman_location_permission_denied')).toBeNull();
        delete window.Android;
    });

    it('does not treat Android "Location unavailable" as a permanent permission denial', async () => {
        state.expenses = [{ location: 'FallbackCity' }];
        state.locationsConfig = [{ tag: 'Home', lat: 28.4595, lon: 77.0266, radius: 1000 }];

        window.Android = {
            requestLocation: jest.fn(() => {
                window.onAndroidLocationError('Location unavailable');
            }),
            isLocationPermissionGranted: jest.fn(() => false)
        };

        await prefillLocation();

        expect(mockLocInput.value).toBe('FallbackCity');
        // Because it was unavailable (not denied), it must NOT set expman_location_permission_denied
        expect(localStorage.getItem('expman_location_permission_denied')).toBeNull();
        delete window.Android;
    });

    it('recovers from permission denial when navigator.permissions.query reports granted', async () => {
        state.locationsConfig = [{ tag: 'Home', lat: 28.4595, lon: 77.0266, radius: 1000 }];
        localStorage.setItem('expman_location_permission_denied', 'true');

        global.navigator.permissions = {
            query: jest.fn().mockResolvedValue({ state: 'granted' })
        };
        global.navigator.geolocation = {
            getCurrentPosition: jest.fn((success) => {
                success({ coords: { latitude: 28.4595, longitude: 77.0266 } });
            })
        };

        await prefillLocation();

        expect(mockLocInput.value).toBe('Home');
        expect(localStorage.getItem('expman_location_permission_denied')).toBeNull();
    });

    it('persists matched location to localStorage expman_last_location', async () => {
        state.locationsConfig = [{ tag: 'Office', lat: 28.5355, lon: 77.3910, radius: 2000 }];
        global.navigator.geolocation = {
            getCurrentPosition: jest.fn((success) => {
                success({ coords: { latitude: 28.5355, longitude: 77.3910 } });
            })
        };

        const tag = await getCurrentLocationTag();
        expect(tag).toBe('Office');
        expect(localStorage.getItem('expman_last_location')).toBe('Office');
        expect(localStorage.getItem('expman_location_permission_granted')).toBe('true');
    });

    it('does not trigger geolocation popup on browser when permissions.query returns prompt unless explicit', async () => {
        state.expenses = [{ location: 'FallbackCity' }];
        state.locationsConfig = [{ tag: 'Home', lat: 28.0, lon: 77.0, radius: 1000 }];

        global.navigator.permissions = {
            query: jest.fn().mockResolvedValue({ state: 'prompt' })
        };
        const getPosMock = jest.fn();
        global.navigator.geolocation = { getCurrentPosition: getPosMock };

        // Silent / default call: should return fallback without triggering getCurrentPosition
        const tag = await getCurrentLocationTag();
        expect(tag).toBe('FallbackCity');
        expect(getPosMock).not.toHaveBeenCalled();

        // Explicit call (e.g. user clicked Detect button): should proceed to getCurrentPosition
        getPosMock.mockImplementation((success) => {
            success({ coords: { latitude: 28.0, longitude: 77.0 } });
        });
        const explicitTag = await getCurrentLocationTag({ explicit: true });
        expect(getPosMock).toHaveBeenCalled();
        expect(explicitTag).toBe('Home');
    });

    it('does not call window.Android.requestLocation if Android permission is not granted unless explicit', async () => {
        state.expenses = [{ location: 'FallbackCity' }];
        state.locationsConfig = [{ tag: 'Home', lat: 28.0, lon: 77.0, radius: 1000 }];

        const reqMock = jest.fn();
        window.Android = {
            requestLocation: reqMock,
            isLocationPermissionGranted: jest.fn(() => false)
        };

        // Automated call: should not spam permission dialog
        const tag = await getCurrentLocationTag();
        expect(tag).toBe('FallbackCity');
        expect(reqMock).not.toHaveBeenCalled();

        // Explicit call: should trigger requestLocation
        reqMock.mockImplementation(() => {
            window.onAndroidLocationReceived(28.0, 77.0);
        });
        const explicitTag = await getCurrentLocationTag({ explicit: true });
        expect(reqMock).toHaveBeenCalled();
        expect(explicitTag).toBe('Home');
        delete window.Android;
    });
});


