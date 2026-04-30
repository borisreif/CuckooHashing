import test from "node:test";
import assert from "node:assert/strict";

import { createBucketedCuckooMap } from "../src/cuckoo.js";
import { createResizableMap } from "../src/createResizableMap.js";
import { createStringNumberKeyOps } from "../src/keyops/stringNumberKeyOps.js";

function createSilentLogger() {
    return () => {};
}

function createMapOptions(overrides = {}) {
    return {
        numTables: 2,
        bucketCount: 4,
        bucketSize: 2,
        maxKicks: 20,
        keyOps: createStringNumberKeyOps(),
        debug: false,
        logger: createSilentLogger(),
        ...overrides
    };
}

test("resizable map preserves entries after manual resize", () => {
    const map = createResizableMap({
        createMap: createBucketedCuckooMap,
        mapOptions: createMapOptions({ bucketCount: 4 }),
        growthFactor: 2,
        maxLoadFactor: null
    });

    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);

    const before = map.getConfig().bucketCount;
    map.resize(8);
    const after = map.getConfig().bucketCount;

    assert.equal(before, 4);
    assert.equal(after, 8);

    assert.equal(map.get("a"), 1);
    assert.equal(map.get("b"), 2);
    assert.equal(map.get("c"), 3);
    assert.equal(map.size(), 3);
});

test("resizable map exposes entries()", () => {
    const map = createResizableMap({
        createMap: createBucketedCuckooMap,
        mapOptions: createMapOptions(),
        growthFactor: 2,
        maxLoadFactor: null
    });

    map.set("x", 10);
    map.set("y", 20);

    const entries = map.entries();

    assert.equal(Array.isArray(entries), true);
    assert.equal(entries.length, 2);

    const keys = entries.map((e) => e.key).sort();
    const values = entries.map((e) => e.value).sort((a, b) => a - b);

    assert.deepEqual(keys, ["x", "y"]);
    assert.deepEqual(values, [10, 20]);
});

test("resizable map grows proactively when load factor threshold is reached", () => {
    const map = createResizableMap({
        createMap: createBucketedCuckooMap,
        mapOptions: createMapOptions({ bucketCount: 4, bucketSize: 2 }),
        growthFactor: 2,
        maxLoadFactor: 0.05
    });

    const before = map.getConfig().bucketCount;

    map.set("a", 1);
    map.set("b", 2);

    const after = map.getConfig().bucketCount;

    assert.equal(before, 4);
    assert.ok(after > before);

    assert.equal(map.get("a"), 1);
    assert.equal(map.get("b"), 2);
});

test("resizable map keeps working after reactive growth", () => {
    const badKeyOps = {
        hashBucket(key, which, bucketCount) {
            return 0;
        },
        equals(a, b) {
            return Object.is(a, b);
        },
        formatKey(key) {
            return String(key);
        }
    };

    const map = createResizableMap({
        createMap: createBucketedCuckooMap,
        mapOptions: {
            numTables: 2,
            bucketCount: 2,
            bucketSize: 1,
            maxKicks: 2,
            keyOps: badKeyOps,
            debug: false,
            logger: createSilentLogger()
        },
        growthFactor: 2,
        maxLoadFactor: null
    });

    // Depending on exact collision behavior, some insertion may still fail even
    // after growth, but the wrapper should remain consistent and not corrupt the map.
    const first = map.set("first", 1);
    const second = map.set("second", 2);

    assert.equal(first, true);
    assert.equal(typeof second, "boolean");

    assert.equal(map.get("first"), 1);
});

test("manual resize does not change the number of stored entries", () => {
    const map = createResizableMap({
        createMap: createBucketedCuckooMap,
        mapOptions: createMapOptions({ bucketCount: 4 }),
        growthFactor: 2,
        maxLoadFactor: null
    });

    map.set(1, "one");
    map.set(2, "two");
    map.set(3, "three");

    const sizeBefore = map.size();

    map.resize(16);

    assert.equal(map.size(), sizeBefore);
    assert.equal(map.get(1), "one");
    assert.equal(map.get(2), "two");
    assert.equal(map.get(3), "three");
});

test("clear still works after resize", () => {
    const map = createResizableMap({
        createMap: createBucketedCuckooMap,
        mapOptions: createMapOptions({ bucketCount: 4 }),
        growthFactor: 2,
        maxLoadFactor: null
    });

    map.set("a", 1);
    map.set("b", 2);

    map.resize(8);
    map.clear();

    assert.equal(map.size(), 0);
    assert.equal(map.get("a"), undefined);
    assert.equal(map.get("b"), undefined);
    assert.equal(map.loadFactor(), 0);
});
