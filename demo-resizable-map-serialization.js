import {
    createBucketedCuckooMap,
    createResizableMap,
    createStringNumberKeyOps,
    saveMapToFile,
    loadMapFromFile
} from "./src/index.js";

const map = createResizableMap({
    createMap: createBucketedCuckooMap,
    mapOptions: {
        numTables: 2,
        bucketCount: 8,
        bucketSize: 2,
        maxKicks: 20,
        keyOps: createStringNumberKeyOps({
            equality: "sameValueZero"
        }),
        debug: false,
        logger: console.log
    },
    growthFactor: 2,
    maxLoadFactor: 0.8
});

map.set("alpha", 1);
map.set("beta", 2);

saveMapToFile("./saved-map.json", map, {
    mapKind: "resizable",
    keyStrategy: {
        type: "stringNumber",
        options: { equality: "sameValueZero" }
    },
    resizePolicy: {
        growthFactor: 2,
        maxLoadFactor: 0.8
    }
});

const restored = loadMapFromFile("./saved-map.json");
console.log(restored.get("alpha")); // 1