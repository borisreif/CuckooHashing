// NOT RECOMMENDED

import { createBucketedCuckooMap } from "./src/cuckoo.js";
import { createDigestKeyOps } from "./src/keyops/digestKeyOps.js";

// Example only: replace this with your real sync digest library.
// It must return Uint8Array.
function fakeBlake3(bytes) {
    // placeholder - use a real library here
    const out = new Uint8Array(32);
    for (let i = 0; i < bytes.length; i++) {
        out[i % 32] ^= bytes[i];
    }
    return out;
}

const encoder = new TextEncoder();

const digestKeyOps = createDigestKeyOps({
    encodeKey: (key) => {
        if (typeof key !== "string") {
            throw new TypeError("This digest strategy demo expects string keys");
        }
        return encoder.encode(key);
    },
    digestBytes: fakeBlake3,
    equals: Object.is,
    formatKey: (key) => JSON.stringify(key)
});

const map = createBucketedCuckooMap({
    bucketCount: 64,
    bucketSize: 2,
    keyOps: digestKeyOps,
    debug: true,
    logger: console.log
});

map.set("hello", "world");
console.log(map.get("hello"));
map.print();