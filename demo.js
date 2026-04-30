import { createBucketedCuckooMap } from "./src/cuckoo.js";
import { createResizableMap } from "./src/createResizableMap.js";
import { createStringNumberKeyOps } from "./src/keyops/stringNumberKeyOps.js";

/**
 * Demo: resizable bucketed cuckoo map with number/string keys.
 */
const map = createResizableMap({
    createMap: createBucketedCuckooMap,
    mapOptions: {
        numTables: 2,
        bucketCount: 4,
        bucketSize: 2,
        maxKicks: 20,
        keyOps: createStringNumberKeyOps(),
        debug: true,
        logger: console.log
    },
    growthFactor: 2,
    maxLoadFactor: 0.8
});

map.set(88, "alpha");
map.set(40, "beta");
map.set("hi", "Boris");
map.set(20, "gamma");
map.set(50, "delta");
map.set(53, "epsilon");

console.log("get(40):", map.get(40));
console.log('get("hi"):', map.get("hi"));
console.log("has(99):", map.has(99));
console.log("size():", map.size());
console.log("loadFactor():", map.loadFactor());
console.log("config:", map.getConfig());

map.print();

map.delete(40);
console.log("after delete(40):", map.get(40));

map.print();