import { createBucketedCuckooMap } from "../cuckoo.js";
import { createResizableMap } from "../createResizableMap.js";
import { createStringNumberKeyOps } from "../keyops/stringNumberKeyOps.js";

/**
 * Version number for serialized map payloads.
 *
 * Increment this if you later change the on-disk / stored format.
 */
const SERIALIZATION_VERSION = 1;

/**
 * Serialize a map into a plain JSON-safe object.
 *
 * This first version supports:
 * - stringNumberKeyOps only
 * - JSON-serializable values only
 *
 * The serializer does not store functions. Instead, it stores enough metadata
 * to recreate built-in key strategies later.
 *
 * @param {Object} map - map instance created by createBucketedCuckooMap(...) or createResizableMap(...)
 * @param {Object} options
 * @param {"plain"|"resizable"} [options.mapKind="plain"]
 * @param {Object} [options.keyStrategy]
 * @param {"stringNumber"} [options.keyStrategy.type="stringNumber"]
 * @param {Object} [options.keyStrategy.options={}]
 * @param {"sameValueZero"|"objectIs"} [options.keyStrategy.options.equality="sameValueZero"]
 * @param {Object|null} [options.resizePolicy=null]
 * @returns {Object}
 */
export function serializeMap(
    map,
    {
        mapKind = "plain",
        keyStrategy = {
            type: "stringNumber",
            options: { equality: "sameValueZero" }
        },
        resizePolicy = null
    } = {}
) {
    if (!map || typeof map !== "object") {
        throw new TypeError("serializeMap: map must be an object");
    }

    if (typeof map.getConfig !== "function") {
        throw new TypeError("serializeMap: map.getConfig() is required");
    }

    if (typeof map.entries !== "function") {
        throw new TypeError("serializeMap: map.entries() is required");
    }

    if (keyStrategy.type !== "stringNumber") {
        throw new Error(
            `serializeMap: unsupported key strategy type "${String(keyStrategy.type)}"`
        );
    }

    const config = map.getConfig();
    const entries = map.entries();

    return {
        version: SERIALIZATION_VERSION,
        type: "BucketedCuckooMap",
        mapKind,
        keyStrategy,
        resizePolicy,
        config: {
            numTables: config.numTables,
            bucketCount: config.bucketCount,
            bucketSize: config.bucketSize,
            maxKicks: config.maxKicks
        },
        entries: entries.map((entry) => ({
            key: entry.key,
            value: entry.value
        }))
    };
}

/**
 * Deserialize a plain JSON-safe object back into a map instance.
 *
 * This first version supports:
 * - stringNumberKeyOps only
 * - JSON-serializable values only
 *
 * @param {Object} data
 * @param {Object} [options]
 * @param {boolean} [options.debug=false]
 * @param {Function} [options.logger=console.log]
 * @returns {Object}
 */
export function deserializeMap(
    data,
    {
        debug = false,
        logger = console.log
    } = {}
) {
    validateSerializedMap(data);

    const keyOps = buildKeyOps(data.keyStrategy);
    const baseMapOptions = {
        ...data.config,
        keyOps,
        debug,
        logger
    };

    let map;

    if (data.mapKind === "resizable") {
        map = createResizableMap({
            createMap: createBucketedCuckooMap,
            mapOptions: baseMapOptions,
            growthFactor: data.resizePolicy?.growthFactor ?? 2,
            maxLoadFactor: data.resizePolicy?.maxLoadFactor ?? null
        });
    } else {
        map = createBucketedCuckooMap(baseMapOptions);
    }

    for (const entry of data.entries) {
        const ok = map.set(entry.key, entry.value);

        if (!ok) {
            throw new Error(
                `deserializeMap: failed to insert key ${JSON.stringify(entry.key)}`
            );
        }
    }

    return map;
}

/**
 * Validate the serialized map payload at a basic structural level.
 *
 * @param {Object} data
 */
export function validateSerializedMap(data) {
    if (!data || typeof data !== "object") {
        throw new TypeError("Serialized map must be an object");
    }

    if (data.version !== SERIALIZATION_VERSION) {
        throw new Error(
            `Unsupported serialized map version: ${String(data.version)}`
        );
    }

    if (data.type !== "BucketedCuckooMap") {
        throw new Error(
            `Unsupported serialized type: ${String(data.type)}`
        );
    }

    if (data.mapKind !== "plain" && data.mapKind !== "resizable") {
        throw new Error(
            `Unsupported mapKind: ${String(data.mapKind)}`
        );
    }

    if (!data.config || typeof data.config !== "object") {
        throw new Error("Serialized map is missing config");
    }

    if (!Array.isArray(data.entries)) {
        throw new Error("Serialized map is missing entries array");
    }

    if (!data.keyStrategy || typeof data.keyStrategy !== "object") {
        throw new Error("Serialized map is missing keyStrategy");
    }
}

/**
 * Build a supported key strategy from serialized metadata.
 *
 * @param {Object} keyStrategy
 * @returns {Object}
 */
function buildKeyOps(keyStrategy) {
    switch (keyStrategy.type) {
        case "stringNumber":
            return createStringNumberKeyOps(keyStrategy.options ?? {});

        default:
            throw new Error(
                `Unsupported key strategy type: ${String(keyStrategy.type)}`
            );
    }
}