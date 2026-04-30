/**
 * Generic resizing wrapper for map-like engines.
 *
 * The wrapped engine is expected to provide:
 * - set(key, value)
 * - get(key)
 * - has(key)
 * - delete(key)
 * - clear()
 * - size()
 * - loadFactor()
 * - snapshot() or entries()
 * - getConfig()
 */
export function createResizableMap({
    createMap,
    mapOptions,
    growthFactor = 2,
    maxLoadFactor = null
}) {
    if (typeof createMap !== "function") {
        throw new Error("createMap must be a function");
    }

    let currentOptions = { ...mapOptions };
    let map = createMap(currentOptions);

    /**
     * Collect all live entries from the current engine.
     *
     * Prefer a dedicated entries() method if available.
     * Fall back to snapshot().flat otherwise.
     *
     * @returns {{key:any,value:any}[]}
     */
    function collectEntries() {
        if (typeof map.entries === "function") {
            return map.entries();
        }

        const snap = map.snapshot();
        return snap.flat.filter((slot) => slot !== null);
    }

    /**
     * Build a new map with a different bucket count and reinsert all entries.
     *
     * @param {number} newBucketCount
     */
    function resize(newBucketCount) {
        const oldEntries = collectEntries();

        currentOptions = {
            ...currentOptions,
            bucketCount: newBucketCount
        };

        const nextMap = createMap(currentOptions);

        for (const entry of oldEntries) {
            const ok = nextMap.set(entry.key, entry.value);

            if (!ok) {
                throw new Error(
                    `Resize failed while reinserting key ${String(entry.key)}`
                );
            }
        }

        map = nextMap;
    }

    /**
     * Grow the table according to the configured growth factor.
     */
    function grow() {
        const current = map.getConfig().bucketCount;
        const next = Math.max(current + 1, Math.ceil(current * growthFactor));
        resize(next);
    }

    /**
     * Resize before insertion if proactive threshold growth is enabled.
     */
    function maybeResizeProactively() {
        if (maxLoadFactor !== null && map.loadFactor() >= maxLoadFactor) {
            grow();
        }
    }

    return {
        set(key, value) {
            maybeResizeProactively();

            let ok = map.set(key, value);
            if (ok) {
                return true;
            }

            // Reactive grow-on-failure
            grow();

            ok = map.set(key, value);
            return ok;
        },

        get(key) {
            return map.get(key);
        },

        has(key) {
            return map.has(key);
        },

        delete(key) {
            return map.delete(key);
        },

        clear() {
            return map.clear();
        },

        size() {
            return map.size();
        },

        loadFactor() {
            return map.loadFactor();
        },

        snapshot() {
            return map.snapshot();
        },

        entries() {
            return collectEntries();
        },

        render() {
            return map.render();
        },

        print() {
            return map.print();
        },

        locate(key) {
            return map.locate(key);
        },

        getConfig() {
            return map.getConfig();
        },

        resize(newBucketCount) {
            resize(newBucketCount);
        }
    };
}