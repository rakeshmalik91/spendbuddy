import { state } from "../core/state.js";

/* ══════════════ LOCATION HELPERS ══════════════ */

/**
 * Haversine distance between two lat/lon points, returned in metres.
 */
export function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180; // φ, λ in radians
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in metres
}

export function getLastLocation() {
    let lastLoc = 'Gurugram';
    if (state.expenses && state.expenses.length > 0) {
        const latestWithLoc = state.expenses.find(e => e.location && e.location.trim() !== '');
        if (latestWithLoc) {
            lastLoc = latestWithLoc.location;
        }
    }
    return lastLoc;
}

let locationPermissionDenied = typeof localStorage !== 'undefined' && localStorage.getItem('expman_location_permission_denied') === 'true';

/**
 * Resets the location permission denied flag (e.g. when user explicitly clicks GPS button in settings).
 */
export function resetLocationPermissionDenied() {
    locationPermissionDenied = false;
    if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('expman_location_permission_denied');
    }
}

/**
 * Gets the current location tag via geolocation, falling back to getLastLocation() if unavailable or no match found.
 * @returns {Promise<string>} The best location tag.
 */
export async function getCurrentLocationTag() {
    const fallback = getLastLocation();

    // Check if permission previously denied or geolocation API not supported in browser
    if (locationPermissionDenied || (typeof navigator !== 'undefined' && !navigator.geolocation)) {
        return fallback;
    }

    // CRITICAL FIX FOR IPAD / CHROME: If no geofenced locations are configured in settings,
    // DO NOT call navigator.geolocation.getCurrentPosition() because it can never match any location tag
    // and will unnecessarily prompt the user for location permission every time!
    if (!state.locationsConfig || state.locationsConfig.length === 0) {
        return fallback;
    }

    // Check permissions API if supported by the browser to avoid unexpected prompt popups when denied
    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
        try {
            const permStatus = await navigator.permissions.query({ name: 'geolocation' });
            if (permStatus && permStatus.state === 'denied') {
                locationPermissionDenied = true;
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem('expman_location_permission_denied', 'true');
                }
                return fallback;
            }
        } catch (e) {
            // Ignore query errors on browsers with limited Permissions API implementation
        }
    }

    // Helper to request device location robustly
    const getDeviceLocation = () => {
        return new Promise((res, rej) => {
            if (typeof window !== 'undefined' && window.Android && window.Android.requestLocation) {
                window.onAndroidLocationReceived = (lat, lon) => {
                    res({ coords: { latitude: lat, longitude: lon } });
                    delete window.onAndroidLocationReceived;
                    delete window.onAndroidLocationError;
                };
                window.onAndroidLocationError = (msg) => {
                    rej({ code: 1, message: msg });
                    delete window.onAndroidLocationReceived;
                    delete window.onAndroidLocationError;
                };
                window.Android.requestLocation();
            } else if (typeof navigator !== 'undefined' && navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000, maximumAge: 60000 });
            } else {
                rej({ code: 2, message: 'Not supported' });
            }
        });
    };

    try {
        const position = await getDeviceLocation();
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        for (const loc of state.locationsConfig) {
            if (getDistance(lat, lon, loc.lat, loc.lon) <= loc.radius) {
                return loc.tag;
            }
        }
        return fallback;
    } catch (error) {
        console.warn("getCurrentLocationTag geolocation error:", error);
        if (error && error.code === 1) { // PERMISSION_DENIED
            locationPermissionDenied = true;
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('expman_location_permission_denied', 'true');
            }
        }
        return fallback;
    }
}
