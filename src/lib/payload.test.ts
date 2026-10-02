import { describe, expect, it } from "vitest";
import published from "../../public/data/ranking.json";
import { parseRankingPayload } from "./payload";

function invalidAt(path: (string | number)[], value: unknown) {
  const payload = structuredClone(published) as unknown as Record<string, unknown>;
  let parent = payload;
  for (const key of path.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
  parent[path.at(-1)!] = value;
  return payload;
}

describe("public dataset contract", () => {
  it("accepts the published schema and preserves nulls and observed zero", () => {
    const parsed = parseRankingPayload(published);
    expect(parsed.cityCount).toBe(parsed.cities.length);
    expect(parsed.cities.some((city) => Object.values(city.metrics).includes(null))).toBe(true);
    expect(parsed.cities.some((city) => Object.values(city.metrics).includes(0))).toBe(true);
    expect(parsed.cities.some((city) => city.metrics.zone30 === false)).toBe(true);
  });

  it.each([
    [["schemaVersion"], 1],
    [["cities"], []],
    [["cities", 0], null],
    [["cityCount"], 0],
    [["generatedAt"], "not a date"],
    [["pillars", 0, "id"], "unknown"],
    [["defaultWeights", "safety"], NaN],
    [["sources"], null],
    [["sources", 0, "url"], "javascript:alert(1)"],
    [["metrics", 0, "sourceIds"], ["unknown-source"]],
    [["model", "sensitivity", "interval"], [0.95, 0.05]],
    [["findings", "profile", "hours"], []],
    [["findings", "lanesVsRiskCorrelation"], 2],
    [["national"], []],
    [["national", 0, "cyclistKilled"], -1],
    [["cities", 0, "pillarScores", "safety"], undefined],
    [["cities", 0, "pillarScores", "usage"], 101],
    [["cities", 0, "metrics", "injuryRiskRatio"], undefined],
    [["cities", 0, "metricScores", "injuryRiskRatio"], null],
    [["cities", 0, "crashProfile"], null],
    [["cities", 0, "crashProfile", "carShare"], 1.2],
    [["cities", 0, "crashSeries", 0, "year"], 1901],
    [["cities", 0, "safety", "ratioHigh"], 0],
    [["cities", 0, "context", "osm"], {}],
    [["cities", 0, "flags"], [null]],
    [["cities", 0, "rankRange"], [2, 1]],
    [["cities", 0, "rank"], 0],
    [["cities", 0, "istatCode"], "123"],
    [["cities", 0, "dataCoverage"], { metricsAvailable: 1 }]
  ] as [(string | number)[], unknown][])("rejects invalid %j before rendering", (path, value) => {
    expect(() => parseRankingPayload(invalidAt(path, value))).toThrow(/Dataset non valido:/);
  });

  it("rejects duplicate city identifiers and ranks", () => {
    const payload = structuredClone(published);
    payload.cities[1].id = payload.cities[0].id;
    expect(() => parseRankingPayload(payload)).toThrow(/duplicat/);
    payload.cities[1].id = "distinct";
    payload.cities[1].rank = payload.cities[0].rank;
    expect(() => parseRankingPayload(payload)).toThrow(/duplicat/);
  });

  it.each([null, [], "invalid", 42])("rejects malformed top-level JSON %j", (value) => {
    expect(() => parseRankingPayload(value)).toThrow(/Dataset non valido:/);
  });
});
