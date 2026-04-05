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
 * Logical and physical structure compared.
 * The first two lines show the actual physical structure with the indeces.
 * The bottom lines illsutrate the logical layout.
 * 
 *  idx0 idx1   idx2 idx3   idx4 idx5   idx6 idx7   idx8 idx9  idx10 idx11
 * |____|____| |____|____| |____|____| |____|____| |____|____| |____|____|
 * 
 * |------------ table 0 ------------| |------------ table 1 ------------|
 *   bucket 0    bucket 1   bucket 2     bucket 3    bucket 4    bucket 5
 *  [ s0  s1 ] [ s0  s1 ]  [ s0  s1 ]  [ s0  s1 ]  [ s0  s1 ]  [ s0  s1 ]
 * 
 * 
 * TABLE_SIZE(6) = BUCKET_COUNT(3) * BUCKET_SIZE(2);
 * TOTAL_SIZE(12) = NUM_TABLES(2) * TABLE_SIZE(2);
 * 
 *
 * 
 * 
 *  */

const NUM_TABLES = 2;                         // num of tables
const BUCKET_COUNT = 11;                      // num of buckets per table
const BUCKET_SIZE = 2;                        // num of slots in each bucket
const TABLE_SIZE = BUCKET_COUNT * BUCKET_SIZE;// total num of cells in one table
const TOTAL_SIZE = NUM_TABLES * TABLE_SIZE;   // total num of cells overall
//const EMPTY = Number.MIN_VALUE;               // empty marker
//const EMPTY = null;
const EMPTY = Symbol("EMPTY");                // empty marker

const MAX_KICKS = 20; // max number of displacements before insertion gives up

// one single flat 1D array storing every table contiguously
let hashtable = new Array(TOTAL_SIZE).fill(EMPTY); 


// TOTAL_SIZE (44) = BUCKET_COUNT(11) * BUCKET_SIZE(2) * NUM_TABLES(2)
//console.log("Print hashtable: ");
//hashtable.forEach(function(entry) {
//    console.log(entry);
//});

// stores the candidate bucket for each table for a given key
// let pos = new Array(NUM_TABLES).fill(0);


/*
    Convert logical coordinates:

        (tableID, bucketID, slotID)

    into one flat 1D array index.

    Layout formula:
        table offset + bucket offset + slot offset

function index(tableID, bucketID, slotID)
{
    return tableID * TABLE_SIZE + bucketID * BUCKET_SIZE + slotID;
}
    */

/**
 * Return the first array index of a bucket
 * 
 * @example
 * Example layout when NUM_TABLES = 2, BUCKET_COUNT = 3, BUCKET_SIZE = 2:
 * 
 * => TABLE_SIZE = 6
 * => TOTAL_SIZE = 12 
 * 
 * Logical layer
 * |------------ table 0 ------------| |------------ table 1 ------------|
 *   bucket 0    bucket 1   bucket 2     bucket 3    bucket 4    bucket 5
 * 
 * physcial layer
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
 * @param {number} tableIdx - table index (logical)
 * @param {number} bucketIdx - bucket index (logical)
 * 
 * @returns {number} idx - starting index of this bucket (physical)
 * 
 *  */
function bucketStart(tableIdx, bucketIdx)
{
    return tableIdx * TABLE_SIZE + bucketIdx * BUCKET_SIZE;
}


/**
 * Convert logical coordinates (tableIdx, bucketIdx, slotIdx) into
 * one single flat-array index
 * 
 * @example
 * 
 * Example layout when NUM_TABLES = 2, BUCKET_COUNT = 3, BUCKET_SIZE = 2:
 * 
 * => TABLE_SIZE = 6
 * => TOTAL_SIZE = 12 
 * 
 * Logical layer
 * |------------ table 0 ------------| |------------ table 1 ------------|
 *   bucket 0    bucket 1   bucket 2     bucket 3    bucket 4    bucket 5
 *  [ s0  s1 ]  [ s0  s1 ]  [ s0  s1 ]  [ s0  s1 ]  [ s0  s1 ]  [ s0  s1 ] 
 * 
 * physcial layer
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
 * @param {number} tableIdx - table index
 * @param {number} bucketIdx - bucket index
 * @param {number} slotIdx - slot index
 * 
 * @returns {number} idx - index
 * */
function index(tableIdx, bucketIdx, slotIdx)
{
    return bucketStart(tableIdx, bucketIdx) + slotIdx;
}


/*
    Reset whole table to EMPTY.
*/
function initTable()
{
    hashtable.fill(EMPTY);
}


/*
    Hash function.
    Returns a BUCKET index, not a single slot index.

    So for a key, each hash function chooses one candidate bucket.
*/
function hash(hash_func, key)
{
    switch (hash_func)
    {
        case 1: return key % BUCKET_COUNT;
        case 2: return Math.floor(key / BUCKET_COUNT) % BUCKET_COUNT;
    }
    return -1;
}


/*
    Search for a key inside one specific bucket.

    Return:
    - slot index if found
    - -1 if not found
*/
function findKeyInBucket(tableIdx, bucketIdx, key)
{
    for (let slot = 0; slot < BUCKET_SIZE; slot++)
    {
        let idx = index(tableIdx, bucketIdx, slot);
        if (hashtable[idx] === key)
            return slot;
    }
    return -1;
}


