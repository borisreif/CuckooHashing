/**
 * Bucketed cuckoo map implemented as a factory.
 *
 * @author Boris A. Reif
 * @version 0.3.0
 *
 * References:
 * - Pagh & Rodler, “Cuckoo Hashing” (BRICS RS-01-32)
 * - https://www.brics.dk/RS/01/32/BRICS-RS-01-32.pdf
 * - https://en.wikipedia.org/wiki/Cuckoo_hashing
 * - https://codecapsule.com/2013/07/20/cuckoo-hashing/
 * - https://www.geeksforgeeks.org/dsa/cuckoo-hashing/
 *
 * -----------------------------------------------------------------------------
 * What bucketed cuckoo hashing is
 * -----------------------------------------------------------------------------
 *
 * Ordinary cuckoo hashing gives each key a small number of legal locations.
 * In the common 2-table formulation, a key may live in:
 *
 *   - one location in table 0
 *   - one location in table 1
 *
 * A bucketed variant widens each legal location from one slot to a whole bucket.
 * That means a key may live in:
 *
 *   - one bucket in table 0
 *   - one bucket in table 1
 *
 * and each bucket contains several slots.
 *
 * If the chosen bucket is full, the map evicts one resident entry, inserts the
 * new entry into the freed slot, and then recursively reinserts the displaced
 * entry into its alternate table. This "kick out and reinsert" move is the core
 * cuckoo step.
 *
 * -----------------------------------------------------------------------------
 * Logical model
 * -----------------------------------------------------------------------------
 *
 *   numTables logical tables
 *   each table has bucketCount buckets
 *   each bucket has bucketSize slots
 *
 * Example when:
 *   numTables   = 2
 *   bucketCount = 3
 *   bucketSize  = 2
 *
 * Table 0
 *
 *   |_____|_____|  |_____|_____|  |_____|_____|
 *   [slot0 slot1]  [slot0 slot1]  [slot0 slot1]
 *      bucket 0       bucket 1       bucket 2
 *
 * Table 1
 *
 *   |_____|_____|  |_____|_____|  |_____|_____|
 *   [slot0 slot1]  [slot0 slot1]  [slot0 slot1]
 *      bucket 0       bucket 1       bucket 2
 *
 * -----------------------------------------------------------------------------
 * Physical model
 * -----------------------------------------------------------------------------
 *
 * All slots live in one flat 1D array called `cells`.
 *
 * With the same parameters as above:
 *
 *    idx0 idx1   idx2 idx3   idx4 idx5   idx6 idx7   idx8 idx9   idx10 idx11
 *   |____|____| |____|____| |____|____| |____|____| |____|____| |_____|_____|
 *
 * The logical layout is mapped onto the flat array like this:
 *
 *   |------------ table 0 ------------| |------------ table 1 ------------|
 *     bucket 0    bucket 1   bucket 2     bucket 0    bucket 1    bucket 2
 *    [ s0  s1 ] [ s0  s1 ] [ s0  s1 ]   [ s0  s1 ] [ s0  s1 ] [ s0  s1 ]
 *
 * Derived sizes:
 *
 *   tableSize = bucketCount * bucketSize
 *   totalSize = numTables * tableSize
 *
 * The helper functions `bucketStart(...)` and `index(...)` are responsible for
 * converting from logical coordinates to a flat index.
 *
 * -----------------------------------------------------------------------------
 * Architecture
 * -----------------------------------------------------------------------------
 *
 * This file is intentionally generic: it does not know how a key should be
 * hashed. Instead, it delegates key hashing and key equality to a `keyOps`
 * object.
 *
 * Required keyOps interface:
 *
 *   {
 *     hashBucket(key, which, bucketCount) => number,
 *     equals(a, b) => boolean,
 *     formatKey?(key) => string
 *   }
 *
 * `which` is the hash-function number / logical table number.
 *
 * This separation means the cuckoo engine can be reused with different key
 * domains, for example:
 *
 *   - numbers and strings by value
 *   - bytes by content
 *   - externally digested keys
 *
 * -----------------------------------------------------------------------------
 * Public API
 * -----------------------------------------------------------------------------
 *
 *   const map = createBucketedCuckooMap({...});
 *
 *   map.set(key, value)
 *   map.get(key)
 *   map.has(key)
 *   map.delete(key)
 *   map.clear()
 *   map.size()
 *   map.loadFactor()
 *   map.snapshot()
 *   map.entries()
 *   map.render()
 *   map.print()
 *   map.locate(key)
 *   map.getConfig()
 */

