import test from "node:test";
import assert from "node:assert/strict";

import { createBucketedCuckooMap } from "../src/cuckoo.js";
import { createStringNumberKeyOps } from "../src/keyops/stringNumberKeyOps.js";
import { createByteKeyOps } from "../src/keyops/byteKeyOps.js";
import { createDigestKeyOps } from "../src/keyops/digestKeyOps.js";

function createSilentLogger() {
    return () => {};
}

test("string/number key map supports set/get/has/delete", () => {
    const map = createBucketedCuckooMap({
        bucketCount: 17,
        bucketSize: 2,
        keyOps: createStringNumberKeyOps(),
        logger: createSilentLogger()
    });

    assert.equal(map.set(88, "alpha"), true);
    assert.equal(map.set("hi", "Boris"), true);

    assert.equal(map.get(88), "alpha");
    assert.equal(map.get("hi"), "Boris");
    assert.equal(map.has("hi"), true);
    assert.equal(map.has("missing"), false);

    assert.equal(map.delete("hi"), true);
    assert.equal(map.get("hi"), undefined);
    assert.equal(map.has("hi"), false);
    assert.equal(map.delete("hi"), false);
});

test("setting an existing key updates the value without increasing size", () => {
    const map = createBucketedCuckooMap({
        bucketCount: 17,
        bucketSize: 2,
        keyOps: createStringNumberKeyOps(),
        logger: createSilentLogger()
    });

    map.set("k", 1);
    const sizeBefore = map.size();
    map.set("k", 2);

    assert.equal(sizeBefore, 1);
    assert.equal(map.size(), 1);
    assert.equal(map.get("k"), 2);
});

test("clear removes all entries and resets size/load factor", () => {
    const map = createBucketedCuckooMap({
        bucketCount: 8,
        bucketSize: 2,
        keyOps: createStringNumberKeyOps(),
        logger: createSilentLogger()
    });

    map.set(1, "a");
    map.set(2, "b");
    assert.equal(map.size(), 2);
    assert.ok(map.loadFactor() > 0);

    map.clear();

    assert.equal(map.size(), 0);
    assert.equal(map.loadFactor(), 0);
    assert.equal(map.get(1), undefined);
    assert.equal(map.get(2), undefined);
});

test("byte key map compares keys by byte content", () => {
    const map = createBucketedCuckooMap({
        bucketCount: 17,
        bucketSize: 2,
        keyOps: createByteKeyOps(),
        logger: createSilentLogger()
    });

    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3]);
    const c = new Uint8Array([9, 9, 9]);

    map.set(a, "payload-a");

    assert.equal(map.get(b), "payload-a");
    assert.equal(map.get(c), undefined);
    assert.equal(map.has(b), true);
    assert.equal(map.delete(b), true);
    assert.equal(map.has(a), false);
});

test("insertion failure rolls back to the previous table state", () => {
    const badKeyOps = {
        hashBucket() {
            return 0;
        },
        equals(a, b) {
            return Object.is(a, b);
        },
        formatKey(key) {
            return String(key);
        }
    };

    const map = createBucketedCuckooMap({
        numTables: 1,
        bucketCount: 1,
        bucketSize: 1,
        maxKicks: 1,
        keyOps: badKeyOps,
        logger: createSilentLogger()
    });

    assert.equal(map.set("first", 1), true);
    assert.equal(map.set("second", 2), false);

    assert.equal(map.size(), 1);
    assert.equal(map.get("first"), 1);
    assert.equal(map.get("second"), undefined);
});

test("digest key strategy can be plugged into the generic map", () => {
    const encoder = new TextEncoder();

    const fakeDigest = (bytes) => {
        const out = new Uint8Array(8);
        for (let i = 0; i < bytes.length; i++) {
            out[i % 8] ^= bytes[i];
        }
        return out;
    };

    const digestKeyOps = createDigestKeyOps({
        encodeKey: (key) => encoder.encode(String(key)),
        digestBytes: fakeDigest,
        equals: Object.is,
        formatKey: (key) => JSON.stringify(key)
    });

    const map = createBucketedCuckooMap({
        bucketCount: 17,
        bucketSize: 2,
        keyOps: digestKeyOps,
        logger: createSilentLogger()
    });

    map.set("hello", "world");
    assert.equal(map.get("hello"), "world");
    assert.equal(map.has("hello"), true);
});
