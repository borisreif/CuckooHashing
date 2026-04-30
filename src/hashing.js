/**
 * Generic hashing helpers.
 *
 * This file is independent of the cuckoo-map implementation.
 * Its only job is to turn supported keys into 32-bit unsigned integers
 * and provide a small integer mixing function.
 */

/**
 * Mix a 32-bit unsigned integer so that nearby inputs spread out better.
 *
 * @param {number} x
 * @returns {number} 32-bit unsigned integer
 */
export function mix32(x) {
    x = x >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
}

/**
 * Hash a string into a 32-bit unsigned integer.
 * This is a simple FNV-1a style hash.
 *
 * @param {string} str
 * @returns {number}
 */
export function hashString(str) {
    let h = 2166136261 >>> 0;

    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }

    return h >>> 0;
}

/**
 * Convert a supported key into one 32-bit base hash.
 *
 * Supported key types for now:
 * - number
 * - string
 *
 * Numbers are hashed through their string form so integers, negatives,
 * and decimals all behave consistently.
 *
 * @param {number|string} key
 * @returns {number}
 */
export function baseHash(key) {
    if (typeof key === "string") {
        return hashString(key);
    }

    if (typeof key === "number") {
        if (!Number.isFinite(key)) {
            throw new TypeError("Number keys must be finite");
        }

        return hashString(String(key));
    }

    throw new TypeError(
        `Unsupported key type: ${typeof key}. Only number and string keys are supported.`
    );
}