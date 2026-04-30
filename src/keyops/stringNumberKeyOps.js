/**
 * Key strategy for:
 * - numbers
 * - strings
 *
 * Semantics:
 * - numbers compare by JS value using Object.is
 * - strings compare by JS value
 *
 * This strategy does not support arbitrary objects.
 */

/**
 * Mix a 32-bit unsigned integer so nearby inputs spread out better.
 *
 * @param {number} x
 * @returns {number}
 */
function mix32(x) {
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
function hashString(str) {
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
 * @param {number|string} key
 * @returns {number}
 */
function baseHash(key) {
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
        `Unsupported key type: ${typeof key}. This key strategy only supports number and string keys.`
    );
}

/**
 * Create a key strategy for numbers and strings.
 *
 * @returns {{hashBucket: Function, equals: Function, formatKey: Function}}
 */
export function createStringNumberKeyOps() {
    // Seeds used to derive multiple hash functions.
    const seeds = [
        0x00000000,
        0x9e3779b9,
        0x85ebca6b,
        0xc2b2ae35,
        0x27d4eb2f
    ];

    return {
        /**
         * Hash a key into one bucket index for hash function number `which`.
         *
         * @param {number|string} key
         * @param {number} which
         * @param {number} bucketCount
         * @returns {number}
         */
        hashBucket(key, which, bucketCount) {
            const h = baseHash(key);
            const seed = seeds[which % seeds.length] ^ Math.imul(which + 1, 0x9e3779b1);
            const mixed = which === 0 ? h : mix32(h ^ seed);
            return mixed % bucketCount;
        },

        /**
         * Compare two keys using normal JS value semantics.
         *
         * @param {*} a
         * @param {*} b
         * @returns {boolean}
         */
        equals(a, b) {
            return Object.is(a, b);
        },

        /**
         * Convert a key to a printable string.
         *
         * @param {*} key
         * @returns {string}
         */
        formatKey(key) {
            return JSON.stringify(key);
        }
    };
}