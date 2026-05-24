import { describe, expect, it } from "vitest";
import {
  buildCityComparison,
  formatRankDelta,
  formatScoreDelta,
  topCategoryGaps
} from "./cityComparison";
import { DEFAULT_WEIGHTS, rankCities } from "./scoring";
import { sampleCity } from "./fixtures/minimal-ranking";

describe("cityComparison", () => {
  const ranked = rankCities(
    [
      sampleCity("Alpha", 1, 80, {
        categoryScores: {
          infrastructure: 90,
          safety: 40,
          usage: null,
          connectivity: 55,
          policy: null,
          comfort: 50
        }
      }),
      sampleCity("Beta", 2, 65, {
        categoryScores: {
          infrastructure: 50,
          safety: 90,
          usage: null,
          connectivity: 55,
          policy: null,
          comfort: 50
        }
      })
    ],
    DEFAULT_WEIGHTS
  );
  const alpha = ranked.find((city) => city.city === "Alpha")!;
  const beta = ranked.find((city) => city.city === "Beta")!;

  it("computes rank and score deltas from base vs other", () => {
    const result = buildCityComparison(alpha, beta, DEFAULT_WEIGHTS);
    expect(result.otherCity).toBe("Beta");
    expect(result.rankDelta).toBe(alpha.adjustedRank - beta.adjustedRank);
    expect(result.scoreDelta).toBe(
      Number((alpha.adjustedScore - beta.adjustedScore).toFixed(2))
    );
  });

  it("lists top three category gaps by absolute difference", () => {
    expect(alpha.categoryScores.infrastructure).toBe(90);
    expect(beta.categoryScores.infrastructure).toBe(50);
    const gaps = topCategoryGaps(alpha, beta, DEFAULT_WEIGHTS, 3);
    expect(gaps).toHaveLength(3);
    expect(gaps[0].category).toBe("safety");
    expect(gaps[0].delta).toBe(-50);
    expect(gaps[1].category).toBe("infrastructure");
    expect(gaps[1].delta).toBe(40);
    expect(gaps[2].delta).toBe(0);
  });

  it("formats rank and score deltas for Italian UI copy", () => {
    expect(formatRankDelta(-1)).toBe("1 posizione migliore");
    expect(formatRankDelta(2)).toBe("2 posizioni peggiori");
    expect(formatRankDelta(0)).toBe("stessa posizione");
    expect(formatScoreDelta(1.5)).toMatch(/^\+/);
    expect(formatScoreDelta(-0.3)).toMatch(/^−/);
    expect(formatScoreDelta(0)).toBe("stesso punteggio");
  });

  it("respects custom weights when scoring categories for gaps", () => {
    const weights = { ...DEFAULT_WEIGHTS, policy: 20, usage: 0 };
    const policyOnly = sampleCity("PolicyTown", 3, 70, {
      categoryScores: {
        infrastructure: 50,
        safety: 50,
        usage: null,
        connectivity: 50,
        policy: 80,
        comfort: 50
      }
    });
    const imputedPolicy = sampleCity("NoPolicy", 4, 70, {
      categoryScores: {
        infrastructure: 50,
        safety: 50,
        usage: null,
        connectivity: 50,
        policy: null,
        comfort: 50
      }
    });
    const [rankedPolicy, rankedImputed] = rankCities([policyOnly, imputedPolicy], weights);
    const gaps = topCategoryGaps(rankedPolicy, rankedImputed, weights, 6);
    const policyGap = gaps.find((gap) => gap.category === "policy");
    expect(policyGap).toBeDefined();
    expect(policyGap?.delta).toBe(60);
    expect(policyGap?.otherDisplay).toContain("20");
  });
});
