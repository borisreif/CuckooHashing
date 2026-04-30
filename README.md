# Bucketed Cuckoo Hash Map

A small JavaScript implementation of a **bucketed cuckoo hash map** with a
clean separation between:

- the **generic cuckoo hashing engine**
- the **key hashing / equality strategy**
- demos and tests

The project is intentionally designed as a teaching and experimentation codebase,
but it is also structured like a reusable small library.

## References

- Pagh & Rodler, *Cuckoo Hashing* — <https://www.brics.dk/RS/01/32/BRICS-RS-01-32.pdf>
- <https://en.wikipedia.org/wiki/Cuckoo_hashing>
- <https://www.geeksforgeeks.org/dsa/cuckoo-hashing/>
- <https://codecapsule.com/2013/07/20/cuckoo-hashing/>

## What bucketed cuckoo hashing is

Plain cuckoo hashing gives every key a small number of candidate locations.
With two logical tables, a key has two legal buckets:

- one bucket in table 0
- one bucket in table 1

A **bucketed** variant stores several slots inside each bucket, which reduces
pressure on the insertion process and often improves practical load factors.

When inserting a key:

1. Compute the candidate bucket in each logical table.
2. Try to place the entry in the current table's bucket.
3. If there is a free slot, insertion succeeds immediately.
4. If the bucket is full, evict one resident entry.
5. Reinsert the displaced entry into its alternate table.
6. Stop if the kick limit is reached.

That eviction-and-reinsert step is the characteristic “cuckoo” move.

## Logical vs physical layout

The map uses a **flat 1D array** internally even though the logic is described
in terms of tables, buckets, and slots.

Example with:

- `numTables = 2`
- `bucketCount = 3`
- `bucketSize = 2`

### Logical layout

```text
Table 0
|_____|_____|  |_____|_____|  |_____|_____|
[slot0 slot1]  [slot0 slot1]  [slot0 slot1]
   bucket 0       bucket 1       bucket 2

Table 1
|_____|_____|  |_____|_____|  |_____|_____|
[slot0 slot1]  [slot0 slot1]  [slot0 slot1]
   bucket 0       bucket 1       bucket 2
```

### Physical flat-array layout

```text
 idx0 idx1   idx2 idx3   idx4 idx5   idx6 idx7   idx8 idx9   idx10 idx11
|____|____| |____|____| |____|____| |____|____| |____|____| |_____|_____|
```

### Mapping between them

```text
|------------ table 0 ------------| |------------ table 1 ------------|
  bucket 0    bucket 1   bucket 2     bucket 0    bucket 1    bucket 2
 [ s0  s1 ] [ s0  s1 ] [ s0  s1 ]   [ s0  s1 ] [ s0  s1 ] [ s0  s1 ]
```

Derived sizes:

- `tableSize = bucketCount * bucketSize = 3 * 2 = 6`
- `totalSize = numTables * tableSize = 2 * 6 = 12`

## Architecture

The project is split into layers.

### 1. Generic cuckoo engine

File: `src/cuckoo.js`

This file knows about:

- tables
- buckets
- slots
- eviction
- insertion rollback
- rendering/debug output

It does **not** know how keys should be hashed.

Instead, it depends on a `keyOps` object with this interface:

```js
{
  hashBucket(key, which, bucketCount) => number,
  equals(a, b) => boolean,
  formatKey?(key) => string
}
```

That means the cuckoo engine is completely generic with respect to key type.

### 2. Key strategies

Files under `src/keyops/`

These modules define how keys behave.

#### `stringNumberKeyOps.js`

- supports numbers and strings
- compares keys by JS value
- uses a 32-bit string/number hash and seed-derived bucket hashes

#### `byteKeyOps.js`

- supports `Uint8Array`, `ArrayBuffer`, typed arrays, and `DataView`
- compares keys by **byte content**
- uses 32-bit **tabulation hashing**

#### `digestKeyOps.js`

- supports a user-supplied external digest function
- useful for content-addressable storage or digest-based keys
- keeps the cuckoo engine independent of any specific cryptographic algorithm

### 3. Demo and tests

- `demo.js` — manual demo usage
- `test/cuckoo.test.js` — automated tests using Node's built-in test runner

## Why tabulation hashing is used for byte keys

For byte-oriented keys, tabulation hashing is a good fit because it is:

- simple
- fast in JavaScript
- deterministic
- easy to seed for multiple hash functions

The idea is:

1. Split the byte stream into fixed-size blocks.
2. For each byte position, look up a precomputed random 32-bit value.
3. XOR those values together to get a block hash.
4. Mix block hashes into a running 32-bit hash.

This gives a practical non-cryptographic byte hash that works well as an input
to cuckoo bucket selection.

## Public API

```js
const map = createBucketedCuckooMap({...});

map.set(key, value);
map.get(key);
map.has(key);
map.delete(key);
map.clear();
map.size();
map.loadFactor();
map.snapshot();
map.render();
map.print();
map.locate(key);
map.getConfig();
```

## Example: strings and numbers

```js
import { createBucketedCuckooMap } from "./src/cuckoo.js";
import { createStringNumberKeyOps } from "./src/keyops/stringNumberKeyOps.js";

const map = createBucketedCuckooMap({
  bucketCount: 11,
  bucketSize: 2,
  keyOps: createStringNumberKeyOps()
});

map.set(88, "alpha");
map.set("hi", "Boris");

console.log(map.get(88));
console.log(map.get("hi"));
map.print();
```

## Example: byte keys

```js
import { createBucketedCuckooMap } from "./src/cuckoo.js";
import { createByteKeyOps } from "./src/keyops/byteKeyOps.js";

const map = createBucketedCuckooMap({
  bucketCount: 11,
  bucketSize: 2,
  keyOps: createByteKeyOps()
});

const a = new Uint8Array([1, 2, 3]);
const b = new Uint8Array([1, 2, 3]);

map.set(a, "payload");
console.log(map.get(b)); // byte-content equality
```

## Running the demo

```bash
node demo.js
```

## Running tests

```bash
npm test
```

## Notes on semantics

This project deliberately allows different key semantics depending on the chosen
key strategy.

Examples:

- strings/numbers: value semantics
- byte keys: byte-content semantics
- digest keys: depends on the supplied equality rule

This is a feature, not an accident. The map engine stays generic, while the key
strategy defines what “same key” means.
