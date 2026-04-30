/**
 * Generic resizing wrapper for map-like engines.
 *
 * -----------------------------------------------------------------------------
 * Why this wrapper exists
 * -----------------------------------------------------------------------------
 *
 * The underlying map engine is responsible for storing, looking up, deleting,
 * and rendering entries. It is intentionally *not* responsible for deciding when
 * a larger table should be built.
 *
 * This wrapper adds a resize policy on top of any compatible engine.
 *
 * Compatible engine interface:
 *
 *   set(key, value)
 *   get(key)
 *   has(key)
 *   delete(key)
 *   clear()
 *   size()
 *   loadFactor()
 *   snapshot() or entries()
 *   getConfig()
 *
 * -----------------------------------------------------------------------------
 * How resizing works
 * -----------------------------------------------------------------------------
 *
 * The wrapper keeps exactly one current map instance.
 *
 *   before resize:
 *     current map  --->  [ engine A ]
 *
 *   collect live entries:
 *     [ {key, value}, {key, value}, ... ]
 *
 *   build larger map:
 *     next map     --->  [ engine B ]
 *
 *   reinsert all entries into the new engine
 *
 *   swap:
 *     current map  --->  [ engine B ]
 *
 * The old engine is then discarded.
 *
 * This means the wrapper is not cuckoo-specific. Any map engine with the right
 * API could in principle be used underneath.
 *
 * -----------------------------------------------------------------------------
 * Supported policies in this version
 * -----------------------------------------------------------------------------
 *
 * 1. Reactive grow-on-failure
 *    - try insertion
 *    - if insertion fails, grow and retry
 *
 * 2. Optional proactive threshold growth
 *    - if maxLoadFactor is set and reached before insertion, grow first
 */

/**
 * Create a generic resizing wrapper around a map engine.
 *
 * @param {Object} options
 * @param {Function} options.createMap - Factory for the underlying map engine.
 * @param {Object} options.mapOptions - Options passed to createMap.
 * @param {number} [options.growthFactor=2] - Multiplicative bucket growth.
 * @param {number|null} [options.maxLoadFactor=null] - Optional proactive growth threshold.
 * @returns {Object} Public map API with resize support.
 */
export function createResizableMap({
  createMap,
  mapOptions,
  growthFactor = 2,
  maxLoadFactor = null,
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
      bucketCount: newBucketCount,
    };

    const nextMap = createMap(currentOptions);

    for (const entry of oldEntries) {
      const ok = nextMap.set(entry.key, entry.value);

      if (!ok) {
        throw new Error(
          `Resize failed while reinserting key ${String(entry.key)}`,
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
    /**
     * Insert or update a key/value pair.
     *
     * Policy:
     *   1. optionally grow before insertion if threshold growth is enabled
     *   2. try insertion in the current engine
     *   3. if insertion fails, grow and retry once
     *
     * @param {*} key
     * @param {*} value
     * @returns {boolean}
     */
    set(key, value) {
      maybeResizeProactively();

      let ok = map.set(key, value);
      if (ok) {
        return true;
      }

      // Reactive grow-on-failure.
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

    /**
     * Return the current live entries.
     *
     * @returns {{key:any,value:any}[]}
     */
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

    /**
     * Force a manual resize to a specific bucket count.
     *
     * @param {number} newBucketCount
     */
    resize(newBucketCount) {
      resize(newBucketCount);
    },
  };
}
