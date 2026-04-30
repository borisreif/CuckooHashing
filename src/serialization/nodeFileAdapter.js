import fs from "node:fs";
import { serializeMap, deserializeMap } from "./serializeMap.js";

/**
 * Save a map to a JSON file on disk.
 *
 * @param {string} filePath
 * @param {Object} map
 * @param {Object} [options]
 */
export function saveMapToFile(filePath, map, options = {}) {
    const payload = serializeMap(map, options);
    const json = JSON.stringify(payload, null, 2);
    fs.writeFileSync(filePath, json, "utf8");
}

/**
 * Load a map from a JSON file on disk.
 *
 * @param {string} filePath
 * @param {Object} [options]
 * @returns {Object}
 */
export function loadMapFromFile(filePath, options = {}) {
    const json = fs.readFileSync(filePath, "utf8");
    const payload = JSON.parse(json);
    return deserializeMap(payload, options);
}