import { useEffect, useRef, useState } from "react";
import { formatMetric, weightsEqual } from "./scoring";
import type { RankedCity, Weights } from "./types";

export type RankingAnnouncementSnapshot = {
  orderKey: string;
  selectedRank: number;
  selectedScore: number;
};

/** Stable key for full ranking order (city names in rank sequence). */
export function rankingOrderKey(cities: Pick<RankedCity, "city">[]): string {
  return cities.map((city) => city.city).join("\u0001");
}

export function snapshotFromRanking(
  cities: Pick<RankedCity, "city">[],
  selected: Pick<RankedCity, "adjustedRank" | "adjustedScore">
): RankingAnnouncementSnapshot {
  return {
    orderKey: rankingOrderKey(cities),
    selectedRank: selected.adjustedRank,
    selectedScore: selected.adjustedScore
  };
}

export function rankingUpdateChanged(
  previous: RankingAnnouncementSnapshot,
  next: RankingAnnouncementSnapshot
): boolean {
  return (
    previous.orderKey !== next.orderKey ||
    previous.selectedRank !== next.selectedRank ||
    previous.selectedScore !== next.selectedScore
  );
}

export function formatRankingUpdatedAnnouncement(
  cityName: string,
  rank: number,
  score: number
): string {
  return `Ranking aggiornato: ${cityName} posizione ${rank}, punteggio ${formatMetric(score, 1)}`;
}

export function formatRankingRestoredAnnouncement(
  cityName: string,
  rank: number,
  score: number
): string {
  return `Ranking ripristinato: ${cityName} posizione ${rank}, punteggio ${formatMetric(score, 1)}`;
}

const DEFAULT_DEBOUNCE_MS = 400;

/**
 * Announces ranking changes for screen readers when custom weights alter order
 * or the selected city's rank/score. Debounced; skips duplicate text.
 */
export function useRankingWeightAnnouncement(
  rankedCities: RankedCity[],
  selectedCity: RankedCity | null,
  weights: Weights,
  defaultWeights: Weights,
  debounceMs = DEFAULT_DEBOUNCE_MS
): string {
  const [announcement, setAnnouncement] = useState("");
  const baselineRef = useRef<RankingAnnouncementSnapshot | null>(null);
  const lastAnnouncedTextRef = useRef("");
  const prevUsesCustomRef = useRef(false);
  const prevWeightsKeyRef = useRef<string | null>(null);
  const weightsKey = JSON.stringify(weights);

  useEffect(() => {
    if (!selectedCity || rankedCities.length === 0) return;

    const nextSnapshot = snapshotFromRanking(rankedCities, selectedCity);
    const usesCustomWeights = !weightsEqual(weights, defaultWeights);

    if (baselineRef.current === null) {
      baselineRef.current = nextSnapshot;
      prevUsesCustomRef.current = usesCustomWeights;
      prevWeightsKeyRef.current = weightsKey;
      return;
    }

    let cancelled = false;

    const timeout = window.setTimeout(() => {
      if (cancelled) return;

      const weightsChanged = prevWeightsKeyRef.current !== weightsKey;
      prevWeightsKeyRef.current = weightsKey;

      const restored = prevUsesCustomRef.current && !usesCustomWeights;
      prevUsesCustomRef.current = usesCustomWeights;

      if (!weightsChanged && !restored) {
        return;
      }

      const rankingChanged = rankingUpdateChanged(baselineRef.current!, nextSnapshot);

      if (!rankingChanged && !restored) {
        baselineRef.current = nextSnapshot;
        return;
      }

      const message = restored
        ? formatRankingRestoredAnnouncement(
            selectedCity.city,
            selectedCity.adjustedRank,
            selectedCity.adjustedScore
          )
        : formatRankingUpdatedAnnouncement(
            selectedCity.city,
            selectedCity.adjustedRank,
            selectedCity.adjustedScore
          );

      if (message === lastAnnouncedTextRef.current) {
        baselineRef.current = nextSnapshot;
        return;
      }

      setAnnouncement(message);
      lastAnnouncedTextRef.current = message;
      baselineRef.current = nextSnapshot;
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [rankedCities, selectedCity, weights, weightsKey, defaultWeights, debounceMs]);

  return announcement;
}
