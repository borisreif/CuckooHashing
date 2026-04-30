# Bucketed Cuckoo Hash Map

A small JavaScript implementation of a **bucketed cuckoo hash map** with a
clear separation between:

- the **generic cuckoo hashing engine**
- the **key hashing / equality strategy**
- the **resize policy wrapper**
- demos and tests

The project is intentionally written as both:

- a reusable small library, and
- a teaching / experimentation codebase.

## References

- Pagh & Rodler, *Cuckoo Hashing* — <https://www.brics.dk/RS/01/32/BRICS-RS-01-32.pdf>
- <https://en.wikipedia.org/wiki/Cuckoo_hashing>
- <https://www.geeksforgeeks.org/dsa/cuckoo-hashing/>
- <https://codecapsule.com/2013/07/20/cuckoo-hashing/>

---

## What bucketed cuckoo hashing is

Plain cuckoo hashing gives every key a small number of candidate locations.
With two logical tables, a key has two legal buckets:

- one bucket in table 0
- one bucket in table 1

A **bucketed** variant stores several slots inside each bucket, which reduces
pressure on the insertion process and often improves practical load factors.

When inserting a key:

1. Compute the candidate bucket in each table.
2. Try to place the entry in the current table's bucket.
3. If there is a free slot, insertion succeeds immediately.
4. If the bucket is full, evict one resident entry.
5. Reinsert the displaced entry into its alternate table.
6. Stop if the kick limit is reached.

That eviction-and-reinsert step is the characteristic “cuckoo” move.

---

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

- `tableSize = bucketCount * bucketSize`
- `totalSize = numTables * tableSize`

The helper functions `bucketStart(...)` and `index(...)` convert from logical
coordinates to a flat index.

---

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

These modules decide how keys are:

- hashed into bucket indices
- compared for equality
- formatted for debug output

Current strategies:

- `stringNumberKeyOps.js`
- `byteKeyOps.js`
- `digestKeyOps.js`

### 3. Resize policy wrapper

File: `src/createResizableMap.js`

This wrapper is intentionally **generic** and not cuckoo-specific.
It can wrap any compatible map engine.

It is responsible for policies like:

- grow on insertion failure
- optional proactive growth at a load-factor threshold

### 4. Demos and tests

- demos: `demo*.js`
- tests: `test/`

These are intentionally kept separate from the engine code.

---

## Why there is both `snapshot()` and `entries()`

These two methods answer different questions.

### `snapshot()`

Use this when you want to inspect the physical structure of the table:

- which table
- which bucket
- which slot
- which entries are where

Example mental model:

```text
snapshot()  ->  "show me the whole table layout"
```

### `entries()`

Use this when you only care about the live key-value pairs.

Example mental model:

```text
entries()   ->  "give me all stored pairs"
```

This is especially useful for:

- resizing
- rehashing
- iteration
- exporting the contents

Example:

```js
[
  { key: "name", value: "Boris" },
  { key: 42, value: "answer" }
]
```

---

## How resizing works

The current resize wrapper uses a simple and clean policy.

1. Keep one current map instance.
2. When growth is needed, collect all live entries.
3. Build a new map with a larger `bucketCount`.
4. Reinsert all entries into the new map.
5. Swap the reference.
6. Discard the old map.

ASCII sketch:

```text
before resize:
  current map  --->  [ engine A ]

collect live entries:
  [ {key, value}, {key, value}, ... ]

build larger map:
  next map     --->  [ engine B ]

reinsert entries into engine B

swap:
  current map  --->  [ engine B ]
```

This means the resize logic is not tied specifically to cuckoo hashing. It is a
policy layer on top of a map-like engine.

---

## Equality semantics for `stringNumberKeyOps`

The number/string key strategy supports two equality modes.

### Default: `sameValueZero`

This matches the behavior of JavaScript `Map` more closely.

```text
sameValueZero:
  NaN   == NaN   -> true
  0     == -0    -> true
```

This is the default because it is usually the least surprising behavior for a
map.

```js
const keyOps = createStringNumberKeyOps();
// same as:
// createStringNumberKeyOps({ equality: "sameValueZero" })
```

### Optional: `objectIs`

This uses `Object.is` semantics.

```text
Object.is:
  NaN   == NaN   -> true
  0     == -0    -> false
```

Use this mode if you explicitly want to distinguish `0` from `-0`.

```js
const keyOps = createStringNumberKeyOps({
  equality: "objectIs"
});
```

### Summary

```text
Mode            NaN equals NaN   0 equals -0   Typical use
--------------  ---------------  ------------  -----------------------------
sameValueZero   yes              yes           Map-like behavior (default)
objectIs        yes              no            stricter numeric distinction
```

