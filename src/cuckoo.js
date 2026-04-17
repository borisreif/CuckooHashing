/**
 * 
 * Bucketed cuckoo hashing using one flat 1D array.
 * 
 * @author Boris A. Reif
 * @version 0.0.2
 * 
 * Logical model:
 * - numTables - logical tables
 * - each table has bucketCount buckets
 * - each bucket has bucketSize slots (s)
 * 
 * Physical model:
 * - one contiguous flat array called 'cells'
 * 
 * Example layout when numTables = 2, bucketCount = 3, bucketSize = 2:
 * 
 * Logical structure:
 * table 0
 * 
 * |_____|_____|  |_____|_____|  |_____|_____|
 * [slot0 slot1]  [slot0 slot1]  [slot0 slot1]
 *    bucket 0       bucket 1       bucket 2
 * 
 * table 1
 * 
 * |_____|_____|  |_____|_____|  |_____|_____|
 * [slot0 slot1]  [slot0 slot1]  [slot0 slot1]
 *    bucket 0       bucket 1       bucket 2
 * 
 * Physical structure, flat array
 * flat array with first part table 1, second part table 2, indexed from 0 to 11
 * 
 *  idx0 idx1   idx2 idx3   idx4 idx5   idx6 idx7   idx8 idx9  idx10 idx11
 * |____|____| |____|____| |____|____| |____|____| |____|____| |____|____|
 * 
 * 
 * Logical and physical structure compared:
 * The first two lines show the actual physical structure with the indices.
 * The bottom lines illustrate the logical layout.
 * 
 *  idx0 idx1   idx2 idx3   idx4 idx5   idx6 idx7   idx8 idx9  idx10 idx11
 * |____|____| |____|____| |____|____| |____|____| |____|____| |____|____|
 * 
 * |------------ table 0 ------------| |------------ table 1 ------------|
 *   bucket 0    bucket 1   bucket 2     bucket 0    bucket 1    bucket 2
 *  [ s0  s1 ] [ s0  s1 ]  [ s0  s1 ]  [ s0  s1 ]  [ s0  s1 ]  [ s0  s1 ]
 * 
 * 
 * tableSize = bucketCount * bucketSize = 3 * 2 = 6;
 * totalSize = numTables * tableSize = 2 * 6 = 12;
 * 
 * Return the first array index of a bucket
 * 
 * Logical layer
 * |------------ table 0 ------------| |------------ table 1 ------------|
 *   bucket 0    bucket 1   bucket 2     bucket 0    bucket 1    bucket 2
 * 
 * physical layer
 * |____|____| |____|____| |____|____| |____|____| |____|____| |____|____|
 * |idx0 idx1  |idx2 idx3  |idx4 idx5  |idx6 idx7  |idx8 idx9  |idx10 idx11
 * |           |           |           |           |           |
 *   0           2           4           6           8           10
 * 
 * => Parameter bounds:
 * tableIdx can be 0 or 1
 * bucketIdx can be 0,1 or 2
 * 
 * bucketStart(0, 0) = 0
 * bucketStart(0, 1) = 2
 * bucketStart(0, 2) = 4
 * 
 * bucketStart(1, 0) = 6
 * bucketStart(1, 1) = 8
 * bucketStart(1, 2) = 10
 * 
 * 
 * 
 * Convert logical coordinates (tableIdx, bucketIdx, slotIdx) into
 * one single flat-array index
 * 
 * Logical layer
 * |------------ table 0 ------------| |------------ table 1 ------------|
 *   bucket 0    bucket 1   bucket 2     bucket 0    bucket 1    bucket 2
 *  [ s0  s1 ]  [ s0  s1 ]  [ s0  s1 ]  [ s0  s1 ]  [ s0  s1 ]  [ s0  s1 ] 
 * 
 * physical layer
 * |____|____| |____|____| |____|____| |____|____| |____|____| |____|____|
 *  idx0 idx1   idx2 idx3   idx4 idx5   idx6 idx7   idx8 idx9   idx10 idx11
 *
 * slotIdx can be 0 or 1 in this example
 * 
 * index(0, 0, 0) =  0
 * index(0, 0, 1) =  1
 * index(0, 1, 0) =  2
 * index(0, 1, 1) =  3
 * index(0, 2, 0) =  4
 * index(0, 2, 1) =  5
 * 
 * index(1, 0, 0) =  6
 * index(1, 0, 1) =  7
 * index(1, 1, 0) =  8
 * index(1, 1, 1) =  9
 * index(1, 2, 0) = 10
 * index(1, 2, 1) = 11
 * 
 * 
 * 
 *  */





