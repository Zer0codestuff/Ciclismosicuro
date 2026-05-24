/**
 * Re-apply manual enrichment and manual-metric normalization on an existing ranking payload.
 * Use when Lab24 raw HTML is unavailable but ranking.json already exists.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  canonicalCityKey,
  indexCitiesByCanonicalKey,
  validateManualEnrichmentKeys
} from "./city-keys.mjs";
import { syncCoverageAuditMetrics } from "./coverage-audit.mjs";
import { buildRankingCsvRows, toCsv } from "./csv-export.mjs";

const ROOT = process.cwd();
const RANKING_PATH = path.join(ROOT, "data/processed/ranking.json");
const MANUAL_PATH = path.join(ROOT, "data/manual/city-enrichment.json");

const manualMetrics = [
  { id: "fiabBikeSmile", direction: "higher", domainMin: 1, domainMax: 5, category: "policy", categoryWeight: 0.65, sourceId: "fiab-comuni-ciclabili" },
  { id: "bikeModalSharePercent", direction: "higher", domainMin: 0, domainMax: 30, category: "usage", categoryWeight: 1, sourceId: "legambiente-abc-2015" },
  { id: "externalPolicyScore", direction: "higher", domainMin: 0, domainMax: 100, category: "policy", categoryWeight: 0.35, sourceId: "copenhagenize-bologna-2025" }
];

function round(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

function normalize(values, direction, domainMin = null, domainMax = null) {
  const numeric = values.filter((value) => Number.isFinite(value));
  const min = domainMin ?? Math.min(...numeric);
  const max = domainMax ?? Math.max(...numeric);
  if (max === min) {
    return new Map(values.map((value, index) => [index, Number.isFinite(value) ? 50 : null]));
  }
  return new Map(
    values.map((value, index) => {
      if (!Number.isFinite(value)) return [index, null];
      const scaled = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
      return [index, direction === "lower" ? 100 - scaled : scaled];
    })
  );
}

function weightedAverage(items) {
  const present = items.filter((item) => Number.isFinite(item.value));
  if (present.length === 0) return null;
  const totalWeight = present.reduce((sum, item) => sum + item.weight, 0);
  return present.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

function categoryScores(city, metricDefinitions) {
  const categories = ["infrastructure", "safety", "usage", "connectivity", "policy", "comfort"];
  const scores = {};
  const coverage = {};
  for (const category of categories) {
    const defs = metricDefinitions.filter((metric) => metric.category === category);
    const items = defs.map((metric) => ({
      value: city.normalizedMetrics[metric.id],
      weight: metric.categoryWeight ?? 1
    }));
    const available = items.filter((item) => Number.isFinite(item.value)).length;
    const average = weightedAverage(items);
    const coveragePenalty = defs.length === 0 ? 1 : 0.72 + 0.28 * (available / defs.length);
    scores[category] = average === null ? null : round(average * coveragePenalty, 2);
    coverage[category] = defs.length === 0 ? 0 : round((available / defs.length) * 100, 1);
  }
  return { scores, coverage };
}

const manual = JSON.parse(await readFile(MANUAL_PATH, "utf8"));
const payload = JSON.parse(await readFile(RANKING_PATH, "utf8"));
const cityByCanonicalKey = indexCitiesByCanonicalKey(payload.cities);

const manualKeyFailures = validateManualEnrichmentKeys(
  manual,
  payload.cities.map((city) => city.city)
);
if (manualKeyFailures.length) {
  throw new Error(manualKeyFailures.join("\n"));
}

for (const city of payload.cities) {
  for (const metric of manualMetrics) {
    city.rawMetrics[metric.id] = null;
    city.normalizedMetrics[metric.id] = null;
    delete city.metricSources[metric.id];
  }
  city.policySignals = [];
  city.manualSources = [];
  city.externalCyclingScore = null;
  city.externalInfrastructureScore = null;
  city.externalUsageScore = null;
}

for (const [cityName, enrichment] of Object.entries(manual)) {
  const city = cityByCanonicalKey.get(canonicalCityKey(cityName));
  if (!city) continue;
  for (const metric of manualMetrics) {
    if (enrichment[metric.id] !== undefined) {
      city.rawMetrics[metric.id] = Number(enrichment[metric.id]);
      city.metricSources[metric.id] = metric.sourceId;
    }
  }
  city.policySignals = enrichment.policySignals ?? [];
  city.manualSources = enrichment.sources ?? [];
  city.externalCyclingScore = enrichment.externalCyclingScore ?? null;
  city.externalInfrastructureScore = enrichment.externalInfrastructureScore ?? null;
  city.externalUsageScore = enrichment.externalUsageScore ?? null;
}

const manualMetricIds = manualMetrics.map((metric) => metric.id);
for (const metric of manualMetrics) {
  const values = payload.cities.map((city) => city.rawMetrics[metric.id]);
  const normalized = normalize(values, metric.direction, metric.domainMin, metric.domainMax);
  payload.cities.forEach((city, index) => {
    city.normalizedMetrics[metric.id] = round(normalized.get(index), 2);
  });
}

for (const city of payload.cities) {
  const categories = categoryScores(city, payload.metricDefinitions);
  city.categoryScores = categories.scores;
  city.categoryCoverage = categories.coverage;
  city.missingMetrics = manualMetricIds.filter((id) => city.rawMetrics[id] === null);
}

syncCoverageAuditMetrics(payload);

const csvRows = buildRankingCsvRows(payload);

const normalizedIndicators = payload.cities.map((city) => ({
  city: city.city,
  rank: city.rank,
  score: city.score,
  normalizedMetrics: city.normalizedMetrics,
  categoryScores: city.categoryScores
}));

const serialized = `${JSON.stringify(payload, null, 2)}\n`;
const csv = `${toCsv(csvRows)}\n`;
const normalizedSerialized = `${JSON.stringify(normalizedIndicators, null, 2)}\n`;

for (const base of ["data/processed", "public/data"]) {
  await mkdir(path.join(ROOT, base), { recursive: true });
  await writeFile(path.join(ROOT, base, "ranking.json"), serialized);
  await writeFile(path.join(ROOT, base, "ranking.csv"), csv);
  await writeFile(path.join(ROOT, base, "normalized-indicators.json"), normalizedSerialized);
}

const aquila = payload.cities.find((city) => canonicalCityKey(city.city) === canonicalCityKey("L'Aquila"));
console.log(
  `Remerged manual enrichment for ${payload.cities.length} cities. L'Aquila fiab=${aquila?.rawMetrics.fiabBikeSmile} manualSources=${JSON.stringify(aquila?.manualSources)}`
);
