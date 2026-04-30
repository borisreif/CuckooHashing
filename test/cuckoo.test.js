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

test("locate returns details for existing keys and false for missing keys", () => {
    const map = createBucketedCuckooMap({
        bucketCount: 17,
        bucketSize: 2,
        keyOps: createStringNumberKeyOps(),
        logger: createSilentLogger()
    });

    map.set("alpha", 1);

    const found = map.locate("alpha");
    const missing = map.locate("missing");

    assert.equal(found.found, true);
    assert.equal(typeof found.tableIdx, "number");
    assert.equal(typeof found.bucketIdx, "number");
    assert.equal(typeof found.slotIdx, "number");
    assert.equal(typeof found.flatIndex, "number");
    assert.deepEqual(found.entry, { key: "alpha", value: 1 });

    assert.deepEqual(missing, { found: false });
});

test("snapshot count and flat occupancy match size", () => {
    const map = createBucketedCuckooMap({
        bucketCount: 17,
        bucketSize: 2,
        keyOps: createStringNumberKeyOps(),
        logger: createSilentLogger()
    });

    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);

    const snap = map.snapshot();
    const nonNullFlat = snap.flat.filter((slot) => slot !== null);

    assert.equal(snap.count, map.size());
    assert.equal(nonNullFlat.length, map.size());
    assert.equal(snap.flat.length, map.getConfig().totalSize);

    const entries = map.entries();
    const entryKeys = entries.map((e) => e.key).sort();
    const flatKeys = nonNullFlat.map((e) => e.key).sort();

    assert.deepEqual(entryKeys, flatKeys);
});

test("entries reflects updates, deletes, and clear", () => {
    const map = createBucketedCuckooMap({
        bucketCount: 17,
        bucketSize: 2,
        keyOps: createStringNumberKeyOps(),
        logger: createSilentLogger()
    });

    map.set("x", 10);
    map.set("y", 20);
    map.set("x", 99); // update existing key

    let entries = map.entries();
    assert.equal(entries.length, 2);

    const xEntry = entries.find((e) => e.key === "x");
    const yEntry = entries.find((e) => e.key === "y");

    assert.deepEqual(xEntry, { key: "x", value: 99 });
    assert.deepEqual(yEntry, { key: "y", value: 20 });

    map.delete("y");

    entries = map.entries();
    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0], { key: "x", value: 99 });

    map.clear();

    entries = map.entries();
    assert.deepEqual(entries, []);
    assert.equal(map.size(), 0);
});

test("render returns a string and print uses the configured logger", () => {
    const calls = [];
    const logger = (...args) => calls.push(args.join(" "));

    const map = createBucketedCuckooMap({
        bucketCount: 8,
        bucketSize: 2,
        keyOps: createStringNumberKeyOps(),
        logger
    });

    map.set("hello", "world");

    const rendered = map.render();

    assert.equal(typeof rendered, "string");
    assert.ok(rendered.includes("Bucketed cuckoo map"));
    assert.ok(rendered.includes("Size:"));
    assert.ok(rendered.includes("hello"));

    map.print();

    assert.ok(calls.length > 0);
    assert.ok(calls.some((msg) => msg.includes("Bucketed cuckoo map")));
});