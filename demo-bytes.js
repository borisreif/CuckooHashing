import { createBucketedCuckooMap } from "./src/cuckoo.js";
import { createResizableMap } from "./src/createResizableMap.js";
import { createByteKeyOps } from "./src/keyops/byteKeyOps.js";

const map = createResizableMap({
    createMap: createBucketedCuckooMap,
    mapOptions: {
        numTables: 2,
        bucketCount: 4,
        bucketSize: 2,
        maxKicks: 20,
        keyOps: createByteKeyOps(),
        debug: true,
        logger: console.log
    },
    growthFactor: 2,
    maxLoadFactor: 0.8
});

const a = new Uint8Array([1, 2, 3]);
const b = new Uint8Array([1, 2, 3]);

map.set(a, "payload");
console.log(map.get(b)); // should work because byte keys compare by content
map.print();