/**
 * Print a debug message only when debug mode is enabled.
 *
 * @param {Object} table
 * @param {...any} args
 */
function debugLog(table, ...args) {
    if (table.config.debug) {
        table.config.logger(...args);
    }
}




/**
 * Build and validate the normalized configuration object.
 * 
 * @param {Object} options
 * @param {number} options.numTables - the number of logical Tables (e.g.: 2)
 * @param {number} options.bucketCount - num of buckets/bins per logical table
 * @param {number} options.bucketSize - num of slots/cells in each bucket/bin
 * @param {number} options.maxKicks - the maximum number of displacements before 
 *                                    insertion attempts are being stopped
 * @param {Function[]} options.hashFunctions  - list or pool of hash 
 *                                              functions as an array
 * @param {number[]} options.tableToHash - simple array of which hash 
 *                                         functions to use
 * @param {boolean} [options.debug=false] - Enable debug logging.
 * @param {Function} [options.logger=console.log] - Logging function.
 * @returns {Object} Normalized configuration object.
 *      tableSize - total number of cells  or entries in one table
 *                               derived: bucketCount * bucketSize;
 *      totalSize - total number of cells or entries overall 
 *                               (that is across all tables)
 *                               derived: numTables * tableSize
 *      empty - the empty marker
 *      debug - debug mode on or off
 *      logger
 * 
 * 
 */
function createConfig({
    numTables,
    bucketCount,
    bucketSize,
    maxKicks,
    hashFunctions,
    tableToHash,
    debug = false,
    logger = console.log
}) {
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

    const tableSize = bucketCount * bucketSize;
    const totalSize = numTables * tableSize;
    const empty = Symbol("EMPTY");

    return {
        numTables,
        bucketCount,
        bucketSize,
        maxKicks,
        hashFunctions,
        tableToHash,
        tableSize,
        totalSize,
        empty,
        debug,
        logger
    };
}


/**
 * Create the default configuration
 * 
 * @param {number} numTables - the number of logical Tables (e.g.: 2)
 * @param {number} bucketCount - the number of buckets or bins per logical table
 * @param {number} maxKicks - the maximum number of displacements before 
 *                            insertion attempts are being stopped
 * @param {number} bucketSize - number of slots or cells in each bucket or bin
 * @param {Object[]} hashFunctions - list or pool of hash functions as an array
 * @param {Object[]} tableToHash - simple array of which hash functions to use
 * 
 * @returns {Object} hashFunctions - pool of hash functions as an array
 * 
 */
const config = createConfig({
    numTables: 2,       
    bucketCount: 11,    
    bucketSize: 2,      
    maxKicks: 20,       
    hashFunctions: [
        (key, bucketCount) => key % bucketCount,
        (key, bucketCount) => Math.floor(key / bucketCount) % bucketCount,
        (key, bucketCount) => (key * 7 + 3) % bucketCount
    ],
    tableToHash: [0, 1]
});


/**
 * Create a new cuckoo-table object
 * 
 * one single flat 1D array storing every table contiguously
 * 
 * @param {Object} config 
 * @returns {{config: Object, cells: Array}} returns the cuckoo hash table
 */
function createCuckooTable(config) {
    return {
        config,
        cells: new Array(config.totalSize).fill(config.empty)
    };
}
            



