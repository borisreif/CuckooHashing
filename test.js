import { createBucketedCuckooMap, DEFAULT_HASH_FUNCTIONS } from "./src/cuckoo.js";

/**
 * Small demo for the bucketed cuckoo map.
 *
 * This file is intentionally separate from `cuckoo.js` so that the
 * implementation module has no demo-side effects when imported elsewhere.
 */
const map = createBucketedCuckooMap({
    numTables: 2,
    bucketCount: 11,
    bucketSize: 2,
    maxKicks: 20,
    debug: true,
    logger: console.log,
    hashFunctions: DEFAULT_HASH_FUNCTIONS,
    tableToHash: [0, 1]
});

map.set(88, "alpha");
map.set(40, "beta");
map.set(20, "gamma");
map.set("hi", "Boris");

console.log(map.get(40));      // "beta"
console.log(map.has(99));      // false
console.log(map.size());       // 4
console.log(map.loadFactor()); // 4 / totalSize

map.print();

map.delete(40);
console.log(map.get(40));      // undefined
console.log(map.locate(20));   // detailed placement info

map.print();