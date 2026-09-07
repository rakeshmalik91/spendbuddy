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

export const COUNTRY_BOUNDS = [
    { name: 'India', minLat: 6.5, maxLat: 37.5, minLon: 68.0, maxLon: 97.5 },
    { name: 'United States', minLat: 24.5, maxLat: 49.5, minLon: -125.0, maxLon: -66.9 },
    { name: 'United Kingdom', minLat: 49.8, maxLat: 60.9, minLon: -8.6, maxLon: 1.8 },
    { name: 'Canada', minLat: 41.6, maxLat: 83.1, minLon: -141.0, maxLon: -52.6 },
    { name: 'Australia', minLat: -44.0, maxLat: -10.0, minLon: 112.0, maxLon: 154.0 },
    { name: 'Germany', minLat: 47.2, maxLat: 55.1, minLon: 5.8, maxLon: 15.1 },
    { name: 'France', minLat: 41.3, maxLat: 51.1, minLon: -5.2, maxLon: 9.6 },
    { name: 'Singapore', minLat: 1.15, maxLat: 1.48, minLon: 103.59, maxLon: 104.05 },
    { name: 'United Arab Emirates', minLat: 22.5, maxLat: 26.2, minLon: 51.5, maxLon: 56.5 },
    { name: 'Japan', minLat: 24.0, maxLat: 45.6, minLon: 122.9, maxLon: 153.9 },
    { name: 'New Zealand', minLat: -47.5, maxLat: -34.0, minLon: 166.0, maxLon: 179.0 },
    { name: 'Netherlands', minLat: 50.7, maxLat: 53.7, minLon: 3.3, maxLon: 7.3 },
    { name: 'Italy', minLat: 36.6, maxLat: 47.1, minLon: 6.6, maxLon: 18.6 },
    { name: 'Spain', minLat: 35.9, maxLat: 43.8, minLon: -9.3, maxLon: 4.4 },
    { name: 'Switzerland', minLat: 45.8, maxLat: 47.9, minLon: 5.9, maxLon: 10.5 },
    { name: 'China', minLat: 18.0, maxLat: 53.6, minLon: 73.5, maxLon: 135.1 },
    { name: 'Indonesia', minLat: -11.0, maxLat: 6.1, minLon: 95.0, maxLon: 141.0 },
    { name: 'Malaysia', minLat: 0.8, maxLat: 7.4, minLon: 99.6, maxLon: 119.3 },
    { name: 'Thailand', minLat: 5.6, maxLat: 20.5, minLon: 97.3, maxLon: 105.7 },
    { name: 'Philippines', minLat: 4.6, maxLat: 21.2, minLon: 116.9, maxLon: 126.6 },
    { name: 'Vietnam', minLat: 8.5, maxLat: 23.4, minLon: 102.1, maxLon: 109.5 },
    { name: 'South Africa', minLat: -34.9, maxLat: -22.1, minLon: 16.4, maxLon: 33.0 },
    { name: 'Brazil', minLat: -33.8, maxLat: 5.3, minLon: -74.0, maxLon: -34.7 },
    { name: 'Mexico', minLat: 14.5, maxLat: 32.8, minLon: -118.5, maxLon: -86.7 },
    { name: 'Saudi Arabia', minLat: 16.3, maxLat: 32.2, minLon: 34.5, maxLon: 55.7 },
    { name: 'Ireland', minLat: 51.4, maxLat: 55.4, minLon: -10.5, maxLon: -5.9 }
];

const countryCoordCache = new Map();

/**
 * Fallback country name when geolocation is offline or cannot resolve coordinates.
 * Reads cached country in localStorage, then timezone heuristic, defaulting to 'India'.
 */
export function getFallbackCountry() {
    if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('expman_last_country');
        if (saved && saved.trim()) return saved.trim();
    }
    try {
        if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (tz) {
                if (tz.startsWith('Asia/Kolkata') || tz.startsWith('Asia/Calcutta')) return 'India';
                if (tz.startsWith('America/New_York') || tz.startsWith('America/Chicago') || tz.startsWith('America/Denver') || tz.startsWith('America/Los_Angeles')) return 'United States';
                if (tz.startsWith('Europe/London')) return 'United Kingdom';
                if (tz.startsWith('Asia/Dubai')) return 'United Arab Emirates';
                if (tz.startsWith('Asia/Singapore')) return 'Singapore';
                if (tz.startsWith('Australia/')) return 'Australia';
                if (tz.startsWith('America/Toronto') || tz.startsWith('America/Vancouver')) return 'Canada';
                if (tz.startsWith('Europe/Berlin')) return 'Germany';
                if (tz.startsWith('Europe/Paris')) return 'France';
                if (tz.startsWith('Asia/Tokyo')) return 'Japan';
            }
        }
    } catch (e) { }

    return 'India';
}

