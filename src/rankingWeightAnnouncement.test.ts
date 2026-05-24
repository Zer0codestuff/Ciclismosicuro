import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { minimalRankingPayload } from "./fixtures/minimal-ranking";
import {
  formatRankingRestoredAnnouncement,
  formatRankingUpdatedAnnouncement,
  rankingOrderKey,
  rankingUpdateChanged,
  snapshotFromRanking,
  useRankingWeightAnnouncement
} from "./rankingWeightAnnouncement";
import { DEFAULT_WEIGHTS, normalizeWeights, rankCities } from "./scoring";

describe("rankingWeightAnnouncement", () => {
  it("detects order and selected-city stat changes", () => {
    const before = snapshotFromRanking(
      [{ city: "Alpha" }, { city: "Beta" }],
      { adjustedRank: 1, adjustedScore: 80 }
    );
    const orderChange = snapshotFromRanking(
      [{ city: "Beta" }, { city: "Alpha" }],
      { adjustedRank: 1, adjustedScore: 80 }
    );
    const rankChange = snapshotFromRanking(
      [{ city: "Alpha" }, { city: "Beta" }],
      { adjustedRank: 2, adjustedScore: 72.5 }
    );

    expect(rankingUpdateChanged(before, orderChange)).toBe(true);
    expect(rankingUpdateChanged(before, rankChange)).toBe(true);
    expect(rankingUpdateChanged(before, before)).toBe(false);
  });

  it("builds stable order keys", () => {
    expect(rankingOrderKey([{ city: "A" }, { city: "B" }])).toBe("A\u0001B");
  });

  it("formats Italian announcement copy with one decimal score", () => {
    expect(formatRankingUpdatedAnnouncement("Milano", 3, 72.44)).toBe(
      "Ranking aggiornato: Milano posizione 3, punteggio 72,4"
    );
    expect(formatRankingRestoredAnnouncement("Alpha", 1, 80)).toBe(
      "Ranking ripristinato: Alpha posizione 1, punteggio 80,0"
    );
  });

  it("announces after debounce when weights change ranking", async () => {
    const defaultRanked = rankCities(minimalRankingPayload.cities, DEFAULT_WEIGHTS);
    const customWeights = normalizeWeights({
      ...DEFAULT_WEIGHTS,
      infrastructure: 0,
      safety: 75
    });
    const customRanked = rankCities(minimalRankingPayload.cities, customWeights);
    const alphaDefault = defaultRanked.find((city) => city.city === "Alpha")!;
    const alphaCustom = customRanked.find((city) => city.city === "Alpha")!;

    const { result, rerender } = renderHook(
      ({ ranked, selected, weights }) =>
        useRankingWeightAnnouncement(ranked, selected, weights, DEFAULT_WEIGHTS, 50),
      {
        initialProps: {
          ranked: defaultRanked,
          selected: alphaDefault,
          weights: DEFAULT_WEIGHTS
        }
      }
    );

    await waitFor(() => {
      expect(result.current).toBe("");
    });

    rerender({
      ranked: customRanked,
      selected: alphaCustom,
      weights: customWeights
    });

    const expectedUpdate = formatRankingUpdatedAnnouncement(
      alphaCustom.city,
      alphaCustom.adjustedRank,
      alphaCustom.adjustedScore
    );

    await waitFor(
      () => {
        expect(result.current).toBe(expectedUpdate);
      },
      { timeout: 2000 }
    );
  });
});