/*
    Search for an empty slot inside one specific bucket.

    Return:
    - slot index if found
    - -1 if bucket is full
*/
function findEmptySlot(tableID, bucketID)
{
    for (let slot = 0; slot < BUCKET_SIZE; slot++)
    {
        let idx = index(tableID, bucketID, slot);
        if (hashtable[idx] === EMPTY)
            return slot;
    }
    return -1;
}

function candidateBuckets(key)
{
    return Array.from({ length: NUM_TABLES }, (_, i) => hash(i + 1, key));
}


/*
function contains(key)
{
    let buckets = candidateBuckets(key);

    for (let tableID = 0; tableID < NUM_TABLES; tableID++)
    {
        if (findKeyInBucket(tableID, buckets[tableID], key) !== -1)
            return true;
    }
    return false;
}
    */

function keyExists(key, buckets)
{
    for (let tableID = 0; tableID < NUM_TABLES; tableID++)
    {
        if (findKeyInBucket(tableID, buckets[tableID], key) !== -1)
            return true;
    }
    return false;
}

function tryInsertIntoBucket(tableID, bucketID, key)
{
    let slot = findEmptySlot(tableID, bucketID);
    if (slot === -1)
        return false;

    hashtable[index(tableID, bucketID, slot)] = key;
    return true;
}

function evictFromBucket(tableID, bucketID, key, kickCount)
{
    let victimSlot = kickCount % BUCKET_SIZE;
    let victimIndex = index(tableID, bucketID, victimSlot);

    let displaced = hashtable[victimIndex];
    hashtable[victimIndex] = key;

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
function place(key, tableID, kickCount, limit)
{
    if (kickCount >= limit)
        return false;

    let buckets = candidateBuckets(key);

    if (keyExists(key, buckets))
        return true;

    let bucketID = buckets[tableID];

    if (tryInsertIntoBucket(tableID, bucketID, key))
        return true;

    let displaced = evictFromBucket(tableID, bucketID, key, kickCount);

    return place(displaced, (tableID + 1) % NUM_TABLES, kickCount + 1, limit);
}


/*
function place(key, tableID, kickCount, limit)
{
    // Too many displacements => likely cycle / bad configuration
    if (kickCount >= limit)
    {
        document.write(key + " unpositioned<br/>");
        document.write("Cycle present or kick limit reached. REHASH.<br/>");
        return;
    }

    // Compute candidate bucket in every table for this key
    for (let i = 0; i < NUM_TABLES; i++)
    {
        pos[i] = hash(i + 1, key);

        // If key is already in the table, do nothing
        if (findKeyInBucket(i, pos[i], key) !== -1)
            return;
    }

    let bucketID = pos[tableID];

    // First try to insert into a free slot in this bucket
    let emptySlot = findEmptySlot(tableID, bucketID);

    if (emptySlot !== -1)
    {
        hashtable[index(tableID, bucketID, emptySlot)] = key;
        return;
    }

    // If no free slot exists, bucket is full.
    // Evict one existing key from this bucket.
    //
    // Here we use a simple deterministic victim choice:
    // alternate by displacement count.
    let victimSlot = kickCount % BUCKET_SIZE;
    let victimIndex = index(tableID, bucketID, victimSlot);

    let displaced = hashtable[victimIndex];
    hashtable[victimIndex] = key;

    // Reinsert displaced key into the next table
    place(displaced, (tableID + 1) % NUM_TABLES, kickCount + 1, limit);
}
*/

/*
    Lookup a key.

    A key may live in:
    - any slot of its bucket in table 0
    - any slot of its bucket in table 1

    So we:
    1. compute the candidate bucket in each table
    2. scan all slots in those buckets
*/
function lookup(key)
{
    const buckets = candidateBuckets(key);
    
    for (let tableID = 0; tableID < NUM_TABLES; tableID++)
    {
        const bucketID = buckets[tableID];

        for (let slot = 0; slot < BUCKET_SIZE; slot++)
        {
            const idx = index(tableID, bucketID, slot);

            if (hashtable[idx] === key)
            {
                return {
                    found: true,
                    table: tableID,
                    bucket: bucketID,
                    slot: slot,
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
function printTable()
{
    document.write("Final bucketed cuckoo tables:<br/><br/>");

    for (let tableID = 0; tableID < NUM_TABLES; tableID++)
    {
        document.write("Table " + tableID + ":<br/>");

        for (let bucketID = 0; bucketID < BUCKET_COUNT; bucketID++)
        {
            document.write("Bucket " + bucketID + ": [ ");

            for (let slot = 0; slot < BUCKET_SIZE; slot++)
            {
                let idx = index(tableID, bucketID, slot);
                let value = hashtable[idx];

                if (value === EMPTY)
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
    for (let i = 0; i < hashtable.length; i++)
    {
        if (hashtable[i] === EMPTY)
            document.write("- ");
        else
            document.write(hashtable[i] + " ");
    }
    document.write("<br/><br/>");
}


/*
    Insert all keys into the cuckoo table.
*/
function cuckoo(keys, n)
{
    initTable();

    for (let i = 0; i < n; i++)
    {
        const inserted = place(keys[i], 0, 0, Math.max(MAX_KICKS, n));

        if (!inserted)
        {
            document.write("Failed to insert key " + keys[i] + ". Rehash needed.<br/>");
            break;
        }
    }

    printTable();
}

// Driver program

let keys = [88, 40, 20, 50, 53, 75, 100, 67, 105, 3, 36, 39, 6];

cuckoo(keys, keys.length);

document.write("Lookup 67: " + JSON.stringify(lookup(67)) + "<br/>");
document.write("Lookup 999: " + JSON.stringify(lookup(999)) + "<br/>");

