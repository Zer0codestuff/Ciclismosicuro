import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Contract shared by build-data.mjs and remerge-manual.mjs */
function round(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

describe("pipeline round null semantics", () => {
  it("returns null for null, undefined, and NaN", () => {
    expect(round(null)).toBeNull();
    expect(round(undefined)).toBeNull();
    expect(round(Number.NaN)).toBeNull();
  });

  it("does not coerce null to zero", () => {
    expect(round(null)).not.toBe(0);
  });

  it("rounds finite numbers", () => {
    expect(round(3.14159, 2)).toBe(3.14);
  });
});

describe("published ranking sparse metrics", () => {
  it("keeps normalizedMetrics null when rawMetrics is null (e.g. Cosenza FIAB)", async () => {
    const rankingPath = path.join(process.cwd(), "public/data/ranking.json");
    const ranking = JSON.parse(await readFile(rankingPath, "utf8"));
    const cosenza = ranking.cities.find((city) => city.city === "Cosenza");
    expect(cosenza).toBeDefined();
    expect(cosenza.rawMetrics.fiabBikeSmile).toBeNull();
    expect(cosenza.normalizedMetrics.fiabBikeSmile).toBeNull();
  });

  it("preserves null normalized values for all metrics with null raw values", async () => {
    const rankingPath = path.join(process.cwd(), "public/data/ranking.json");
    const ranking = JSON.parse(await readFile(rankingPath, "utf8"));
    const metricIds = ranking.metricDefinitions.map((metric) => metric.id);

    for (const city of ranking.cities) {
      for (const metricId of metricIds) {
        if (city.rawMetrics[metricId] == null) {
          expect(
            city.normalizedMetrics[metricId],
            `${city.city}.${metricId}`
          ).toBeNull();
        }
      }
    }
  });
});
