/**
 * Generic bucketed cuckoo map.
 *
 * This file does not know how a key should be hashed.
 * It delegates key hashing and equality to a `keyOps` object.
 *
 * Required keyOps interface:
 *
 * {
 *   hashBucket(key, which, bucketCount) => number,
 *   equals(a, b) => boolean,
 *   formatKey?(key) => string
 * }
 *
 * `which` is the hash-function number / table number.
 */

export function createBucketedCuckooMap({
    numTables = 2,
    bucketCount = 11,
    bucketSize = 2,
    maxKicks = 20,
    keyOps,
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

    if (!keyOps || typeof keyOps !== "object") {
        throw new Error("keyOps must be provided");
    }

    if (typeof keyOps.hashBucket !== "function") {
        throw new Error("keyOps.hashBucket must be a function");
    }

    if (typeof keyOps.equals !== "function") {
        throw new Error("keyOps.equals must be a function");
    }

    // ---------------------------------------------------------------------
    // Private state
    // ---------------------------------------------------------------------

    const tableSize = bucketCount * bucketSize;
    const totalSize = numTables * tableSize;
    const EMPTY = Symbol("EMPTY");

    let cells = new Array(totalSize).fill(EMPTY);
    let count = 0;

    // ---------------------------------------------------------------------
    // Logging helpers
    // ---------------------------------------------------------------------

    function out(...args) {
        logger(...args);
    }

    function debugLog(...args) {
        if (debug) {
            logger(...args);
        }
    }

    // ---------------------------------------------------------------------
    // Indexing helpers
    // ---------------------------------------------------------------------

    /**
     * Return the flat-array index of the first slot of a bucket.
     *
     * @param {number} tableIdx
     * @param {number} bucketIdx
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
    // Hashing helpers
    // ---------------------------------------------------------------------

    /**
     * Ask keyOps for the candidate bucket in each logical table.
     *
     * @param {*} key
     * @returns {number[]}
     */
    function candidateBuckets(key) {
        const buckets = new Array(numTables);

        for (let which = 0; which < numTables; which++) {
            const bucketIdx = keyOps.hashBucket(key, which, bucketCount);

            if (!Number.isInteger(bucketIdx) || bucketIdx < 0 || bucketIdx >= bucketCount) {
                throw new TypeError(
                    `Invalid bucket index ${bucketIdx} for key ${String(key)}`
                );
            }

            buckets[which] = bucketIdx;
        }

        return buckets;
    }

    // ---------------------------------------------------------------------
    // Bucket / entry helpers
    // ---------------------------------------------------------------------

    /**
     * Search one bucket for an entry whose key equals the given key.
     *
     * @param {number} tableIdx
     * @param {number} bucketIdx
     * @param {*} key
     * @returns {null|{tableIdx:number,bucketIdx:number,slotIdx:number,flatIndex:number,entry:Object}}
     */
    function findEntryInBucket(tableIdx, bucketIdx, key) {
        for (let slotIdx = 0; slotIdx < bucketSize; slotIdx++) {
            const flatIndex = index(tableIdx, bucketIdx, slotIdx);
            const entry = cells[flatIndex];

            if (entry !== EMPTY && keyOps.equals(entry.key, key)) {
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
     * Find an empty slot inside one bucket.
     *
     * @param {number} tableIdx
     * @param {number} bucketIdx
     * @returns {number}
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
     * Find the current location of a key in the table.
     *
     * @param {*} key
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
            `[insert] key=${formatKey(entry.key)}, table=${tableIdx}, bucket=${bucketIdx}, slot=${slotIdx}`
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
            `[evict] inserted key=${formatKey(entry.key)}, table=${tableIdx}, bucket=${bucketIdx}, slot=${victimSlotIdx}; displaced key=${formatKey(displaced.key)}`
        );

        return displaced;
    }

    /**
     * Place an entry using bucketed cuckoo insertion.
     *
     * @param {{key:any,value:any}} entry
     * @param {number} tableIdx
     * @param {number} kickCount
     * @param {number} limit
     * @returns {boolean}
     */
    function placeEntry(entry, tableIdx, kickCount, limit) {
        if (kickCount >= limit) {
            debugLog(`[fail] kick limit reached while inserting key=${formatKey(entry.key)}`);
            return false;
        }

        const buckets = candidateBuckets(entry.key);
        const bucketIdx = buckets[tableIdx];

        debugLog(
            `[place] key=${formatKey(entry.key)}, candidates=${JSON.stringify(buckets)}, currentTable=${tableIdx}, kickCount=${kickCount}`
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
    // Rendering helpers
    // ---------------------------------------------------------------------

    /**
     * Convert one key to a display string.
     *
     * @param {*} key
     * @returns {string}
     */
    function formatKey(key) {
        if (typeof keyOps.formatKey === "function") {
            return keyOps.formatKey(key);
        }

        return String(key);
    }

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

        return `${formatKey(slot.key)}:${String(slot.value)}`;
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
     * @param {*} key
     * @param {*} value
     * @returns {boolean}
     */
    function set(key, value) {
        const existing = lookupPosition(key);

        if (existing.found) {
            existing.entry.value = value;
            debugLog(`[update] key=${formatKey(key)} updated`);
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
            debugLog(`[rollback] insertion failed for key=${formatKey(key)}; previous state restored`);
            return false;
        }

        count++;
        return true;
    }

    /**
     * Return the value for a key, or undefined if the key is not present.
     *
     * @param {*} key
     * @returns {*|undefined}
     */
    function get(key) {
        const result = lookupPosition(key);
        return result.found ? result.entry.value : undefined;
    }

    /**
     * Test whether the map contains a key.
     *
     * @param {*} key
     * @returns {boolean}
     */
    function has(key) {
        return lookupPosition(key).found;
    }

    /**
     * Delete a key/value pair from the map.
     *
     * @param {*} key
     * @returns {boolean}
     */
    function del(key) {
        const result = lookupPosition(key);

        if (!result.found) {
            return false;
        }

        cells[result.flatIndex] = EMPTY;
        count--;
        debugLog(`[delete] key=${formatKey(key)} removed`);
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
     * @param {*} key
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