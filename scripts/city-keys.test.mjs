import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalCityKey,
  indexCitiesByCanonicalKey,
  validateManualEnrichmentKeys
} from "./city-keys.mjs";

describe("canonicalCityKey", () => {
  it("treats straight and typographic apostrophes as the same city", () => {
    expect(canonicalCityKey("L'Aquila")).toBe(canonicalCityKey("L\u2019Aquila"));
  });

  it("trims and collapses whitespace", () => {
    expect(canonicalCityKey("  Reggio   Emilia  ")).toBe("Reggio Emilia");
  });
});

describe("validateManualEnrichmentKeys", () => {
  const cityNames = ["Milano", "L\u2019Aquila", "Bologna"];

  it("accepts manual keys that canonicalize to dataset names", () => {
    const failures = validateManualEnrichmentKeys(
      { "L'Aquila": { fiabBikeSmile: 2 } },
      cityNames
    );
    expect(failures).toEqual([]);
  });

  it("flags orphan manual keys", () => {
    const failures = validateManualEnrichmentKeys(
      { "Citta Inesistente": { fiabBikeSmile: 1 } },
      cityNames
    );
    expect(failures.some((message) => message.includes("Orphan"))).toBe(true);
  });

  it("flags duplicate canonical manual keys", () => {
    const failures = validateManualEnrichmentKeys(
      {
        "L'Aquila": { fiabBikeSmile: 2 },
        "L\u2019Aquila": { fiabBikeSmile: 3 }
      },
      cityNames
    );
    expect(failures.some((message) => message.includes("Duplicate canonical"))).toBe(true);
  });
});

describe("indexCitiesByCanonicalKey", () => {
  it("throws on duplicate canonical names", () => {
    expect(() =>
      indexCitiesByCanonicalKey([{ city: "L'Aquila" }, { city: "L\u2019Aquila" }])
    ).toThrow(/Duplicate canonical/);
  });
});

describe("ranking manual merge regression", () => {
  it("merges L'Aquila FIAB enrichment despite apostrophe variant in dataset label", async () => {
    const ranking = JSON.parse(
      await readFile(path.join(process.cwd(), "public/data/ranking.json"), "utf8")
    );
    const aquila = ranking.cities.find(
      (city) => canonicalCityKey(city.city) === canonicalCityKey("L'Aquila")
    );
    expect(aquila?.rawMetrics.fiabBikeSmile).toBe(2);
    expect(aquila?.manualSources).toContain("fiab-2024");
  });
});
