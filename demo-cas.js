import { createBucketedCuckooMap } from "./src/cuckoo.js";
import { createByteKeyOps } from "./src/keyops/byteKeyOps.js";

/**
 * Compute SHA-256 bytes using Web Crypto.
 *
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array>}
 */
async function sha256Bytes(bytes) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return new Uint8Array(digest);
}

const byteMap = createBucketedCuckooMap({
    bucketCount: 64,
    bucketSize: 2,
    keyOps: createByteKeyOps(),
    debug: true,
    logger: console.log
});

const content1 = new TextEncoder().encode("hello world");
const content2 = new TextEncoder().encode("another payload");

const digest1 = await sha256Bytes(content1);
const digest2 = await sha256Bytes(content2);

// Store by digest bytes
byteMap.set(digest1, { name: "blob-1", size: content1.length });
byteMap.set(digest2, { name: "blob-2", size: content2.length });

// Lookup by the same digest bytes
console.log(byteMap.get(digest1));

byteMap.print();