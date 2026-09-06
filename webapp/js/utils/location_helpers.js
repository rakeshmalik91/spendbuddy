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
    if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('expman_last_location');
        if (saved && saved.trim() !== '') return saved.trim();
    }
    if (state.expenses && state.expenses.length > 0) {
        const latestWithLoc = state.expenses.find(e => e.location && e.location.trim() !== '');
        if (latestWithLoc) {
            return latestWithLoc.location.trim();
        }
    }
    return '';
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
 * Stores matched location to localStorage ('expman_last_location') so startup and future calls retain it.
 * Does not prompt for permission unless options.explicit === true or permission is already granted.
 * @param {Object} [options]
 * @param {boolean} [options.explicit=false] - If true, allows prompting for permission (user clicked GPS/Detect).
 * @param {boolean} [options.silent=false] - If true, ensures zero popups even on browsers without Permissions API.
 * @returns {Promise<string>} The best location tag.
 */
export async function getCurrentLocationTag(options = {}) {
    if (typeof options === 'boolean') {
        options = { explicit: options };
    }
    const fallback = getLastLocation();

    const hasAndroidLocation = typeof window !== 'undefined' && window.Android && typeof window.Android.requestLocation === 'function';
    const hasBrowserGeo = typeof navigator !== 'undefined' && !!navigator.geolocation;

    if (!hasAndroidLocation && !hasBrowserGeo) {
        return fallback;
    }

    // CRITICAL FIX FOR IPAD / CHROME: If no geofenced locations are configured in settings,
    // DO NOT call geolocation APIs because it can never match any location tag
    // and will unnecessarily prompt the user for location permission every time!
    if (!state.locationsConfig || state.locationsConfig.length === 0) {
        return fallback;
    }

    // Android permission check:
    // If Android runtime permission is granted, reset any stale permission denial flag.
    // If NOT granted and not an explicit user request, avoid calling requestLocation() to prevent runtime dialog spam.
    if (hasAndroidLocation && typeof window.Android.isLocationPermissionGranted === 'function') {
        try {
            if (window.Android.isLocationPermissionGranted()) {
                resetLocationPermissionDenied();
            } else if (!options.explicit) {
                return fallback;
            }
        } catch (e) { }
    }

    // Check permissions API if supported by the browser to avoid unexpected prompt popups when denied
    // or when in 'prompt' state during silent/background execution
    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
        try {
            const permStatus = await navigator.permissions.query({ name: 'geolocation' });
            if (permStatus) {
                if (permStatus.state === 'denied') {
                    locationPermissionDenied = true;
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem('expman_location_permission_denied', 'true');
                    }
                    return fallback;
                } else if (permStatus.state === 'granted') {
                    resetLocationPermissionDenied();
                } else if (permStatus.state === 'prompt' && !options.explicit) {
                    // In 'prompt' state, do not trigger native prompt on automatic background checks
                    return fallback;
                }
            }
        } catch (e) {
            // Ignore query errors on browsers with limited Permissions API implementation
        }
    } else if (options.silent && typeof localStorage !== 'undefined' && localStorage.getItem('expman_location_permission_granted') !== 'true') {
        // In browsers without Permissions API, do not trigger popup on silent startup unless previously granted
        return fallback;
    }

    if (locationPermissionDenied && !options.explicit) {
        return fallback;
    }

    // Helper to request device location robustly with a timeout safety
    const getDeviceLocation = () => {
        return new Promise((res, rej) => {
            let settled = false;
            const timeoutId = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    if (typeof window !== 'undefined') {
                        delete window.onAndroidLocationReceived;
                        delete window.onAndroidLocationError;
                    }
                    rej({ code: 3, message: 'Location request timed out' });
                }
            }, 10000);

            if (hasAndroidLocation) {
                window.onAndroidLocationReceived = (lat, lon) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeoutId);
                    res({ coords: { latitude: Number(lat), longitude: Number(lon) } });
                    delete window.onAndroidLocationReceived;
                    delete window.onAndroidLocationError;
                };
                window.onAndroidLocationError = (msg) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeoutId);
                    const isDenied = typeof msg === 'string' && msg.toLowerCase().includes('denied');
                    rej({ code: isDenied ? 1 : 2, message: msg || 'Android location error' });
                    delete window.onAndroidLocationReceived;
                    delete window.onAndroidLocationError;
                };
                try {
                    window.Android.requestLocation();
                } catch (e) {
                    if (!settled) {
                        settled = true;
                        clearTimeout(timeoutId);
                        rej({ code: 2, message: e.message });
                    }
                }
            } else if (hasBrowserGeo) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timeoutId);
                        res(pos);
                    },
                    (err) => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timeoutId);
                        rej(err);
                    },
                    { timeout: 10000, maximumAge: 60000 }
                );
            } else {
                clearTimeout(timeoutId);
                rej({ code: 2, message: 'Not supported' });
            }
        });
    };

    try {
        const position = await getDeviceLocation();
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('expman_location_permission_granted', 'true');
        }
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        let bestLoc = null;
        let minDistance = Infinity;
        for (const loc of state.locationsConfig) {
            const dist = getDistance(lat, lon, loc.lat, loc.lon);
            if (dist <= loc.radius && dist < minDistance) {
                minDistance = dist;
                bestLoc = loc;
            }
        }
        if (bestLoc) {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('expman_last_location', bestLoc.tag);
            }
            return bestLoc.tag;
        }
        return fallback;
    } catch (error) {
        console.warn("getCurrentLocationTag geolocation error:", error);
        if (error && error.code === 1) { // PERMISSION_DENIED
            locationPermissionDenied = true;
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('expman_location_permission_denied', 'true');
                localStorage.removeItem('expman_location_permission_granted');
            }
        }
        return fallback;
    }
}
