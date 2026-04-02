// Bucketed cuckoo hashing using ONE flat 1D array.
//
// Logical structure:
// - ver tables
// - each table has BUCKET_COUNT buckets
// - each bucket has BUCKET_SIZE slots
//
// Physical structure:
// - one contiguous flat array
//
// Example layout when ver = 2, BUCKET_COUNT = 5, BUCKET_SIZE = 2:
//
// table 0:
// |____|____| |____|____| |____|____| |____|____| |____|____|
//
// table 1:
// |____|____| |____|____| |____|____| |____|____| |____|____|
//
// flat array:
// |____|____|____|____|____|____|____|____|____|____|____|____|____|____|____|____|____|____|____|____|
//
// bucket 0        bucket 1        bucket 2        bucket 3        bucket 4
// [slot0 slot1]   [slot0 slot1]   [slot0 slot1]   [slot0 slot1]   [slot0 slot1]


// number of tables
let ver = 2;

// number of buckets per table
let BUCKET_COUNT = 11;

// number of slots in each bucket
let BUCKET_SIZE = 2;

// total number of cells in one table
let TABLE_SIZE = BUCKET_COUNT * BUCKET_SIZE;

// total number of cells overall
let TOTAL_SIZE = ver * TABLE_SIZE;

// empty marker
let EMPTY = Number.MIN_VALUE;

// maximum number of displacements before we give up
let MAX_KICKS = 20;

// one flat 1D array storing everything contiguously
let hashtable = new Array(TOTAL_SIZE).fill(EMPTY);

// stores the candidate bucket for each table for a given key
let pos = new Array(ver).fill(0);


/*
    Convert logical coordinates:

        (tableID, bucketID, slotID)

    into one flat 1D array index.

    Layout formula:
        table offset + bucket offset + slot offset
*/
function index(tableID, bucketID, slotID)
{
    return tableID * TABLE_SIZE + bucketID * BUCKET_SIZE + slotID;
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
function hash(funcID, key)
{
    switch (funcID)
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
function findKeyInBucket(tableID, bucketID, key)
{
    for (let slot = 0; slot < BUCKET_SIZE; slot++)
    {
        let idx = index(tableID, bucketID, slot);
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


/*
    Place a key using bucketed cuckoo hashing.

    key     : key to insert
    tableID : which table we are currently trying
    cnt     : current number of displacements
    limit   : maximum allowed number of displacements

    Idea:
    1. Compute the candidate bucket in each table.
    2. If key already exists, stop.
    3. Try to place key in a free slot in the chosen bucket.
    4. If bucket is full, evict one key and recursively reinsert it
       into the next table.
*/
function place(key, tableID, cnt, limit)
{
    // Too many displacements => likely cycle / bad configuration
    if (cnt >= limit)
    {
        document.write(key + " unpositioned<br/>");
        document.write("Cycle present or kick limit reached. REHASH.<br/>");
        return;
    }

    // Compute candidate bucket in every table for this key
    for (let i = 0; i < ver; i++)
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
    let victimSlot = cnt % BUCKET_SIZE;
    let victimIndex = index(tableID, bucketID, victimSlot);

    let displaced = hashtable[victimIndex];
    hashtable[victimIndex] = key;

    // Reinsert displaced key into the next table
    place(displaced, (tableID + 1) % ver, cnt + 1, limit);
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
function lookup(key)
{
    for (let tableID = 0; tableID < ver; tableID++)
    {
        let bucketID = hash(tableID + 1, key);

        for (let slot = 0; slot < BUCKET_SIZE; slot++)
        {
            let idx = index(tableID, bucketID, slot);

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

    for (let tableID = 0; tableID < ver; tableID++)
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
        place(keys[i], 0, 0, Math.max(MAX_KICKS, n));
    }

    printTable();
}


// Driver program

let keys = [20, 50, 53, 75, 100, 67, 105, 3, 36, 39, 6];

cuckoo(keys, keys.length);

document.write("Lookup 67: " + JSON.stringify(lookup(67)) + "<br/>");
document.write("Lookup 999: " + JSON.stringify(lookup(999)) + "<br/>");

