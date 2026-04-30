/**
 * Shared 32-bit hashing utilities.
 *
 * These helpers are intentionally small and generic so they can be reused by
 * multiple key strategies.
 */

/**
 * Mix a 32-bit unsigned integer so that nearby inputs spread out better.
 *
 * This is useful both when building pseudo-random tables and when deriving
 * multiple hash functions from one base hash.
 *
 * @param {number} x
 * @returns {number} Mixed 32-bit unsigned integer.
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
 * Hash a string into a 32-bit unsigned integer using an FNV-1a style loop.
 *
 * @param {string} str
 * @returns {number}
 */
export function hashString32(str) {
    let h = 2166136261 >>> 0;

    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }

    return h >>> 0;
}

/**
 * Read one uint32 from a byte array in little-endian order.
 *
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @returns {number}
 */
export function readUint32LE(bytes, offset) {
    return (
        (bytes[offset]) |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)
    ) >>> 0;
}