/**
 * Return the flat-array index of the first slot of the given bucket.
 * 
 * @param {Object} table - the cuckoo table created by createCuckooTable(config)
 * @param {number} tableIdx - table index (logical)
 * @param {number} bucketIdx - bucket index (logical)
 * 
 * @returns {number} idx - starting index of this bucket (physical)
 * 
 *  */
function bucketStart(table, tableIdx, bucketIdx)
{
    const cfg = table.config;
    return tableIdx * cfg.tableSize + bucketIdx * cfg.bucketSize;
}


/**
 * Convert logical coordinates (tableIdx, bucketIdx, slotIdx) into
 * one single flat-array index
 * 
 * @param {Object} table - the Cuckoo table created by createCuckooTable(config)
 * @param {number} tableIdx - table index
 * @param {number} bucketIdx - bucket index
 * @param {number} slotIdx - slot index
 * 
 * @returns {number} idx - index
 * */
function index(table, tableIdx, bucketIdx, slotIdx)
{
    return bucketStart(table, tableIdx, bucketIdx) + slotIdx;
}


/**
 * Reset whole table to EMPTY.
 * 
 * @param {Object} table - the Cuckoo table created by createCuckooTable(config)
 * 
 * */
function initTable(table)
{
    table.cells.fill(table.config.empty);
}


/**
 * Evaluate one configured hash function.
 *
 * @param {Object} table - the Cuckoo table
 * @param {number} hashIndex
 * @param {number} key
 * @returns {number}
 */
function hash(table, hashIndex, key)
{
    const cfg = table.config;
    return cfg.hashFunctions[hashIndex](key, cfg.bucketCount);
}

/**
 * Return the candidate bucket for the key in each logical table
 * 
 * @example
 * 
 * [ bucketInTable0, bucketInTable1 ]
 * 
 * @param {Object} table - the Cuckoo table created
 * @param {number} key - the hash key
 * 
 * @returns {number[]} candidateBuckets - array of candidate buckets
 * 
 * */
function candidateBuckets(table, key) {
    const cfg = table.config;
    return cfg.tableToHash.map((hashIndex) => hash(table, hashIndex, key));
}

/**
 * Search for a key inside one specific bucket.
 * 
 * @param {Object} table - the Cuckoo table
 * @param {number} tableIdx - Which of the conceptually different tables
 * @param {number} bucketIdx - which bucket
 * @param {number} key - the hash key
 * 
 * @returns {number} slotIdx - slot index if found else -1
 * */
function findKeyInBucket(table, tableIdx, bucketIdx, key)
{
    const cfg = table.config;
    for (let slotIdx = 0; slotIdx < cfg.bucketSize; slotIdx++)
    {
        let idx = index(table, tableIdx, bucketIdx, slotIdx);
        if (table.cells[idx] === key)
            return slotIdx;
    }
    return -1;
}

/**
 * Search for an empty slot inside one specific bucket
 * 
 * @param {Object} table - the Cuckoo table
 * @param {number} tableIdx - Which of the conceptually different tables
 * @param {number} bucketIdx - which bucket
 * 
 * @returns {number} slotIdx - slot index if found else -1 (bucket is full)
 * */
function findEmptySlot(table, tableIdx, bucketIdx)
{
    const cfg = table.config;
    for (let slotIdx = 0; slotIdx < cfg.bucketSize; slotIdx++)
    {
        let idx = index(table, tableIdx, bucketIdx, slotIdx);
        if (table.cells[idx] === cfg.empty)
            return slotIdx;
    }
    return -1;
}




/**
 * Check whether a key already exists in one of its legal buckets
 * 
 * @param {Object} table - the Cuckoo table
 * @param {number} key - hash key
 * @param {number[]} buckets - array of buckets
 * 
 * @returns {boolean} return true if key exists
 * */
function keyExists(table, key, buckets)
{
    const cfg = table.config;
    for (let tableIdx = 0; tableIdx < cfg.numTables; tableIdx++)
    {
        if (findKeyInBucket(table, tableIdx, buckets[tableIdx], key) !== -1)
            return true;
    }
    return false;
}


