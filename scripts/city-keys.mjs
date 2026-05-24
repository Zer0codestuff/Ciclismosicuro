const TYPOGRAPHIC_APOSTROPHE = "\u2019";

/**
 * Stable lookup key for Italian city names across Lab24, manual enrichment, and UI.
 * Normalizes typographic vs straight apostrophes and collapses whitespace.
 */
export function canonicalCityKey(name) {
  return name
    .trim()
    .replace(new RegExp(TYPOGRAPHIC_APOSTROPHE, "g"), "'")
    .replace(/\s+/g, " ");
}

/** @param {Iterable<{ city: string } | string>} cities */
export function indexCitiesByCanonicalKey(cities) {
  const map = new Map();
  for (const entry of cities) {
    const displayName = typeof entry === "string" ? entry : entry.city;
    const key = canonicalCityKey(displayName);
    if (map.has(key)) {
      throw new Error(`Duplicate canonical city key "${key}" for "${displayName}"`);
    }
    map.set(key, typeof entry === "string" ? { city: entry } : entry);
  }
  return map;
}

/**
 * @param {Record<string, unknown>} manual
 * @param {Iterable<string>} cityNames
 * @returns {string[]}
 */
export function validateManualEnrichmentKeys(manual, cityNames) {
  const failures = [];
  const cityKeys = new Set([...cityNames].map(canonicalCityKey));
  const seenManual = new Set();

  for (const key of Object.keys(manual)) {
    const canonical = canonicalCityKey(key);
    if (seenManual.has(canonical)) {
      failures.push(`Duplicate canonical manual enrichment key: ${canonical}`);
      continue;
    }
    seenManual.add(canonical);
    if (!cityKeys.has(canonical)) {
      failures.push(`Orphan manual enrichment key not in city set: ${key}`);
    }
  }

  return failures;
}
