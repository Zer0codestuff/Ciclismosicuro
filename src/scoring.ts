import type { CategoryKey, CityRanking, RankedCity, Weights } from "./types";

/** Fallback score for a category with no evidence when its weight is non-zero. */
export const MISSING_CATEGORY_FALLBACK = 20;

/**
 * Default ranking weights: only broadly covered Lab24 categories affect the score.
 * Sparse manual usage/policy signals stay at 0 and are exposed as contextual data.
 */
export const DEFAULT_WEIGHTS: Weights = {
  infrastructure: 50,
  safety: 25,
  usage: 0,
  connectivity: 15,
  policy: 0,
  comfort: 5,
  dataConfidence: 5
};

export const categoryLabels: Record<CategoryKey, string> = {
  infrastructure: "Infrastruttura",
  safety: "Sicurezza",
  usage: "Uso bici",
  connectivity: "Connessioni",
  policy: "Policy",
  comfort: "Comfort",
  dataConfidence: "Confidenza"
};

export const categoryDescriptions: Record<CategoryKey, string> = {
  infrastructure: "Piste ciclabili equivalenti e spazio pedonale.",
  safety: "Incidentalita e pressione del traffico privato.",
  usage: "Quota modale bici dove disponibile.",
  connectivity: "TPL, ZTL e accessibilita multimodale.",
  policy: "Segnali FIAB/Copenhagenize verificati.",
  comfort: "Aria e condizioni ambientali urbane.",
  dataConfidence: "Copertura e tracciabilita dei dati."
};

export const categoryOrder: CategoryKey[] = [
  "infrastructure",
  "safety",
  "usage",
  "connectivity",
  "policy",
  "comfort",
  "dataConfidence"
];

export function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function categoryScoreValue(
  city: CityRanking,
  category: Exclude<CategoryKey, "dataConfidence">
): number {
  const score = city.categoryScores[category];
  return score === null || score === undefined ? MISSING_CATEGORY_FALLBACK : score;
}

export function computeScore(city: CityRanking, weights: Weights) {
  const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (totalWeight <= 0) return 0;

  const weighted = categoryOrder.reduce((sum, category) => {
    const categoryValue =
      category === "dataConfidence"
        ? city.dataConfidence
        : categoryScoreValue(city, category);
    return sum + clamp(categoryValue) * weights[category];
  }, 0);

  return Number((weighted / totalWeight).toFixed(2));
}

export function rankCities(cities: CityRanking[], weights: Weights): RankedCity[] {
  return cities
    .map((city) => ({
      ...city,
      adjustedScore: computeScore(city, weights),
      adjustedRank: 0
    }))
    .sort((a, b) => {
      if (b.adjustedScore !== a.adjustedScore) return b.adjustedScore - a.adjustedScore;
      return a.city.localeCompare(b.city, "it");
    })
    .map((city, index) => ({
      ...city,
      adjustedRank: index + 1
    }));
}

export function formatMetric(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n.d.";
  return new Intl.NumberFormat("it-IT", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  }).format(value);
}

export function confidenceLabel(value: number) {
  if (value >= 90) return "alta";
  if (value >= 75) return "media";
  return "bassa";
}

export function normalizeWeights(weights: Weights): Weights {
  return categoryOrder.reduce((acc, category) => {
    acc[category] = clamp(Number(weights[category] ?? 0), 0, 60);
    return acc;
  }, {} as Weights);
}

export function totalWeight(weights: Weights): number {
  return categoryOrder.reduce((sum, category) => sum + weights[category], 0);
}

export function weightsEqual(left: Weights, right: Weights): boolean {
  return categoryOrder.every((category) => left[category] === right[category]);
}
