import { categoryLabels, categoryOrder, formatMetric, MISSING_CATEGORY_FALLBACK } from "./scoring";
import type { CategoryKey, RankedCity, Weights } from "./types";

export type CompareCategoryKey = Exclude<CategoryKey, "dataConfidence">;

export interface CategoryGap {
  category: CompareCategoryKey;
  label: string;
  delta: number;
  baseValue: number;
  otherValue: number;
  baseDisplay: string;
  otherDisplay: string;
  imputedBase: boolean;
  imputedOther: boolean;
}

export interface CityComparisonResult {
  otherCity: string;
  rankDelta: number;
  scoreDelta: number;
  topGaps: CategoryGap[];
}

function comparableCategoryValue(
  city: RankedCity,
  category: CompareCategoryKey,
  weights: Weights
): { value: number; imputed: boolean } | null {
  const raw = city.categoryScores[category];
  if (raw !== null && raw !== undefined) {
    return { value: raw, imputed: false };
  }
  if (weights[category] > 0) {
    return { value: MISSING_CATEGORY_FALLBACK, imputed: true };
  }
  return null;
}

function formatCategoryDisplay(
  entry: { value: number; imputed: boolean } | null
): string {
  if (!entry) return "n.d.";
  const formatted = formatMetric(entry.value, 1);
  return entry.imputed ? `${formatted}*` : formatted;
}

export function topCategoryGaps(
  base: RankedCity,
  other: RankedCity,
  weights: Weights,
  limit = 3
): CategoryGap[] {
  const gaps: CategoryGap[] = [];

  for (const category of categoryOrder) {
    if (category === "dataConfidence") continue;
    const baseEntry = comparableCategoryValue(base, category, weights);
    const otherEntry = comparableCategoryValue(other, category, weights);
    if (!baseEntry || !otherEntry) continue;

    gaps.push({
      category,
      label: categoryLabels[category],
      delta: Number((baseEntry.value - otherEntry.value).toFixed(2)),
      baseValue: baseEntry.value,
      otherValue: otherEntry.value,
      baseDisplay: formatCategoryDisplay(baseEntry),
      otherDisplay: formatCategoryDisplay(otherEntry),
      imputedBase: baseEntry.imputed,
      imputedOther: otherEntry.imputed
    });
  }

  return gaps
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
    .slice(0, limit);
}

export function buildCityComparison(
  base: RankedCity,
  other: RankedCity,
  weights: Weights
): CityComparisonResult {
  return {
    otherCity: other.city,
    rankDelta: base.adjustedRank - other.adjustedRank,
    scoreDelta: Number((base.adjustedScore - other.adjustedScore).toFixed(2)),
    topGaps: topCategoryGaps(base, other, weights, 3)
  };
}

export function formatRankDelta(delta: number): string {
  if (delta === 0) return "stessa posizione";
  const positions = Math.abs(delta);
  const label = positions === 1 ? "posizione" : "posizioni";
  if (delta < 0) {
    return `${positions} ${label} migliore`;
  }
  return `${positions} ${label} peggiori`;
}

export function formatScoreDelta(delta: number): string {
  if (delta === 0) return "stesso punteggio";
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${formatMetric(Math.abs(delta), 1)} punti`;
}

export function categoryGapSummary(gap: CategoryGap): string {
  const sign = gap.delta > 0 ? "+" : gap.delta < 0 ? "−" : "";
  const magnitude =
    gap.delta === 0 ? "0" : formatMetric(Math.abs(gap.delta), 1).replace(/\s/g, "");
  return `${gap.label}: ${sign}${magnitude} (${gap.baseDisplay} vs ${gap.otherDisplay})`;
}
