import { describe, expect, it } from "vitest";
import { dataCoverage, exposureRatio, fitRiskModel, personYears, rankBy, scoreMetric } from "./build-index.mjs";
import { DEFAULT_WEIGHTS, METRICS, PILLARS, transformValue, weightedCoverage, weightedMean } from "./methodology.mjs";

describe("comparable index methodology", () => {
  it("uses aligned annual population and never backfills an earlier fatality year", () => {
    expect(personYears({ 2022: 100, 2023: 120, 2024: 140 }, [2022, 2023])).toBe(240);
    expect(() => personYears({ 2019: 100, 2020: 110 }, [2015])).toThrow(/backfilled/);
    expect(() => personYears({ 2024: 100 }, [2024])).toThrow(/2025/);
  });

  it("keeps voluntary OSM mapping outside every default pillar score", () => {
    const osmMetrics = METRICS.filter((metric) => metric.sourceIds.includes("osm"));
    expect(osmMetrics).toHaveLength(2);
    expect(osmMetrics.every((metric) => metric.weight === 0)).toBe(true);
    for (const pillar of PILLARS) {
      expect(METRICS.filter((metric) => metric.pillar === pillar.id).reduce((sum, metric) => sum + metric.weight, 0)).toBeCloseTo(1, 10);
    }
    expect(Object.values(DEFAULT_WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBe(100);
  });

  it("reports missing positive weight and never treats missing as zero", () => {
    const scores = Object.fromEntries(METRICS.map((metric) => [metric.id, 50]));
    scores.osmSeparatedNetworkShare = null;
    scores.osmSlowStreetShare = null;
    expect(dataCoverage(scores).defaultWeightedCoverage).toBe(1);
    scores.carsPer100 = null;
    const coverage = dataCoverage(scores);
    expect(coverage.pillarCoverage.traffic).toBeCloseTo(0.6);
    expect(coverage.defaultWeightedCoverage).toBeCloseTo(0.92);
    expect(coverage.missingMetricIds).toContain("carsPer100");
    expect(weightedMean([{ value: null, weight: 0.4 }, { value: 80, weight: 0.6 }])).toBe(80);
    expect(weightedCoverage([{ value: null, weight: 1 }])).toBe(0);
    expect(weightedMean([{ value: null, weight: 1 }])).toBeNull();
  });

  it("does not manufacture robust or binary scores from unavailable data", () => {
    const robust = METRICS.find((metric) => metric.id === "cycleLanesPer10k");
    expect(scoreMetric(robust, [null, undefined, NaN])).toEqual([null, null, null]);
    expect(scoreMetric(robust, [7, 7, null])).toEqual([50, 50, null]);
    const binary = METRICS.find((metric) => metric.id === "zone30");
    expect(scoreMetric(binary, [true, false, null, undefined, NaN])).toEqual([100, 0, null, null, null]);
    expect(transformValue(-1, "log1p")).toBeNull();
    expect(transformValue(0, "log")).toBeNull();
    expect(transformValue(0, "log1p")).toBe(0);
  });

  it("ranks ties by Italian city name and leaves unscorable cities unranked", () => {
    expect(rankBy([70, 70, null, 20], ["Fermo", "Benevento", "Roma", "Pisa"])).toEqual([2, 1, null, 3]);
  });

  it("varies the individual historical proxy without implying a causal effect", () => {
    const baseline = exposureRatio(20, 10, 5, 0.6, 1);
    const half = exposureRatio(20, 10, 5, 0.6, 0.5);
    const double = exposureRatio(20, 10, 5, 0.6, 2);
    expect(baseline).toBeCloseTo(25 / 15);
    expect(half).toBeGreaterThan(baseline);
    expect(double).toBeLessThan(baseline);
    expect(exposureRatio(0, 0.1, 5, 0.6, 2)).toBeGreaterThan(0);
    expect(() => exposureRatio(20, 10, 5, 0.6, 0)).toThrow(/positive/);
  });

  it("rejects undefined cycling exposure instead of flooring it", () => {
    const rows = Array.from({ length: 4 }, (_, index) => ({ observed: index + 1, personYears: 100, bikeShare: index === 0 ? 0 : 0.01 * index }));
    expect(() => fitRiskModel(rows)).toThrow(/bike shares/);
  });
});
