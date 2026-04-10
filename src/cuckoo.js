/**
 * 
 * Bucketed cuckoo hashing using one single flat array (1D).
 * 
 * @author Boris A. Reif
 * @version 0.0.1
 * 
 * Logical structure:
 * - NUM_TABLES tables
 * - each table has BUCKET_COUNT buckets
 * - each bucket has BUCKET_SIZE slots (s)
 * 
 * Physical structure:
 * - one contiguous flat array
 * 
 * 
 * @example
 * Example layout when NUM_TABLES = 2, BUCKET_COUNT = 3, BUCKET_SIZE = 2:
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
 * Physical structure
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
 * TABLE_SIZE(6) = BUCKET_COUNT(3) * BUCKET_SIZE(2);
 * TOTAL_SIZE(12) = NUM_TABLES(2) * TABLE_SIZE(6);
 * 
 *
 * 
 * 
 * Return the first array index of a bucket
 * 
 * @example
 * Example layout when NUM_TABLES = 2, BUCKET_COUNT = 3, BUCKET_SIZE = 2:
 *  config.numTables: 2,      
 *  config.bucketCount: 3,  
 *  config.bucketSize: 2,
 * 
 * => TABLE_SIZE = 6
 * => TOTAL_SIZE = 12 
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
 * @example
 * 
 * Example layout when NUM_TABLES = 2, BUCKET_COUNT = 3, BUCKET_SIZE = 2:
 *  config.numTables: 2,      
 *  config.bucketCount: 3,  
 *  config.bucketSize: 2,
 * 
 * => TABLE_SIZE = 6
 * => TOTAL_SIZE = 12 
 * 
 * Logical layer
 * |------------ table 0 ------------| |------------ table 1 ------------|
 *   bucket 0    bucket 1   bucket 2     bucket 0    bucket 1    bucket 2
 *  [ s0  s1 ]  [ s0  s1 ]  [ s0  s1 ]  [ s0  s1 ]  [ s0  s1 ]  [ s0  s1 ] 
 * 
 * physical layer
 * |____|____| |____|____| |____|____| |____|____| |____|____| |____|____|
 * |idx0 idx1  |idx2 idx3  |idx4 idx5  |idx6 idx7  |idx8 idx9  |idx10 idx11
 * |           |           |           |           |           |
 *   0           2           4           6           8           10
 * 
 * bucketStart(0, 0) = 0
 * bucketStart(0, 1) = 2
 * bucketStart(0, 2) = 4
 * 
 * bucketStart(1, 0) = 6
 * bucketStart(1, 1) = 8
 * bucketStart(1, 2) = 10
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
 * Create a config object
 * 
 * @param {number} numTables - the number of logical Tables (e.g.: 2)
 * @param {number} bucketCount - the number of buckets or bins per logical table
 * @param {number} maxKicks - the maximum number of displacements before 
 *                            insertion attempts are being stopped
 * @param {number} bucketSize - number of slots or cells in each bucket or bin
 * @param {Function[]} hashFunctions - list or pool of hash functions as an array
 * @param {number[]} tableToHash - simple array of which hash functions to use
 * 
 * @returns {Object} config - normalized configuration object:
 *      numTables - the number of logical Tables (e.g.: 2)
 *      bucketCount - number of buckets or bins per logical table
 *      maxKicks - the maximum number of displacements before 
 *                 insertion attempts are being stopped
 *      bucketSize - number of slots or cells in each bucket or bin
 *      hashFunctions - pool of hash functions as an array
 *      tableToHash - simple array of which hash functions to use
 *      tableSize - total number of cells  or entries in one table
 *                               derived: bucketCount * bucketSize;
 *      totalSize - total number of cells or entries overall 
 *                               (that is across all tables)
 *                               derived: numTables * tableSize
 *      empty - the empty marker
 * 
 * 
 */
