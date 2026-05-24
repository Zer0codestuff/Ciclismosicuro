import { describe, expect, it } from "vitest";
import {
  categoryScoreValue,
  computeScore,
  DEFAULT_WEIGHTS,
  MISSING_CATEGORY_FALLBACK,
  rankCities,
  totalWeight,
  weightsEqual
} from "./scoring";
import type { CategoryKey, CityRanking, Weights } from "./types";

function city(
  name: string,
  overrides: Omit<Partial<CityRanking>, "categoryScores"> & {
    categoryScores?: Partial<Record<Exclude<CategoryKey, "dataConfidence">, number | null>>;
  } = {}
): CityRanking {
  const { categoryScores: categoryOverrides, ...restOverrides } = overrides;
  return {
    id: name,
    city: name,
    rank: 1,
    score: 0,
    dataConfidence: 90,
    regionId: "0",
    sizeClass: null,
    rawMetrics: {},
    normalizedMetrics: {},
    metricSources: {},
    manualSources: [],
    categoryScores: {
      infrastructure: 70,
      safety: 50,
      usage: null,
      connectivity: 50,
      policy: null,
      comfort: 50,
      ...categoryOverrides
    },
    categoryCoverage: {
      infrastructure: 100,
      safety: 100,
      usage: 0,
      connectivity: 100,
      policy: 0,
      comfort: 100
    },
    strengths: [],
    weaknesses: [],
    uncertainty: "test",
    missingMetrics: [],
    ...restOverrides
  };
}

describe("scoring", () => {
  it("exposes default weights that exclude sparse usage and policy categories", () => {
    expect(DEFAULT_WEIGHTS.usage).toBe(0);
    expect(DEFAULT_WEIGHTS.policy).toBe(0);
    expect(DEFAULT_WEIGHTS.infrastructure).toBeGreaterThan(0);
    expect(DEFAULT_WEIGHTS.safety).toBeGreaterThan(0);
    expect(DEFAULT_WEIGHTS.connectivity).toBeGreaterThan(0);
    expect(Object.values(DEFAULT_WEIGHTS).reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it("keeps scores bounded from 0 to 100", () => {
    const value = computeScore(
      city("A", { categoryScores: { infrastructure: 100, policy: 100, usage: 100 } }),
      DEFAULT_WEIGHTS
    );
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);
  });

  it("uses a prudent fallback for missing category evidence when weight is non-zero", () => {
    expect(categoryScoreValue(city("Missing"), "policy")).toBe(MISSING_CATEGORY_FALLBACK);

    const withPolicy = computeScore(city("Policy", { categoryScores: { policy: 80 } }), {
      ...DEFAULT_WEIGHTS,
      policy: 20
    });
    const missingPolicy = computeScore(city("Missing"), {
      ...DEFAULT_WEIGHTS,
      policy: 20
    });
    expect(withPolicy).toBeGreaterThan(missingPolicy);
  });

  it("does not let sparse policy signals move the default ranking", () => {
    const comparable = computeScore(
      city("Comparable", { categoryScores: { infrastructure: 80, policy: null } }),
      DEFAULT_WEIGHTS
    );
    const policyBoost = computeScore(
      city("PolicyBoost", { categoryScores: { infrastructure: 80, policy: 95 } }),
      DEFAULT_WEIGHTS
    );
    expect(comparable).toBeCloseTo(policyBoost, 5);
  });

  it("ranks by adjusted score descending and then city name with Italian locale", () => {
    const ranked = rankCities(
      [
        city("Bologna", { categoryScores: { infrastructure: 60 } }),
        city("Ancona", { categoryScores: { infrastructure: 60 } }),
        city("Cesena", { categoryScores: { infrastructure: 80 } })
      ],
      DEFAULT_WEIGHTS
    );
    expect(ranked[0].city).toBe("Cesena");
    expect(ranked[1].city).toBe("Ancona");
    expect(ranked[2].city).toBe("Bologna");
    expect(ranked.map((entry) => entry.adjustedRank)).toEqual([1, 2, 3]);
  });

  it("breaks score ties alphabetically in Italian", () => {
    const ranked = rankCities([city("B", {}), city("A", {})], DEFAULT_WEIGHTS);
    expect(ranked[0].adjustedScore).toBe(ranked[1].adjustedScore);
    expect(ranked[0].city).toBe("A");
    expect(ranked[1].city).toBe("B");
  });

  it("sums active category weights", () => {
    expect(totalWeight(DEFAULT_WEIGHTS)).toBe(100);
    expect(totalWeight({ ...DEFAULT_WEIGHTS, infrastructure: 40 })).toBe(90);
  });

  it("compares weights by category value", () => {
    expect(weightsEqual(DEFAULT_WEIGHTS, { ...DEFAULT_WEIGHTS })).toBe(true);
    expect(weightsEqual(DEFAULT_WEIGHTS, { ...DEFAULT_WEIGHTS, policy: 10 })).toBe(false);
  });

  it("keeps rank order stable when only zero-weight categories differ", () => {
    const weights: Weights = DEFAULT_WEIGHTS;
    const baseline = rankCities(
      [
        city("Alpha", { categoryScores: { infrastructure: 75, policy: null, usage: null } }),
        city("Beta", { categoryScores: { infrastructure: 60, policy: 95, usage: 90 } })
      ],
      weights
    );
    expect(baseline[0].city).toBe("Alpha");
    expect(baseline[1].city).toBe("Beta");
  });
});
