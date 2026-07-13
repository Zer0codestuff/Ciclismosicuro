import type { CategoryKey, RankingPayload, Weights } from "./types";

const CATEGORY_KEYS: readonly CategoryKey[] = [
  "infrastructure",
  "safety",
  "usage",
  "connectivity",
  "policy",
  "comfort",
  "dataConfidence"
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasValidWeights(value: unknown): value is Weights {
  return (
    isRecord(value) &&
    CATEGORY_KEYS.every((category) => isFiniteNumber(value[category]) && value[category] >= 0) &&
    CATEGORY_KEYS.some((category) => Number(value[category]) > 0)
  );
}

function isNullableFiniteNumber(value: unknown): boolean {
  return value === null || isFiniteNumber(value);
}

function hasNumericRecordValues(value: unknown, nullable: boolean): boolean {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) =>
      nullable ? isNullableFiniteNumber(entry) : isFiniteNumber(entry)
    )
  );
}

function hasValidCityShape(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || typeof value.city !== "string" || !value.city.trim()) {
    return false;
  }
  if (!isFiniteNumber(value.rank) || !isFiniteNumber(value.score)) return false;
  if (!isFiniteNumber(value.dataConfidence)) return false;
  if (!hasNumericRecordValues(value.rawMetrics, true)) return false;
  if (!hasNumericRecordValues(value.normalizedMetrics, true)) return false;
  if (!isRecord(value.categoryScores) || !isRecord(value.categoryCoverage)) return false;
  const categoryScores = value.categoryScores;
  const categoryCoverage = value.categoryCoverage;
  const scoredCategories = CATEGORY_KEYS.filter((category) => category !== "dataConfidence");
  if (!scoredCategories.every((category) => isNullableFiniteNumber(categoryScores[category]))) {
    return false;
  }
  if (!scoredCategories.every((category) => isFiniteNumber(categoryCoverage[category]))) {
    return false;
  }
  return ["strengths", "weaknesses", "missingMetrics", "manualSources"].every((key) =>
    Array.isArray(value[key])
  );
}

/**
 * Validate the network boundary before the payload reaches rendering/scoring code.
 * The build-time validator remains exhaustive; this guard prevents a stale or
 * corrupted deployed JSON file from crashing the application at runtime.
 */
export function parseRankingPayload(value: unknown): RankingPayload {
  if (!isRecord(value)) throw new Error("formato principale non valido");
  if (typeof value.title !== "string" || typeof value.summary !== "string") {
    throw new Error("titolo o descrizione mancanti");
  }
  if (!Array.isArray(value.methodologyCaveats) || value.methodologyCaveats.length === 0) {
    throw new Error("limiti metodologici mancanti");
  }
  if (typeof value.generatedAt !== "string" || typeof value.accessDate !== "string") {
    throw new Error("date del dataset mancanti");
  }
  if (!hasValidWeights(value.defaultWeights)) throw new Error("pesi predefiniti non validi");
  if (!Array.isArray(value.cities) || value.cities.length === 0) {
    throw new Error("elenco città vuoto");
  }
  if (!value.cities.every(hasValidCityShape)) throw new Error("dati città non validi");
  if (
    !Array.isArray(value.metricDefinitions) ||
    !value.metricDefinitions.every(
      (metric) =>
        isRecord(metric) &&
        typeof metric.id === "string" &&
        typeof metric.label === "string" &&
        typeof metric.category === "string"
    ) ||
    !Array.isArray(value.sources) ||
    !value.sources.every(
      (source) =>
        isRecord(source) &&
        typeof source.id === "string" &&
        typeof source.title === "string" &&
        typeof source.publisher === "string" &&
        typeof source.url === "string"
    )
  ) {
    throw new Error("metriche o fonti mancanti");
  }
  if (
    !isRecord(value.coverageAudit) ||
    !isFiniteNumber(value.coverageAudit.cityCount) ||
    !Array.isArray(value.coverageAudit.categories) ||
    !Array.isArray(value.coverageAudit.metrics) ||
    !Array.isArray(value.coverageAudit.sparseSignals) ||
    !Array.isArray(value.coverageAudit.defaultScoreCategories) ||
    !Array.isArray(value.coverageAudit.contextualCategories) ||
    !Array.isArray(value.coverageAudit.notes) ||
    !isRecord(value.nationalContext) ||
    typeof value.nationalContext.disclaimer !== "string" ||
    value.nationalContext.notUsedInRanking !== true ||
    !Array.isArray(value.nationalContext.sections)
  ) {
    throw new Error("audit di copertura o contesto nazionale mancanti");
  }
  if (!Array.isArray(value.sourceGaps)) throw new Error("gap delle fonti mancanti");

  return value as unknown as RankingPayload;
}
