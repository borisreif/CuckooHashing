import { mix32, hashString32 } from "../utils/hash32.js";

/**
 * Key strategy for numbers and strings.
 *
 * Semantics:
 * - numbers compare by JS value using Object.is
 * - strings compare by JS value
 * - no arbitrary objects are accepted
 *
 * This strategy is a good fit for a traditional dictionary-like use case where
 * keys are primitive values and hashing should stay synchronous and fast.
 */

/**
 * Convert a supported primitive key into one 32-bit base hash.
 *
 * @param {number|string} key
 * @returns {number}
 */
function baseHash(key) {
    if (typeof key === "string") {
        return hashString32(key);
    }

    if (typeof key === "number") {
        if (!Number.isFinite(key)) {
            throw new TypeError("Number keys must be finite");
        }

        // Hash the string form so integers, negatives, and decimals are all
        // handled consistently.
        return hashString32(String(key));
    }

    throw new TypeError(
        `Unsupported key type: ${typeof key}. This key strategy only supports number and string keys.`
    );
}

/**
 * Create a key strategy for numbers and strings.
 *
 * The cuckoo engine asks this strategy for one bucket index per logical table.
 * We derive multiple hash functions from one base hash by mixing with different
 * seeds.
 *
 * @returns {{hashBucket: Function, equals: Function, formatKey: Function}}
 */
export function createStringNumberKeyOps() {
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
         * Convert a key to a printable string for debug output.
         *
         * @param {*} key
         * @returns {string}
         */
        formatKey(key) {
            return JSON.stringify(key);
        }
    };
}