/**
 * Insertion: Try to insert a key directly into a bucket
 * 
 * @param {Object} table - the Cuckoo table
 * @param {number} tableIdx - table index
 * @param {number} bucketIdx - bucket index
 * @param {number} key - hash key
 * 
 * @returns {boolean} return true if successful else false
 * */
function tryInsertIntoBucket(table, tableIdx, bucketIdx, key)
{
    const slotIdx = findEmptySlot(table, tableIdx, bucketIdx);

    if (slotIdx === -1)
        return false;

    table.cells[index(table, tableIdx, bucketIdx, slotIdx)] = key;

    debugLog(
        table,
        `[insert] key=${key} placed in table=${tableIdx}, 
        bucket=${bucketIdx}, 
        slot=${slotIdx}`
    );

    return true;
}

/**
 * Evict one resident key from a full bucket and place the new key there
 *
 * @param {Object} table - the Cuckoo table
 * @param {number} tableIdx - table index
 * @param {number} bucketIdx - bucket index
 * @param {number} key - hash key
 * @param {number} kickCount
 * @returns {number} displaced
 */
function evictFromBucket(table, tableIdx, bucketIdx, key, kickCount)
{
    const cfg = table.config;
    let victimSlotIdx = kickCount % cfg.bucketSize;
    let victimIndex = index(table, tableIdx, bucketIdx, victimSlotIdx);

    let displaced = table.cells[victimIndex];
    table.cells[victimIndex] = key;

    debugLog(
        table,
        `[evict] key=${key} placed in table=${tableIdx}, 
        bucket=${bucketIdx}, 
        slot=${victimSlotIdx}; 
        displaced=${displaced}`
    );

    return displaced;
}


/**
 * Place a key using bucketed cuckoo hashing.
 *
 *   Idea:
 *   1. Compute the candidate bucket in each table.
 *   2. If key already exists, stop.
 *   3. Try to place key in a free slot in the chosen bucket.
 *   4. If bucket is full, evict one key and recursively reinsert it
 *      into the next table.
 * @param {Object} table - the hash table
 * @param {number} key - hash key to insert
 * @param {number} tableIdx - table index
 * @param {number} kickCount - current number of displacements
 * @param {number} limit - maximum allowed number of displacements
 * @returns {boolean}
 * 
 * */
function place(table, key, tableIdx, kickCount, limit)
{
    const cfg = table.config;

    if (kickCount >= limit) {
        debugLog(table, `[fail] kick limit reached while inserting key=${key}`);
        return false;   
    }

    const buckets = candidateBuckets(table, key);

    debugLog(
        table,
        `[place] key=${key}, 
        candidates=${JSON.stringify(buckets)}, 
        currentTable=${tableIdx}, 
        kickCount=${kickCount}`
    );

    if (keyExists(table, key, buckets)) {
        debugLog(table, `[skip] key=${key} already exists`);
        return true;
    }

    const bucketIdx = buckets[tableIdx];

    if (tryInsertIntoBucket(table, tableIdx, bucketIdx, key)) {
        return true;
    }

    const displaced = evictFromBucket(table, 
                                      tableIdx, 
                                      bucketIdx, 
                                      key, 
                                      kickCount);

    return place(
        table,
        displaced,
        (tableIdx + 1) % cfg.numTables,
        kickCount + 1,
        limit
    );
}


/**
 * Look up a key
 * 
 * A key may live in:
 * - any slot of its bucket in table 0
 * - any slot of its bucket in table 1
 * So we:
 * 1. compute the candidate bucket in each table
 * 2. scan all slots in those buckets
 *
 * @param {Object} table
 * @param {number} key
 * @returns {Object}
 *
 * */
function lookup(table, key)
{
    const cfg = table.config;
    const buckets = candidateBuckets(table, key);
    
    for (let tableIdx = 0; tableIdx < cfg.numTables; tableIdx++)
    {
        const bucketIdx = buckets[tableIdx];

        for (let slotIdx = 0; slotIdx < cfg.bucketSize; slotIdx++)
        {
            const idx = index(table, tableIdx, bucketIdx, slotIdx);

            if (table.cells[idx] === key)
            {
                return {
                    found: true,
                    tableIdx: tableIdx,
                    bucketIdx: bucketIdx,
                    slotIdx: slotIdx,
                    flatIndex: idx
                };
            }
        }
    }

    return { found: false };
}


