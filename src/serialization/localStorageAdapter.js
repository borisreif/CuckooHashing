import { serializeMap, deserializeMap } from "./serializeMap.js";

/**
 * Save a map to browser localStorage as JSON.
 *
 * @param {string} storageKey
 * @param {Object} map
 * @param {Object} [options]
 */
export function saveMapToLocalStorage(storageKey, map, options = {}) {
    if (typeof localStorage === "undefined") {
        throw new Error("localStorage is not available in this environment");
    }

    const payload = serializeMap(map, options);
    localStorage.setItem(storageKey, JSON.stringify(payload));
}

/**
 * Load a map from browser localStorage.
 *
 * Returns null if the key does not exist.
 *
 * @param {string} storageKey
 * @param {Object} [options]
 * @returns {Object|null}
 */
export function loadMapFromLocalStorage(storageKey, options = {}) {
    if (typeof localStorage === "undefined") {
        throw new Error("localStorage is not available in this environment");
    }

    const raw = localStorage.getItem(storageKey);

    if (raw === null) {
        return null;
    }

    const payload = JSON.parse(raw);
    return deserializeMap(payload, options);
}

/**
 * Remove a stored map from localStorage.
 *
 * @param {string} storageKey
 */
export function deleteMapFromLocalStorage(storageKey) {
    if (typeof localStorage === "undefined") {
        throw new Error("localStorage is not available in this environment");
    }

    localStorage.removeItem(storageKey);
}