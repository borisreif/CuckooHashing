/**
 * Key strategy for binary keys.
 *
 * Supported key types:
 * - Uint8Array
 * - ArrayBuffer
 * - TypedArray
 * - DataView
 *
 * Semantics:
 * - keys compare by byte content
 * - hashing is by byte content
 *
 * This strategy does not accept Blob directly because Blob requires async
 * byte extraction. Convert Blob to Uint8Array first.
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
 * Build one tabulation table for `positions` byte positions.
 *
 * @param {number} positions
 * @param {number} seed
 * @returns {Uint32Array}
 */
function makeTabulationTable(positions = 4, seed = 0x12345678) {
    const table = new Uint32Array(positions * 256);
    let state = seed >>> 0;

    function nextRand32() {
        state = (state + 0x9e3779b9) >>> 0;
        return mix32(state);
    }

    for (let pos = 0; pos < positions; pos++) {
        const base = pos << 8;
        for (let b = 0; b < 256; b++) {
            table[base | b] = nextRand32();
        }
    }

    return table;
}

/**
 * Convert supported binary input into a Uint8Array view.
 *
 * @param {*} value
 * @returns {Uint8Array}
 */
function toBytesView(value) {
    if (value instanceof Uint8Array) {
        return value;
    }

    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }

    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }

    throw new TypeError(
        "Unsupported key type. This key strategy supports Uint8Array, ArrayBuffer, TypedArray, and DataView."
    );
}

/**
 * Compare two byte-like objects by content.
 *
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
function bytesEqual(a, b) {
    const aa = toBytesView(a);
    const bb = toBytesView(b);

    if (aa.length !== bb.length) {
        return false;
    }

    for (let i = 0; i < aa.length; i++) {
        if (aa[i] !== bb[i]) {
            return false;
        }
    }

    return true;
}

/**
 * Hash bytes using block-wise tabulation hashing.
 *
 * @param {Uint8Array} bytes
 * @param {Uint32Array} table
 * @param {number} positions
 * @returns {number}
 */
function hashBytes(bytes, table, positions) {
    let h = mix32(bytes.length);

    for (let offset = 0, blockIndex = 0; offset < bytes.length; offset += positions, blockIndex++) {
        let blockHash = 0;

        for (let pos = 0; pos < positions; pos++) {
            const i = offset + pos;
            const byte = i < bytes.length ? bytes[i] : 0;
            blockHash ^= table[(pos << 8) | byte];
        }

        h = mix32(h ^ blockHash ^ blockIndex);
    }

    return mix32(h ^ bytes.length);
}

/**
 * Create a byte-content key strategy.
 *
 * @param {Object} [options]
 * @param {number} [options.positions=4] - Bytes per block.
 * @param {number} [options.baseSeed=0x12345678] - Base seed for tabulation tables.
 * @returns {{hashBucket: Function, equals: Function, formatKey: Function}}
 */
export function createByteKeyOps({
    positions = 4,
    baseSeed = 0x12345678
} = {}) {
    const tables = new Map();

    /**
     * Lazily create one tabulation table per hash-function number.
     *
     * @param {number} which
     * @returns {Uint32Array}
     */
    function getTable(which) {
        if (!tables.has(which)) {
            const seed = mix32(baseSeed ^ Math.imul(which + 1, 0x9e3779b9));
            tables.set(which, makeTabulationTable(positions, seed));
        }

        return tables.get(which);
    }

    return {
        /**
         * Hash a binary key into one bucket index for hash function number `which`.
         *
         * @param {*} key
         * @param {number} which
         * @param {number} bucketCount
         * @returns {number}
         */
        hashBucket(key, which, bucketCount) {
            const bytes = toBytesView(key);
            const h = hashBytes(bytes, getTable(which), positions);
            return h % bucketCount;
        },

        /**
         * Compare two keys by byte content.
         *
         * @param {*} a
         * @param {*} b
         * @returns {boolean}
         */
        equals(a, b) {
            return bytesEqual(a, b);
        },

        /**
         * Convert a key to a short printable string.
         *
         * @param {*} key
         * @returns {string}
         */
        formatKey(key) {
            const bytes = toBytesView(key);
            const preview = Array.from(bytes.slice(0, 8)).join(",");
            return `bytes(${bytes.length})[${preview}${bytes.length > 8 ? ",..." : ""}]`;
        }
    };
}