/*
    Print table in logical form:
    table -> bucket -> slot

function printTable(table)
{
    document.write("Final bucketed cuckoo tables:<br/><br/>");

    for (let tableIdx = 0; tableIdx < table.config.numTables; tableIdx++)
    {
        document.write("Table " + tableIdx + ":<br/>");

        for (let bucketIdx = 0; bucketIdx < table.config.bucketCount; bucketIdx++)
        {
            document.write("Bucket " + bucketIdx + ": [ ");

            for (let slotIdx = 0; slotIdx < table.config.bucketSize; slotIdx++)
            {
                const idx = index(table, tableIdx, bucketIdx, slotIdx);
                const value = table.cells[idx];

                if (value === table.config.empty)
                    document.write("- ");
                else
                    document.write(value + " ");
            }

            document.write("]<br/>");
        }

        document.write("<br/>");
    }

    // Also print underlying flat array
    document.write("Underlying flat 1D array:<br/>");
    for (let i = 0; i < table.cells.length; i++)
    {
        if (table.cells[i] === table.config.empty)
            document.write("- ");
        else
            document.write(table.cells[i] + " ");
    }
    document.write("<br/><br/>");
}
    */


/**
 * Print the table in a console-friendly form.
 *
 * @param {Object} table
 */
function printTable(table) {
    const cfg = table.config;

    out(table, "Final bucketed cuckoo tables:\n");

    for (let tableIdx = 0; tableIdx < cfg.numTables; tableIdx++) {
        out(table, `Table ${tableIdx}:`);

        for (let bucketIdx = 0; bucketIdx < cfg.bucketCount; bucketIdx++) {
            const values = [];

            for (let slotIdx = 0; slotIdx < cfg.bucketSize; slotIdx++) {
                const idx = index(table, tableIdx, bucketIdx, slotIdx);
                const value = table.cells[idx];
                values.push(value === cfg.empty ? "-" : String(value));
            }

            out(table, `  Bucket ${bucketIdx}: [ ${values.join(" ")} ]`);
        }

        out(table, "");
    }

    const flat = table.cells.map((value) => (value === cfg.empty ? "-" : String(value)));
    out(table, "Underlying flat 1D array:");
    out(table, flat.join(" "));
    out(table, "");
}

/**
 * Insert all keys from the input array into the cuckoo table.
 *
 * @param {Object} table
 * @param {number[]} keys
 */
function cuckoo(table, keys) {
    const cfg = table.config;

    initTable(table);

    for (let i = 0; i < keys.length; i++) {
        const inserted = place(
            table,
            keys[i],
            0,
            0,
            Math.max(cfg.maxKicks, keys.length)
        );

        if (!inserted) {
            out(table, `Failed to insert key ${keys[i]}. Rehash needed.`);
            break;
        }
    }

    printTable(table);
}

/**
 * Example configuration.
 */
const config = createConfig({
    numTables: 2,
    bucketCount: 11,
    bucketSize: 2,
    maxKicks: 20,
    debug: true,          // set to false to silence debug logs
    logger: console.log,  // replace with another logger if needed
    hashFunctions: [
        (key, bucketCount) => key % bucketCount,
        (key, bucketCount) => Math.floor(key / bucketCount) % bucketCount,
        (key, bucketCount) => (key * 7 + 3) % bucketCount
    ],
    tableToHash: [0, 1]
});

/**
 * Small demo.
 */
const table = createCuckooTable(config);
const keys = [88, 40, 20, 50, 53, 75, 100, 67, 105, 3, 36, 39, 6];

cuckoo(table, keys);
console.log("Lookup 67:", lookup(table, 67));
console.log("Lookup 999:", lookup(table, 999));