/**
 * Create a bucketed cuckoo map.
 *
 * @param {Object} options
 * @param {number} [options.numTables=2] - Number of logical tables.
 * @param {number} [options.bucketCount=11] - Buckets per table.
 * @param {number} [options.bucketSize=2] - Slots per bucket.
 * @param {number} [options.maxKicks=20] - Maximum relocation attempts before insertion fails.
 * @param {Object} options.keyOps - Key strategy object.
 * @param {boolean} [options.debug=false] - Enable debug logging.
 * @param {Function} [options.logger=console.log] - Output function.
 * @returns {Object} Public cuckoo-map API.
 */
export function createBucketedCuckooMap({
  numTables = 2,
  bucketCount = 11,
  bucketSize = 2,
  maxKicks = 20,
  keyOps,
  debug = false,
  logger = console.log,
} = {}) {
  // -----------------------------------------------------------------
  // Configuration validation
  // -----------------------------------------------------------------

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

  // -----------------------------------------------------------------
  // Private state
  // -----------------------------------------------------------------

  const tableSize = bucketCount * bucketSize;
  const totalSize = numTables * tableSize;
  const EMPTY = Symbol("EMPTY");

  // Flat storage. Each slot is either EMPTY or an entry: { key, value }.
  let cells = new Array(totalSize).fill(EMPTY);

  // Number of stored entries.
  let count = 0;

  // -----------------------------------------------------------------
  // Internal logging helpers
  // -----------------------------------------------------------------

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

  // -----------------------------------------------------------------
  // Internal indexing helpers
  // -----------------------------------------------------------------

  /**
   * Return the flat-array index of the first slot of a bucket.
   *
   * Example with numTables = 2, bucketCount = 3, bucketSize = 2:
   *
   *   bucketStart(0, 0) = 0
   *   bucketStart(0, 1) = 2
   *   bucketStart(0, 2) = 4
   *   bucketStart(1, 0) = 6
   *   bucketStart(1, 1) = 8
   *   bucketStart(1, 2) = 10
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
   * Example with numTables = 2, bucketCount = 3, bucketSize = 2:
   *
   *   index(0, 0, 0) =  0
   *   index(0, 0, 1) =  1
   *   index(0, 1, 0) =  2
   *   index(0, 1, 1) =  3
   *   index(0, 2, 0) =  4
   *   index(0, 2, 1) =  5
   *   index(1, 0, 0) =  6
   *   index(1, 0, 1) =  7
   *   index(1, 1, 0) =  8
   *   index(1, 1, 1) =  9
   *   index(1, 2, 0) = 10
   *   index(1, 2, 1) = 11
   *
   * @param {number} tableIdx
   * @param {number} bucketIdx
   * @param {number} slotIdx
   * @returns {number}
   */
  function index(tableIdx, bucketIdx, slotIdx) {
    return bucketStart(tableIdx, bucketIdx) + slotIdx;
  }

  // -----------------------------------------------------------------
  // Internal key hashing helpers
  // -----------------------------------------------------------------

  /**
   * Ask keyOps for the candidate bucket in each logical table.
   *
   * With two tables this returns:
   *
   *   [bucketInTable0, bucketInTable1]
   *
   * @param {*} key
   * @returns {number[]}
   */
  function candidateBuckets(key) {
    const buckets = new Array(numTables);

    for (let which = 0; which < numTables; which++) {
      const bucketIdx = keyOps.hashBucket(key, which, bucketCount);

      if (
        !Number.isInteger(bucketIdx) ||
        bucketIdx < 0 ||
        bucketIdx >= bucketCount
      ) {
        throw new TypeError(
          `Invalid bucket index ${bucketIdx} for key ${String(key)}`,
        );
      }

      buckets[which] = bucketIdx;
    }

    return buckets;
  }

  // -----------------------------------------------------------------
  // Internal bucket / entry helpers
  // -----------------------------------------------------------------

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
          entry,
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
   * Find the current location of a key in the table.
   *
   * Steps:
   *   1. compute the candidate bucket in each table
   *   2. search all slots in those candidate buckets
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
          ...found,
        };
      }
    }

    return { found: false };
  }

  /**
   * Try to insert an entry directly into a bucket.
   *
   * This succeeds only if the bucket still has a free slot.
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
      `[insert] key=${formatKey(entry.key)}, table=${tableIdx}, bucket=${bucketIdx}, slot=${slotIdx}`,
    );

    return true;
  }

  /**
   * Evict one resident entry from a full bucket and place the new entry there.
   *
   * Victim choice is currently deterministic: alternate by kick count.
   * This is simple and makes traces easier to follow when debugging.
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
      `[evict] inserted key=${formatKey(entry.key)}, table=${tableIdx}, bucket=${bucketIdx}, slot=${victimSlotIdx}; displaced key=${formatKey(displaced.key)}`,
    );

    return displaced;
  }

  /**
   * Place an entry using bucketed cuckoo insertion.
   *
   * Algorithm:
   *   1. Compute candidate buckets for the entry's key.
   *   2. Try to place the entry into the current table's bucket.
   *   3. If that bucket is full, evict one resident entry.
   *   4. Recursively place the displaced entry into the next table.
   *   5. Stop when the kick limit is reached.
   *
   * @param {{key:any,value:any}} entry
   * @param {number} tableIdx
   * @param {number} kickCount
   * @param {number} limit
   * @returns {boolean}
   */
  function placeEntry(entry, tableIdx, kickCount, limit) {
    if (kickCount >= limit) {
      debugLog(
        `[fail] kick limit reached while inserting key=${formatKey(entry.key)}`,
      );
      return false;
    }

    const buckets = candidateBuckets(entry.key);
    const bucketIdx = buckets[tableIdx];

    debugLog(
      `[place] key=${formatKey(entry.key)}, candidates=${JSON.stringify(buckets)}, currentTable=${tableIdx}, kickCount=${kickCount}`,
    );

    if (tryInsertEntryIntoBucket(tableIdx, bucketIdx, entry)) {
      return true;
    }

    const displaced = evictFromBucket(tableIdx, bucketIdx, entry, kickCount);

    return placeEntry(
      displaced,
      (tableIdx + 1) % numTables,
      kickCount + 1,
      limit,
    );
  }

  // -----------------------------------------------------------------
  // Rendering helpers
  // -----------------------------------------------------------------

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
   * A snapshot preserves the table / bucket / slot layout. It is mainly useful
   * for debugging, rendering, and tests that care about the physical shape of
   * the table.
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
            slot === EMPTY ? null : { key: slot.key, value: slot.value },
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
        slot === EMPTY ? null : { key: slot.key, value: slot.value },
      ),
    };
  }

  /**
   * Return all live entries as a flat array of { key, value } pairs.
   *
   * This is intentionally different from snapshot():
   *
   *   snapshot()  -> preserves bucket / slot structure
   *   entries()   -> returns only live key-value pairs
   *
   * entries() is especially useful for resizing and rehashing.
   *
   * @returns {{key:any,value:any}[]}
   */
  function entries() {
    const out = [];

    for (const slot of cells) {
      if (slot !== EMPTY) {
        out.push({
          key: slot.key,
          value: slot.value,
        });
      }
    }

    return out;
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

  // -----------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------

  /**
   * Insert or update a key/value pair.
   *
   * If the key already exists, only its value is updated.
   * If the key is new, cuckoo insertion is attempted.
   * On insertion failure, the old table state is restored.
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

    const inserted = placeEntry(entry, 0, 0, Math.max(maxKicks, bucketCount));

    if (!inserted) {
      cells = backupCells;
      debugLog(
        `[rollback] insertion failed for key=${formatKey(key)}; previous state restored`,
      );
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
   * Return all live entries as a flat array.
   *
   * @returns {{key:any,value:any}[]}
   
  function entriesPublic() {
    return entries();
  }
*/

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
   * Useful for debugging and teaching.
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
      totalSize,
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
    entries,
    render,
    print,
    locate,
    getConfig,
  };
}