/**
 * Reverse-geocodes lat/lon to a country name.
 * Uses:
 * 1. In-memory coordinate cache
 * 2. BigDataCloud reverse geocode client API (fast, free client-side, 3s timeout)
 * 3. OpenStreetMap Nominatim reverse geocode fallback (3s timeout)
 * 4. Offline country bounding box table
 * 5. getFallbackCountry()
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<string>}
 */
export async function getCountryFromCoords(lat, lon) {
    if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
        return getFallbackCountry();
    }

    const cacheKey = `${lat.toFixed(1)},${lon.toFixed(1)}`;
    if (countryCoordCache.has(cacheKey)) {
        return countryCoordCache.get(cacheKey);
    }

    // 1. Try BigDataCloud reverse geocode client API
    if (typeof fetch === 'function') {
        try {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timeoutId = controller ? setTimeout(() => controller.abort(), 3000) : null;
            const resp = await fetch(
                `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
                controller ? { signal: controller.signal } : {}
            );
            if (timeoutId) clearTimeout(timeoutId);
            if (resp && resp.ok) {
                const data = await resp.json();
                let country = data.countryName || '';
                if (!country && data.countryCode && typeof Intl !== 'undefined' && Intl.DisplayNames) {
                    try {
                        const dn = new Intl.DisplayNames(['en'], { type: 'region' });
                        country = dn.of(data.countryCode) || '';
                    } catch (e) { }
                }
                if (country && country.trim()) {
                    country = country.trim();
                    countryCoordCache.set(cacheKey, country);
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem('expman_last_country', country);
                    }
                    return country;
                }
            }
        } catch (e) {
            // Network failure, timeout, or offline
        }

        // 2. Try Nominatim (OpenStreetMap) fallback
        try {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timeoutId = controller ? setTimeout(() => controller.abort(), 3000) : null;
            const resp = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=3&addressdetails=1`,
                controller ? { signal: controller.signal } : {}
            );
            if (timeoutId) clearTimeout(timeoutId);
            if (resp && resp.ok) {
                const data = await resp.json();
                const country = (data.address && data.address.country) || '';
                if (country && country.trim()) {
                    const trimmed = country.trim();
                    countryCoordCache.set(cacheKey, trimmed);
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem('expman_last_country', trimmed);
                    }
                    return trimmed;
                }
            }
        } catch (e) { }
    }

    // 3. Offline bounding box lookup
    for (const b of COUNTRY_BOUNDS) {
        if (lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon) {
            countryCoordCache.set(cacheKey, b.name);
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('expman_last_country', b.name);
            }
            return b.name;
        }
    }

    // 4. Fallback country heuristic
    const fallback = getFallbackCountry();
    if (fallback) {
        countryCoordCache.set(cacheKey, fallback);
        return fallback;
    }

    return '';
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

    // Avoid prompting for permission on silent startup if no locations are configured
    // and permission has not been previously granted.
    const hasGrantedPermission = typeof localStorage !== 'undefined' && localStorage.getItem('expman_location_permission_granted') === 'true';
    if ((!state.locationsConfig || state.locationsConfig.length === 0) && !options.explicit && !hasGrantedPermission) {
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
        if (state.locationsConfig && state.locationsConfig.length > 0) {
            for (const loc of state.locationsConfig) {
                const dist = getDistance(lat, lon, loc.lat, loc.lon);
                if (dist <= loc.radius && dist < minDistance) {
                    minDistance = dist;
                    bestLoc = loc;
                }
            }
        }
        if (bestLoc) {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('expman_last_location', bestLoc.tag);
            }
            return bestLoc.tag;
        }

        // Location is detected, but does not match any preset: default to current country instead of blank/null/undefined
        const country = await getCountryFromCoords(lat, lon);
        if (country) {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('expman_last_location', country);
            }
            return country;
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
