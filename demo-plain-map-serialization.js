import {
    createBucketedCuckooMap,
    createStringNumberKeyOps,
    serializeMap,
    deserializeMap
} from "./src/index.js";

const map = createBucketedCuckooMap({
    numTables: 2,
    bucketCount: 11,
    bucketSize: 2,
    maxKicks: 20,
    keyOps: createStringNumberKeyOps({
        equality: "sameValueZero"
    }),
    debug: false,
    logger: console.log
});

map.set("name", "Boris");
map.set(42, "answer");

const data = serializeMap(map, {
    mapKind: "plain",
    keyStrategy: {
        type: "stringNumber",
        options: { equality: "sameValueZero" }
    }
});

console.log(data);

const restored = deserializeMap(data);
console.log(restored.get("name")); // "Boris"
console.log(restored.get(42));     // "answer"