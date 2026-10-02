import type { City, PillarId, RankedCity, Weights } from "../types";

export const PILLAR_ORDER: PillarId[] = ["safety", "infrastructure", "traffic", "usage", "transit", "environment"];
export const CORE_PILLARS: PillarId[] = ["safety", "infrastructure", "traffic", "usage"];
export const MAX_WEIGHT = 60;

/** Validated categorical palette (pillar identity); contextual pillars stay neutral. */
export const PILLAR_COLORS: Record<PillarId, string> = {
  safety: "#0d9488",
  infrastructure: "#2a78d6",
  traffic: "#eb6834",
  usage: "#4a3aa7",
  transit: "#7b8a84",
  environment: "#9aa6a1"
};

/** Weighted mean of pillar scores; pillars with no data are skipped (weights renormalized). */
export function compositeScore(pillarScores: Record<PillarId, number | null>, weights: Weights): number | null {
  let total = 0;
  let weightSum = 0;
  for (const pillar of PILLAR_ORDER) {
    const value = pillarScores[pillar];
    const weight = weights[pillar] ?? 0;
    if (!Number.isFinite(weight) || weight <= 0 || value === null || value === undefined || !Number.isFinite(value)) continue;
    total += value * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? total / weightSum : null;
}

export function rankCities(cities: City[], weights: Weights): RankedCity[] {
  return cities
    .map((city) => ({ ...city, liveScore: compositeScore(city.pillarScores, weights), liveRank: null as number | null }))
    .sort((a, b) => {
      if (a.liveScore === null && b.liveScore !== null) return 1;
      if (a.liveScore !== null && b.liveScore === null) return -1;
      return (b.liveScore ?? 0) - (a.liveScore ?? 0) || a.name.localeCompare(b.name, "it");
    })
    .map((city, index) => ({ ...city, liveRank: city.liveScore === null ? null : index + 1 }));
}

function usableWeight(weight: number | undefined): number {
  return weight !== undefined && Number.isFinite(weight) && weight > 0 ? weight : 0;
}

export function totalWeight(weights: Weights): number {
  return PILLAR_ORDER.reduce((total, pillar) => total + usableWeight(weights[pillar]), 0);
}

export function weightsEqual(left: Weights, right: Weights): boolean {
  return PILLAR_ORDER.every((pillar) => (left[pillar] ?? 0) === (right[pillar] ?? 0));
}

/** Share of the composite contributed by each pillar, for the weight summary. */
export function weightShares(weights: Weights): Record<PillarId, number> {
  const total = totalWeight(weights) || 1;
  return Object.fromEntries(PILLAR_ORDER.map((pillar) => [pillar, usableWeight(weights[pillar]) / total])) as Record<
    PillarId,
    number
  >;
}

export const WEIGHT_PRESETS: { id: string; label: string; description: string; weights: Weights }[] = [
  {
    id: "default",
    label: "Bilanciato",
    description: "Sicurezza al centro, poi infrastruttura, traffico e uso.",
    weights: { safety: 40, infrastructure: 25, traffic: 20, usage: 15, transit: 0, environment: 0 }
  },
  {
    id: "safety",
    label: "Solo sicurezza",
    description: "Classifica sui soli incidenti dei ciclisti.",
    weights: { safety: 60, infrastructure: 0, traffic: 0, usage: 0, transit: 0, environment: 0 }
  },
  {
    id: "infrastructure",
    label: "Rete e uso",
    description: "Dove la bici è già un'abitudine e la rete è estesa.",
    weights: { safety: 15, infrastructure: 40, traffic: 10, usage: 35, transit: 0, environment: 0 }
  },
  {
    id: "equal",
    label: "Pesi uguali",
    description: "Tutti e sei i pilastri con lo stesso peso.",
    weights: { safety: 20, infrastructure: 20, traffic: 20, usage: 20, transit: 20, environment: 20 }
  }
];

/** Diverging color for a risk ratio: teal below 1 (safer), orange-red above 1. */
export function riskColor(ratio: number): string {
  if (!Number.isFinite(ratio)) return "#b8c2bd";
  if (ratio <= 0.6) return "#0f766e";
  if (ratio <= 0.85) return "#5fb3a3";
  if (ratio < 1.15) return "#c9cfca";
  if (ratio < 1.5) return "#e8875a";
  return "#c2410c";
}

/** Validated single-hue ordinal ramp for scores (5 classes). */
export const SCORE_RAMP = ["#62b39f", "#33998a", "#13806f", "#0b5f54", "#063c38"];
export function scoreColor(score: number | null): string {
  if (score === null || !Number.isFinite(score)) return "#b8c2bd";
  const index = Math.min(SCORE_RAMP.length - 1, Math.max(0, Math.floor((score - 20) / 12)));
  return SCORE_RAMP[index];
}
export const SCORE_CLASS_LABELS = ["< 32", "32–44", "44–56", "56–68", "≥ 68"];
