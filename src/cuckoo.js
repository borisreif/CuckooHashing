import { baseHash, mix32 } from "./hashing.js";

/**
 * Default bucket hash functions.
 *
 * Each function must return a valid bucket index in the range
 * [0, bucketCount - 1].
 *
 * These functions are built on top of `baseHash(...)`, which first converts
 * supported keys into one 32-bit unsigned integer.
 */
export const DEFAULT_HASH_FUNCTIONS = [
    (key, bucketCount) => baseHash(key) % bucketCount,
    (key, bucketCount) => mix32(baseHash(key) ^ 0x9e3779b9) % bucketCount,
    (key, bucketCount) => mix32(baseHash(key) ^ 0x85ebca6b) % bucketCount
];

/**
 * Bucketed cuckoo map implemented as a factory.
 *
 * Public API:
 *   const map = createBucketedCuckooMap({...});
 *   map.set(key, value)
 *   map.get(key)
 *   map.has(key)
 *   map.delete(key)
 *   map.clear()
 *   map.size()
 *   map.loadFactor()
 *   map.snapshot()
 *   map.render()
 *   map.print()
 *   map.locate(key)
 *   map.getConfig()
 *
 * Internal representation:
 * - numTables logical tables
 * - each table has bucketCount buckets
 * - each bucket has bucketSize slots
 * - all slots live in one flat 1D array called `cells`
 * - each occupied slot stores an entry object: { key, value }
 *
 * @param {Object} options
 * @param {number} [options.numTables=2]
 * @param {number} [options.bucketCount=11]
 * @param {number} [options.bucketSize=2]
 * @param {number} [options.maxKicks=20]
 * @param {Function[]} [options.hashFunctions=DEFAULT_HASH_FUNCTIONS]
 * @param {number[]} [options.tableToHash=[0,1]]
 * @param {boolean} [options.debug=false]
 * @param {Function} [options.logger=console.log]
 * @returns {Object} Public map API
 */
