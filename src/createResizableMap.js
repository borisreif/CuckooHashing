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

    function collectEntries() {
        if (typeof map.entries === "function") {
            return map.entries();
        }

        const snap = map.snapshot();
        return snap.flat.filter((slot) => slot !== null);
    }

    function resize(newBucketCount) {
        const entries = collectEntries();

        currentOptions = {
            ...currentOptions,
            bucketCount: newBucketCount
        };

        const nextMap = createMap(currentOptions);

        for (const entry of entries) {
            const ok = nextMap.set(entry.key, entry.value);
            if (!ok) {
                throw new Error("Resize failed during reinsertion");
            }
        }

        map = nextMap;
    }

    function grow() {
        const current = map.getConfig().bucketCount;
        const next = Math.max(current + 1, Math.ceil(current * growthFactor));
        resize(next);
    }

    function maybeResizeProactively() {
        if (maxLoadFactor !== null && map.loadFactor() >= maxLoadFactor) {
            grow();
        }
    }

    return {
        set(key, value) {
            maybeResizeProactively();

            let ok = map.set(key, value);
            if (ok) return true;

            grow();
            return map.set(key, value);
        },

        get(key) { return map.get(key); },
        has(key) { return map.has(key); },
        delete(key) { return map.delete(key); },
        clear() { return map.clear(); },
        size() { return map.size(); },
        loadFactor() { return map.loadFactor(); },
        snapshot() { return map.snapshot(); },
        render() { return map.render(); },
        print() { return map.print(); },
        locate(key) { return map.locate(key); },
        getConfig() { return map.getConfig(); },
        resize(newBucketCount) { resize(newBucketCount); }
    };
}