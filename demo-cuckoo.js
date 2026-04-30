import { createBucketedCuckooMap } from "./src/cuckoo.js";
import { createStringNumberKeyOps } from "./src/keyops/stringNumberKeyOps.js";
import { createByteKeyOps } from "./src/keyops/byteKeyOps.js";

/**
 * Demo 1: numbers and strings.
 */
const textMap = createBucketedCuckooMap({
    numTables: 2,
    bucketCount: 11,
    bucketSize: 2,
    maxKicks: 20,
    keyOps: createStringNumberKeyOps(),
    debug: true,
    logger: console.log
});

textMap.set(88, "alpha");
textMap.set(40, "beta");
textMap.set("hi", "Boris");

console.log(textMap.get(40));   // "beta"
console.log(textMap.get("hi")); // "Boris"
console.log(textMap.has(99));   // false
textMap.print();

/**
 * Demo 2: binary keys.
 */
const byteMap = createBucketedCuckooMap({
    numTables: 2,
    bucketCount: 11,
    bucketSize: 2,
    maxKicks: 20,
    keyOps: createByteKeyOps(),
    debug: true,
    logger: console.log
});

const a = new Uint8Array([1, 2, 3]);
const b = new Uint8Array([1, 2, 3]);
const c = new Uint8Array([9, 9, 9]);

byteMap.set(a, "payload-a");
console.log(byteMap.get(b)); // "payload-a" because byte keys compare by content
console.log(byteMap.get(c)); // undefined
byteMap.print();