function createConfig({
    numTables,      // num of tables
    bucketCount,    // num of buckets per table
    bucketSize,     // num of slots in each bucket
    maxKicks,       // max number of displacements before insertion gives up
    hashFunctions,
    tableToHash
}) {
    // total number of cells  or entries in one table
    const tableSize = bucketCount * bucketSize;
    // total number of cells or entries overall (that is across all tables)
    const totalSize = numTables * tableSize;
    // empty marker
    const empty = Symbol("EMPTY"); 

    if (hashFunctions.length === 0) {
        throw new Error("hashFunctions must not be empty");
    }

    if (tableToHash.length !== numTables) {
        throw new Error("tableToHash length must equal numTables");
    }

    if (bucketCount <= 0 || bucketSize <= 0 || numTables <= 0) {
        throw new Error(
            "numTables, bucketCount, and bucketSize must be positive"
        );
    }

    return {
        numTables,
        bucketCount,
        bucketSize,
        maxKicks,
        hashFunctions,
        tableToHash,
        tableSize,
        totalSize,
        empty
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
 * Create the Cuckoo Hash Table
 * 
 * one single flat 1D array storing every table contiguously
 * 
 * @param {*} config 
 * @returns {} cuckooTable - returns the cuckoo hash table
 */
function createCuckooTable(config) {
    return {
        config,
        cells: new Array(config.totalSize).fill(config.empty)
    };
}
            



/**
 * Return the first array index of a bucket
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
    return tableIdx * table.config.tableSize + bucketIdx * table.config.bucketSize;
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



function hash(table, hashIndex, key)
{
    return table.config.hashFunctions[hashIndex](key, table.config.bucketCount);
}

/**
 * Return the candidate bucket for the key in each table
 * 
 * @example
 * 
 * [ bucketInTable0, bucketInTable1 ]
 * 
 * @param {Object} table - the Cuckoo table created by createCuckooTable(config)
 * @param {number} key - the hash key
 * 
 * @returns {Object[]} candidateBuckets - array of candidate buckets
 * 
 * */
function candidateBuckets(table, key) {
    return table.config.tableToHash.map((hashIndex) => hash(table, hashIndex, key));
}
/*
function candidateBuckets(table, key)
{
    return table.config.tableToHash.map(function (hashIndex) {
        return hash(table, hashIndex, key);
    });
}
*/
/**
 * Search for a key inside one specific bucket.
 * 
 * @param {Object} table - the Cuckoo table
 * @param {number} tableIdx - Which of the conceptually different tables
 * @param {number} bucketIdx - which bucket
 * @param {number} key - the hash key
 * 
 * @returns {number} slot - slot index if found else -1
 * */
function findKeyInBucket(table, tableIdx, bucketIdx, key)
{
    for (let slot = 0; slot < table.config.bucketSize; slot++)
    {
        let idx = index(table, tableIdx, bucketIdx, slot);
        if (table.cells[idx] === key)
            return slot;
    }
    return -1;
}

/**
 * Search for an empty slot inside one specific bucket.
 * 
 * @param {Object} table - the Cuckoo table
 * @param {number} tableIdx - Which of the conceptually different tables
 * @param {number} bucketIdx - which bucket
 * 
 * @returns {number} slot - slot index if found else -1 (bucket is full)
 * */
function findEmptySlot(table, tableIdx, bucketIdx)
{
    for (let slot = 0; slot < table.config.bucketSize; slot++)
    {
        let idx = index(table, tableIdx, bucketIdx, slot);
        if (table.cells[idx] === table.config.empty)
            return slot;
    }
    return -1;
}




/**
 * Does the key exist already?
 * 
 * @param {Object} table - the Cuckoo table
 * @param {number} key - hash key
 * @param {Object[]} buckets - array of buckets
 * 
 * @returns {Boolean} return true if key exists
 * */
function keyExists(table, key, buckets)
{
    for (let tableIdx = 0; tableIdx < table.config.numTables; tableIdx++)
    {
        if (findKeyInBucket(table, tableIdx, buckets[tableIdx], key) !== -1)
            return true;
    }
    return false;
}


/**
 * Insertion
 * 
 * @param {Object} table - the Cuckoo table
 * @param {number} tableIdx - table index
 * @param {number} bucketIdx - bucket index
 * @param {number} key - hash key
 * 
 * @returns {Boolean} return true if successful else false
 * */
function tryInsertIntoBucket(table, tableIdx, bucketIdx, key)
{
    let slotIdx = findEmptySlot(table, tableIdx, bucketIdx);
    if (slotIdx === -1)
        return false;

    table.cells[index(table, tableIdx, bucketIdx, slotIdx)] = key;
    return true;
}


function evictFromBucket(table, tableIdx, bucketIdx, key, kickCount)
{
    let victimSlot = kickCount % table.config.bucketSize;
    let victimIndex = index(table, tableIdx, bucketIdx, victimSlot);

    let displaced = table.cells[victimIndex];
    table.cells[victimIndex] = key;

    return displaced;
}


/*
    Place a key using bucketed cuckoo hashing.

    key     : key to insert
    tableID : which table we are currently trying
    kickCount     : current number of displacements
    limit   : maximum allowed number of displacements

    Idea:
    1. Compute the candidate bucket in each table.
    2. If key already exists, stop.
    3. Try to place key in a free slot in the chosen bucket.
    4. If bucket is full, evict one key and recursively reinsert it
       into the next table.
*/
function place(table, key, tableIdx, kickCount, limit)
{
    if (kickCount >= limit)
        return false;

    const buckets = candidateBuckets(table, key);

    if (keyExists(table, key, buckets))
        return true;

    const bucketIdx = buckets[tableIdx];

    if (tryInsertIntoBucket(table, tableIdx, bucketIdx, key))
        return true;

    let displaced = evictFromBucket(table, tableIdx, bucketIdx, key, kickCount);

    return place(
        table,
        displaced,
        (tableIdx + 1) % table.config.numTables,
        kickCount + 1,
        limit
    );
}




/*
    Lookup a key.

    A key may live in:
    - any slot of its bucket in table 0
    - any slot of its bucket in table 1

    So we:
    1. compute the candidate bucket in each table
    2. scan all slots in those buckets
*/
function lookup(table, key)
{
    const buckets = candidateBuckets(table, key);
    
    for (let tableIdx = 0; tableIdx < table.config.numTables; tableIdx++)
    {
        const bucketIdx = buckets[tableIdx];

        for (let slotIdx = 0; slotIdx < table.config.bucketSize; slotIdx++)
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
*/
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


/*
    Insert all keys into the cuckoo table.
*/
function cuckoo(table, keys)
{
    initTable(table);

    for (let i = 0; i < keys.length; i++)
    {
        const inserted = place(table, keys[i], 0, 0, Math.max(table.config.maxKicks, keys.length));

        if (!inserted)
        {
            document.write("Failed to insert key " + keys[i] + ". Rehash needed.<br/>");
            break;
        }
    }

    printTable(table);
}

// Driver program
const table = createCuckooTable(config);
let keys = [88, 40, 20, 50, 53, 75, 100, 67, 105, 3, 36, 39, 6];

cuckoo(table, keys);
lookup(table, 67);
printTable(table);

document.write("Lookup 67: " + JSON.stringify(lookup(table, 67)) + "<br/>");
document.write("Lookup 999: " + JSON.stringify(lookup(table, 999)) + "<br/>");