---

## Resize, rehash, and stash: current policy and future directions

The current project already supports **resizing**, and the design leaves room
for **rehash** and **stash** strategies later.

### Current policy: rebuild into a larger map

The current wrapper `createResizableMap(...)` uses the simplest reliable
strategy:

1. collect all live entries from the current map
2. create a new map with a larger `bucketCount`
3. reinsert every entry into the new map
4. swap the old map for the new one

ASCII sketch:

```text
old map
  |
  v
+------------------+
| bucketCount =  8 |
| entries: A B C D |
+------------------+

collect entries: [A, B, C, D]

build new map
  |
  v
+------------------+
| bucketCount = 16 |
| entries: - - - - |
+------------------+

reinsert A, B, C, D

swap references
```

This is simple, explicit, and easy to test.

### Why resize lives in a wrapper

The cuckoo engine itself is responsible for:

- placement
- eviction
- lookup
- deletion
- rendering / snapshotting

The resize wrapper is responsible for policy:

- when to grow
- by how much to grow
- whether to grow on failure
- whether to grow proactively by load factor

That keeps the engine cleaner and makes the policy reusable.

### Current practical policies

Right now the code supports two styles of resizing:

```text
grow on failure:
  try insert -> if it fails -> build a larger map -> retry

proactive growth:
  if loadFactor() >= threshold -> grow before the next insert
```

### Future possibility: rehash with new seeds

A rehash is slightly different from a resize.

```text
resize:
  change bucketCount
  rebuild the table

rehash:
  keep bucketCount the same
  change the hash family / seeds
  rebuild the table
```

Rehashing can help if the current table geometry is large enough but the hash
choices happen to create an unlucky cycle.

### Future possibility: stash

A stash is a tiny overflow area for entries that could not be placed into their
legal cuckoo buckets.

```text
normal table     + optional stash

[ bucketed cuckoo engine ]   [ e1 e2 ... ]
```

This can reduce the number of full rebuilds, but it makes the logic more
complex because lookups and deletes must check both:

- the main cuckoo table
- the stash

That is why the current project keeps the simpler resize-first policy and leaves
stash as a future extension.

---

## Project layout

```text
src/
  cuckoo.js                 generic bucketed cuckoo engine
  createResizableMap.js     generic resize wrapper
  index.js                  public package entrypoint
  keyops/
    stringNumberKeyOps.js   number/string strategy
    byteKeyOps.js           byte-content strategy
    digestKeyOps.js         digest-backed strategy
  utils/
    hash32.js               shared 32-bit hashing helpers

demo-cuckoo.js              plain cuckoo engine demo
demo.js                     resizable wrapper demo
demo-bytes.js               byte-key demo
demo-cas.js                 content-addressable / digest demo
demo-sync.js                sync digest demo

test/
  cuckoo.test.js            engine tests
  resizableMap.test.js      resize-wrapper tests
```

---

## Installation / usage

### Run tests

```bash
npm test
```

### Run a demo in Node

```bash
node demo.js
```

### Browser demo

Use a small local server and open `index.html`.
For example:

```bash
python -m http.server
```

---

## Example: plain cuckoo map

```js
import {
  createBucketedCuckooMap,
  createStringNumberKeyOps
} from "./src/index.js";

const map = createBucketedCuckooMap({
  numTables: 2,
  bucketCount: 11,
  bucketSize: 2,
  maxKicks: 20,
  keyOps: createStringNumberKeyOps()
});

map.set(88, "alpha");
map.set("hi", "Boris");

console.log(map.get(88));
console.log(map.get("hi"));
map.print();
```

## Example: resizable wrapper

```js
import {
  createBucketedCuckooMap,
  createResizableMap,
  createStringNumberKeyOps
} from "./src/index.js";

const map = createResizableMap({
  createMap: createBucketedCuckooMap,
  mapOptions: {
    numTables: 2,
    bucketCount: 4,
    bucketSize: 2,
    maxKicks: 20,
    keyOps: createStringNumberKeyOps()
  },
  growthFactor: 2,
  maxLoadFactor: 0.8
});

map.set("a", 1);
map.set("b", 2);
map.set("c", 3);

console.log(map.entries());
map.print();
```

---

## Current status / next steps

Current strengths:

- generic cuckoo engine
- pluggable key strategies
- generic resize wrapper
- working demos
- automated tests

Natural next steps:

- improve resize policy tuning
- add rehash-with-new-seeds policy
- consider a stash later
- add iterators (`keys()`, `values()`, `entries()` as standard JS iterables)
- expand README/examples