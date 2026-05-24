import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeScore,
  DEFAULT_WEIGHTS,
  MISSING_CATEGORY_FALLBACK,
  rankCities
} from "./scoring";
import type { RankingPayload } from "./types";

const SCORE_TOLERANCE = 0.01;

async function loadPublishedRanking(): Promise<RankingPayload> {
  const rankingPath = path.join(process.cwd(), "public/data/ranking.json");
  return JSON.parse(await readFile(rankingPath, "utf8")) as RankingPayload;
}

/**
 * Mirrors scripts/build-data.mjs `scoreCity` — kept in test only so parity
 * failures distinguish pipeline formula drift from stale exports.
 */
function pipelineScoreCity(
  city: RankingPayload["cities"][number],
  weights: RankingPayload["defaultWeights"]
): number {
  const weighted = Object.entries(weights)
    .filter(([category]) => category !== "dataConfidence")
    .map(([category, weight]) => ({
      value: city.categoryScores[category as keyof typeof city.categoryScores] ?? MISSING_CATEGORY_FALLBACK,
      weight
    }))
    .filter((item) => item.weight > 0 && Number.isFinite(item.value));
  const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (totalWeight <= 0 || weighted.length === 0) return 0;
  const categoryWeightSum = weighted.reduce((sum, item) => sum + item.weight, 0);
  const categoryScore =
    weighted.reduce((sum, item) => sum + item.value * item.weight, 0) / categoryWeightSum;
  const score =
    (categoryScore * (totalWeight - weights.dataConfidence) +
      city.dataConfidence * weights.dataConfidence) /
    totalWeight;
  return Number(score.toFixed(2));
}

describe("pipeline ↔ client score parity", () => {
  it("aligns DEFAULT_WEIGHTS with published defaultWeights", async () => {
    const ranking = await loadPublishedRanking();
    expect(DEFAULT_WEIGHTS).toEqual(ranking.defaultWeights);
  });

  it("matches computeScore to every published city.score at default weights (±0.01)", async () => {
    const ranking = await loadPublishedRanking();
    expect(ranking.cities.length).toBe(ranking.coverageAudit.cityCount);

    const mismatches: string[] = [];
    for (const city of ranking.cities) {
      const computed = computeScore(city, ranking.defaultWeights);
      const delta = Math.abs(computed - city.score);
      if (delta > SCORE_TOLERANCE) {
        mismatches.push(
          `${city.city}: published=${city.score}, computeScore=${computed}, Δ=${delta.toFixed(4)}`
        );
      }
      const pipeline = pipelineScoreCity(city, ranking.defaultWeights);
      if (Math.abs(pipeline - city.score) > SCORE_TOLERANCE) {
        mismatches.push(
          `${city.city}: published=${city.score}, pipelineScoreCity=${pipeline} (export drift)`
        );
      }
      if (Math.abs(computed - pipeline) > SCORE_TOLERANCE) {
        mismatches.push(
          `${city.city}: computeScore=${computed}, pipelineScoreCity=${pipeline} (client vs pipeline)`
        );
      }
    }

    expect(mismatches, mismatches.join("\n")).toEqual([]);
  });

  it("matches rankCities order to published ranks at default weights", async () => {
    const ranking = await loadPublishedRanking();
    const ranked = rankCities(ranking.cities, ranking.defaultWeights);
    const rankByCity = new Map(ranked.map((city) => [city.city, city.adjustedRank]));

    const mismatches: string[] = [];
    for (const city of ranking.cities) {
      const adjustedRank = rankByCity.get(city.city);
      if (adjustedRank !== city.rank) {
        mismatches.push(
          `${city.city}: published rank=${city.rank}, rankCities=${adjustedRank}, score=${city.score}`
        );
      }
    }

    expect(mismatches, mismatches.join("\n")).toEqual([]);
  });
});
