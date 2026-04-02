

// Javascript program to demonstrate
// classic cuckoo hashing using ONE flat 1D array.

// number of logical tables
let ver = 2;

// slots per logical table
let MAXN = 11;

// empty marker
let EMPTY = Number.MIN_VALUE;

/*
    Flat 1D layout:

    table 0                  table 1
    |____|____|____|____|____|____|____|____|____|____|____|
    |____|____|____|____|____|____|____|____|____|____|____|

    physical flat array:
    |____|____|____|____|____|____|____|____|____|____|____|____|____|____|____|____|____|____|____|____|____|____|

    indices:
      0    1    2    3    4    5    6    7    8    9   10   11   12   13   14   15   16   17   18   19   20   21

    mapping:
    table 0, pos p  -> flat[p]
    table 1, pos p  -> flat[MAXN + p]
*/

// one flat array instead of hashtable[table][pos]
let hashtable = new Array(ver * MAXN).fill(EMPTY);

// Array to store possible positions for a key
let pos = Array(ver).fill(0);

/*
    Convert logical coordinates (tableID, pos)
    into one flat 1D index.
*/
function index(tableID, position)
{
    return tableID * MAXN + position;
}

/*
    Fill hash table with dummy value.
*/
function initTable()
{
    hashtable.fill(EMPTY);
}

/*
    Return hashed value for a key.
    This returns the logical position INSIDE one table.
*/
function hash(funcID, key)
{
    switch (funcID)
    {
        case 1: return key % MAXN;
        case 2: return Math.floor(key / MAXN) % MAXN;
    }
    return EMPTY;
}

/*
    Place a key in one of its possible positions.

    tableID: which logical table to try
    cnt    : number of recursive displacements so far
    n      : max number of allowed recursive displacements
*/
function place(key, tableID, cnt, n)
{
    // cycle / too many displacements
    if (cnt == n)
    {
        document.write(key + " unpositioned<br/>");
        document.write("Cycle present. REHASH.<br/>");
        return;
    }

    // compute both candidate logical positions
    for (let i = 0; i < ver; i++)
    {
        pos[i] = hash(i + 1, key);

        // already present?
        if (hashtable[index(i, pos[i])] == key)
            return;
    }

    let idx = index(tableID, pos[tableID]);

    // occupied -> evict and recurse
    if (hashtable[idx] != EMPTY)
    {
        let dis = hashtable[idx];
        hashtable[idx] = key;
        place(dis, (tableID + 1) % ver, cnt + 1, n);
    }
    else
    {
        // empty -> place directly
        hashtable[idx] = key;
    }
}

/*
    Lookup a key by checking its two candidate positions.
*/
function lookup(key)
{
    for (let i = 0; i < ver; i++)
    {
        let p = hash(i + 1, key);
        let idx = index(i, p);

        if (hashtable[idx] == key)
        {
            return {
                found: true,
                table: i,
                position: p,
                flatIndex: idx
            };
        }
    }

    return { found: false };
}

/*
    Print the final table both as logical tables
    and as one flat physical array.
*/
function printTable()
{
    document.write("Final logical hash tables:<br/>");

    for (let i = 0; i < ver; i++)
    {
        for (let j = 0; j < MAXN; j++)
        {
            let value = hashtable[index(i, j)];
            if (value == EMPTY)
                document.write("- ");
            else
                document.write(value + " ");
        }
        document.write("<br/>");
    }

    document.write("<br/>Underlying flat 1D array:<br/>");
    for (let i = 0; i < hashtable.length; i++)
    {
        if (hashtable[i] == EMPTY)
            document.write("- ");
        else
            document.write(hashtable[i] + " ");
    }
    document.write("<br/><br/>");
}

/*
    Cuckoo-hash all keys.
*/
function cuckoo(keys, n)
{
    initTable();

    for (let i = 0, cnt = 0; i < n; i++, cnt = 0)
        place(keys[i], 0, cnt, n);

    printTable();
}


// Driver program

// no cycle
let keys_1 = [20, 50, 53, 75, 100, 67, 105, 3, 36, 39];
cuckoo(keys_1, keys_1.length);

document.write("Lookup 67: " + JSON.stringify(lookup(67)) + "<br/>");
document.write("Lookup 999: " + JSON.stringify(lookup(999)) + "<br/><br/>");

// likely cycle / rehash case
let keys_2 = [20, 50, 53, 75, 100, 67, 105, 3, 36, 39, 6];
cuckoo(keys_2, keys_2.length);