export function createBucketedCuckooMap({
    numTables = 2,
    bucketCount = 11,
    bucketSize = 2,
    maxKicks = 20,
    hashFunctions = DEFAULT_HASH_FUNCTIONS,
    tableToHash = [0, 1],
    debug = false,
    logger = console.log
} = {}) {
    // ---------------------------------------------------------------------
    // Configuration validation
    // ---------------------------------------------------------------------

    if (!Number.isInteger(numTables) || numTables <= 0) {
        throw new Error("numTables must be a positive integer");
    }

    if (!Number.isInteger(bucketCount) || bucketCount <= 0) {
        throw new Error("bucketCount must be a positive integer");
    }

    if (!Number.isInteger(bucketSize) || bucketSize <= 0) {
        throw new Error("bucketSize must be a positive integer");
    }

    if (!Number.isInteger(maxKicks) || maxKicks <= 0) {
        throw new Error("maxKicks must be a positive integer");
    }

    if (!Array.isArray(hashFunctions) || hashFunctions.length === 0) {
        throw new Error("hashFunctions must be a non-empty array");
    }

    if (!Array.isArray(tableToHash) || tableToHash.length !== numTables) {
        throw new Error("tableToHash length must equal numTables");
    }

    for (const fn of hashFunctions) {
        if (typeof fn !== "function") {
            throw new Error("Every entry in hashFunctions must be a function");
        }
    }

    for (const hashIndex of tableToHash) {
        if (!Number.isInteger(hashIndex) || hashIndex < 0 || hashIndex >= hashFunctions.length) {
            throw new Error("tableToHash contains an invalid hash-function index");
        }
    }

    // ---------------------------------------------------------------------
    // Private state
    // ---------------------------------------------------------------------

    const tableSize = bucketCount * bucketSize;
    const totalSize = numTables * tableSize;
    const EMPTY = Symbol("EMPTY");

    // Flat storage. Each slot is either EMPTY or an entry: { key, value }.
    let cells = new Array(totalSize).fill(EMPTY);

    // Number of stored entries.
    let count = 0;

    // ---------------------------------------------------------------------
    // Internal logging helpers
    // ---------------------------------------------------------------------

    /**
     * Print a normal message through the configured logger.
     *
     * @param {...any} args
     */
    function out(...args) {
        logger(...args);
    }

    /**
     * Print a debug message only when debug mode is enabled.
     *
     * @param {...any} args
     */
    function debugLog(...args) {
        if (debug) {
            logger(...args);
        }
    }

    // ---------------------------------------------------------------------
    // Internal indexing helpers
    // ---------------------------------------------------------------------

    /**
     * Return the flat-array index of the first slot of a bucket.
     *
     * @param {number} tableIdx - Logical table index.
     * @param {number} bucketIdx - Bucket index within that table.
     * @returns {number}
     */
    function bucketStart(tableIdx, bucketIdx) {
        return tableIdx * tableSize + bucketIdx * bucketSize;
    }

    /**
     * Convert logical coordinates (table, bucket, slot) into one flat-array index.
     *
     * @param {number} tableIdx
     * @param {number} bucketIdx
     * @param {number} slotIdx
     * @returns {number}
     */
    function index(tableIdx, bucketIdx, slotIdx) {
        return bucketStart(tableIdx, bucketIdx) + slotIdx;
    }

    // ---------------------------------------------------------------------
    // Internal hashing helpers
    // ---------------------------------------------------------------------

    /**
     * Evaluate one configured bucket hash function for a key and validate
     * that the result is a valid bucket index.
     *
     * @param {number} hashIndex
     * @param {number|string} key
     * @returns {number}
     */
    function hashBucket(hashIndex, key) {
        const bucketIdx = hashFunctions[hashIndex](key, bucketCount);

        if (!Number.isInteger(bucketIdx) || bucketIdx < 0 || bucketIdx >= bucketCount) {
            throw new TypeError(
                `Invalid bucket index ${bucketIdx} for key ${String(key)}`
            );
        }

        return bucketIdx;
    }

    /**
     * Return the candidate bucket for the given key in each logical table.
     *
     * For two tables this returns:
     * [bucketInTable0, bucketInTable1]
     *
     * @param {number|string} key
     * @returns {number[]}
     */
    function candidateBuckets(key) {
        return tableToHash.map((hashIndex) => hashBucket(hashIndex, key));
    }

    // ---------------------------------------------------------------------
    // Internal bucket/entry helpers
    // ---------------------------------------------------------------------

    /**
     * Search one specific bucket for an entry with the given key.
     *
     * @param {number} tableIdx
     * @param {number} bucketIdx
     * @param {number|string} key
     * @returns {null|{tableIdx:number,bucketIdx:number,slotIdx:number,flatIndex:number,entry:Object}}
     */
    function findEntryInBucket(tableIdx, bucketIdx, key) {
        for (let slotIdx = 0; slotIdx < bucketSize; slotIdx++) {
            const flatIndex = index(tableIdx, bucketIdx, slotIdx);
            const entry = cells[flatIndex];

            if (entry !== EMPTY && entry.key === key) {
                return {
                    tableIdx,
                    bucketIdx,
                    slotIdx,
                    flatIndex,
                    entry
                };
            }
        }

        return null;
    }

    /**
     * Find an empty slot inside one specific bucket.
     *
     * @param {number} tableIdx
     * @param {number} bucketIdx
     * @returns {number} Slot index if found, otherwise -1.
     */
    function findEmptySlot(tableIdx, bucketIdx) {
        for (let slotIdx = 0; slotIdx < bucketSize; slotIdx++) {
            const flatIndex = index(tableIdx, bucketIdx, slotIdx);

            if (cells[flatIndex] === EMPTY) {
                return slotIdx;
            }
        }

        return -1;
    }

    /**
     * Look up the position of a key.
     *
     * If found, returns detailed location info and the entry itself.
     * If not found, returns { found: false }.
     *
     * @param {number|string} key
     * @returns {Object}
     */
    function lookupPosition(key) {
        const buckets = candidateBuckets(key);

        for (let tableIdx = 0; tableIdx < numTables; tableIdx++) {
            const bucketIdx = buckets[tableIdx];
            const found = findEntryInBucket(tableIdx, bucketIdx, key);

            if (found) {
                return {
                    found: true,
                    ...found
                };
            }
        }

        return { found: false };
    }

    /**
     * Try to insert an entry directly into a bucket.
     *
     * @param {number} tableIdx
     * @param {number} bucketIdx
     * @param {{key:any,value:any}} entry
     * @returns {boolean}
     */
    function tryInsertEntryIntoBucket(tableIdx, bucketIdx, entry) {
        const slotIdx = findEmptySlot(tableIdx, bucketIdx);

        if (slotIdx === -1) {
            return false;
        }

        cells[index(tableIdx, bucketIdx, slotIdx)] = entry;

        debugLog(
            `[insert] key=${entry.key}, table=${tableIdx}, bucket=${bucketIdx}, slot=${slotIdx}`
        );

        return true;
    }

    /**
     * Evict one resident entry from a full bucket and place the new entry there.
     *
     * @param {number} tableIdx
     * @param {number} bucketIdx
     * @param {{key:any,value:any}} entry
     * @param {number} kickCount
     * @returns {{key:any,value:any}}
     */
    function evictFromBucket(tableIdx, bucketIdx, entry, kickCount) {
        const victimSlotIdx = kickCount % bucketSize;
        const victimFlatIndex = index(tableIdx, bucketIdx, victimSlotIdx);

        const displaced = cells[victimFlatIndex];
        cells[victimFlatIndex] = entry;

        debugLog(
            `[evict] inserted key=${entry.key}, table=${tableIdx}, bucket=${bucketIdx}, slot=${victimSlotIdx}; displaced key=${displaced.key}`
        );

        return displaced;
    }

    /**
     * Place an entry using bucketed cuckoo insertion.
     *
     * Algorithm:
     * 1. Compute candidate buckets for the entry's key.
     * 2. Try to place the entry into the current table's bucket.
     * 3. If that bucket is full, evict one resident entry.
     * 4. Recursively place the displaced entry into the next table.
     *
     * @param {{key:any,value:any}} entry
     * @param {number} tableIdx
     * @param {number} kickCount
     * @param {number} limit
     * @returns {boolean}
     */
    function placeEntry(entry, tableIdx, kickCount, limit) {
        if (kickCount >= limit) {
            debugLog(`[fail] kick limit reached while inserting key=${entry.key}`);
            return false;
        }

        const buckets = candidateBuckets(entry.key);
        const bucketIdx = buckets[tableIdx];

        debugLog(
            `[place] key=${entry.key}, candidates=${JSON.stringify(buckets)}, currentTable=${tableIdx}, kickCount=${kickCount}`
        );

        if (tryInsertEntryIntoBucket(tableIdx, bucketIdx, entry)) {
            return true;
        }

        const displaced = evictFromBucket(tableIdx, bucketIdx, entry, kickCount);

        return placeEntry(
            displaced,
            (tableIdx + 1) % numTables,
            kickCount + 1,
            limit
        );
    }

    // ---------------------------------------------------------------------
    // Internal rendering helpers
    // ---------------------------------------------------------------------

    /**
     * Convert one slot value into a printable string.
     *
     * @param {symbol|{key:any,value:any}|null} slot
     * @returns {string}
     */
    function formatSlot(slot) {
        if (slot === EMPTY || slot === null) {
            return "-";
        }

        return `${String(slot.key)}:${String(slot.value)}`;
    }

    /**
     * Build a structured snapshot of the current table state.
     *
     * @returns {{logical:Array, flat:Array, count:number}}
     */
    function tableSnapshot() {
        const logical = [];

        for (let tableIdx = 0; tableIdx < numTables; tableIdx++) {
            const buckets = [];

            for (let bucketIdx = 0; bucketIdx < bucketCount; bucketIdx++) {
                const slots = [];

                for (let slotIdx = 0; slotIdx < bucketSize; slotIdx++) {
                    const flatIndex = index(tableIdx, bucketIdx, slotIdx);
                    const slot = cells[flatIndex];

                    slots.push(
                        slot === EMPTY
                            ? null
                            : { key: slot.key, value: slot.value }
                    );
                }

                buckets.push(slots);
            }

            logical.push(buckets);
        }

        return {
            count,
            logical,
            flat: cells.map((slot) =>
                slot === EMPTY ? null : { key: slot.key, value: slot.value }
            )
        };
    }

    /**
     * Render the whole table into a human-readable multiline string.
     *
     * @returns {string}
     */
    function renderTable() {
        const snapshot = tableSnapshot();
        const lines = [];

        lines.push("Bucketed cuckoo map:");
        lines.push("");

        snapshot.logical.forEach((buckets, tableIdx) => {
            lines.push(`Table ${tableIdx}:`);

            buckets.forEach((slots, bucketIdx) => {
                const shown = slots.map((slot) => formatSlot(slot));
                lines.push(`  Bucket ${bucketIdx}: [ ${shown.join(" ")} ]`);
            });

            lines.push("");
        });

        lines.push(`Size: ${count}`);
        lines.push(`Load factor: ${loadFactor().toFixed(4)}`);
        lines.push("Underlying flat 1D array:");
        lines.push(snapshot.flat.map((slot) => formatSlot(slot)).join(" "));

        return lines.join("\n");
    }

    // ---------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------

    /**
     * Insert or update a key/value pair.
     *
     * If the key already exists, only its value is updated.
     * If the key is new, cuckoo insertion is attempted.
     * On insertion failure, the old table state is restored.
     *
     * @param {number|string} key
     * @param {*} value
     * @returns {boolean}
     */
    function set(key, value) {
        const existing = lookupPosition(key);

        if (existing.found) {
            existing.entry.value = value;
            debugLog(`[update] key=${key} updated`);
            return true;
        }

        const backupCells = cells.slice();
        const entry = { key, value };

        const inserted = placeEntry(
            entry,
            0,
            0,
            Math.max(maxKicks, bucketCount)
        );

        if (!inserted) {
            cells = backupCells;
            debugLog(`[rollback] insertion failed for key=${key}; previous state restored`);
            return false;
        }

        count++;
        return true;
    }

    /**
     * Return the value for a key, or undefined if the key is not present.
     *
     * @param {number|string} key
     * @returns {*|undefined}
     */
    function get(key) {
        const result = lookupPosition(key);
        return result.found ? result.entry.value : undefined;
    }

    /**
     * Test whether the map contains a key.
     *
     * @param {number|string} key
     * @returns {boolean}
     */
    function has(key) {
        return lookupPosition(key).found;
    }

    /**
     * Delete a key/value pair from the map.
     *
     * @param {number|string} key
     * @returns {boolean}
     */
    function del(key) {
        const result = lookupPosition(key);

        if (!result.found) {
            return false;
        }

        cells[result.flatIndex] = EMPTY;
        count--;
        debugLog(`[delete] key=${key} removed`);
        return true;
    }

    /**
     * Remove all entries from the map.
     */
    function clear() {
        cells.fill(EMPTY);
        count = 0;
        debugLog("[clear] all entries removed");
    }

    /**
     * Return the number of stored entries.
     *
     * @returns {number}
     */
    function size() {
        return count;
    }

    /**
     * Return the load factor measured against the total number of slots.
     *
     * @returns {number}
     */
    function loadFactor() {
        return count / totalSize;
    }

    /**
     * Return a structured snapshot of the table.
     *
     * @returns {{logical:Array, flat:Array, count:number}}
     */
    function snapshot() {
        return tableSnapshot();
    }

    /**
     * Return a human-readable multiline string representation of the table.
     *
     * @returns {string}
     */
    function render() {
        return renderTable();
    }

    /**
     * Print the rendered table through the configured logger.
     */
    function print() {
        out(renderTable());
    }

    /**
     * Return location details for a key.
     *
     * @param {number|string} key
     * @returns {Object}
     */
    function locate(key) {
        return lookupPosition(key);
    }

    /**
     * Return a read-only summary of the map configuration.
     *
     * @returns {Object}
     */
    function getConfig() {
        return {
            numTables,
            bucketCount,
            bucketSize,
            maxKicks,
            tableToHash: tableToHash.slice(),
            debug,
            tableSize,
            totalSize
        };
    }

    return {
        set,
        get,
        has,
        delete: del,
        clear,
        size,
        loadFactor,
        snapshot,
        render,
        print,
        locate,
        getConfig
    };
}