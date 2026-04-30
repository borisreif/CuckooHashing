/**
 * Key strategy backed by an external digest function.
 *
 * This is useful when keys should be interpreted through a cryptographic digest,
 * for example in content-addressable storage.
 *
 * The digest function itself must be synchronous:
 *
 *   digestBytes(bytes: Uint8Array) => Uint8Array
 *
 * For async digests such as Web Crypto SHA-256, compute the digest outside the
 * map and then store the digest bytes in a byte-key map instead.
 */

/**
 * Read one uint32 value from bytes in little-endian order.
 *
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @returns {number}
 */
function readUint32LE(bytes, offset) {
    return (
        (bytes[offset]) |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)
    ) >>> 0;
}

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
 * Create a digest-based key strategy.
 *
 * Required callbacks:
 * - encodeKey(key) => Uint8Array
 * - digestBytes(bytes) => Uint8Array
 *
 * Equality:
 * - by default uses Object.is
 * - you may override it if you want value-based semantics
 *
 * @param {Object} options
 * @param {(key:any) => Uint8Array} options.encodeKey
 * @param {(bytes:Uint8Array) => Uint8Array} options.digestBytes
 * @param {(a:any, b:any) => boolean} [options.equals=Object.is]
 * @param {(key:any) => string} [options.formatKey]
 * @returns {{hashBucket:Function, equals:Function, formatKey:Function}}
 */
export function createDigestKeyOps({
    encodeKey,
    digestBytes,
    equals = Object.is,
    formatKey = (key) => String(key)
}) {
    if (typeof encodeKey !== "function") {
        throw new Error("encodeKey must be a function");
    }

    if (typeof digestBytes !== "function") {
        throw new Error("digestBytes must be a function");
    }

    return {
        /**
         * Derive one bucket index from the digest output.
         *
         * We read several 32-bit words from the digest and then derive the
         * `which`-th hash from them.
         *
         * @param {*} key
         * @param {number} which
         * @param {number} bucketCount
         * @returns {number}
         */
        hashBucket(key, which, bucketCount) {
            const bytes = encodeKey(key);
            const digest = digestBytes(bytes);

            if (!(digest instanceof Uint8Array)) {
                throw new TypeError("digestBytes must return a Uint8Array");
            }

            if (digest.length < 8) {
                throw new Error("Digest must be at least 8 bytes long");
            }

            const h1 = readUint32LE(digest, 0);
            const h2 = readUint32LE(digest, 4);

            // Derive multiple hash functions from the digest.
            const h = which === 0
                ? h1
                : mix32(h2 ^ Math.imul(which + 1, 0x9e3779b9));

            return h % bucketCount;
        },

        equals,

        formatKey
    };
}