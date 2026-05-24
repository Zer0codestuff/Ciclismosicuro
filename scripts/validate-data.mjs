import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { validateManualEnrichmentKeys } from "./city-keys.mjs";
import {
  validateCategoryCoverageEntries,
  validateMetricCoverageEntries
} from "./coverage-audit.mjs";
import { parseCsvHeaderLine, rankingCsvHeaders } from "./csv-export.mjs";

const ROOT = process.cwd();
const PROCESSED_DIR = path.join(ROOT, "data/processed");
const PUBLIC_DIR = path.join(ROOT, "public/data");
const SYNC_FILES = [
  "ranking.json",
  "normalized-indicators.json",
  "ranking.csv"
];
const HIGH_COVERAGE_THRESHOLD_PERCENT = 95;
const EXPECTED_DEFAULT_WEIGHTS = {
  infrastructure: 50,
  safety: 25,
  usage: 0,
  connectivity: 15,
  policy: 0,
  comfort: 5,
  dataConfidence: 5
};
const CONTEXTUAL_CATEGORIES = new Set(["usage", "policy"]);

const ranking = JSON.parse(await readFile(path.join(PROCESSED_DIR, "ranking.json"), "utf8"));
const publicRanking = JSON.parse(await readFile(path.join(PUBLIC_DIR, "ranking.json"), "utf8"));

const failures = [];

const manualEnrichment = JSON.parse(
  await readFile(path.join(ROOT, "data/manual/city-enrichment.json"), "utf8")
);
failures.push(
  ...validateManualEnrichmentKeys(
    manualEnrichment,
    ranking.cities.map((city) => city.city)
  )
);

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

if (!Array.isArray(ranking.cities) || ranking.cities.length < 100) {
  failures.push(`Expected at least 100 cities, found ${ranking.cities?.length ?? 0}`);
}

for (const [category, weight] of Object.entries(EXPECTED_DEFAULT_WEIGHTS)) {
  if (ranking.defaultWeights?.[category] !== weight) {
    failures.push(`defaultWeights.${category} expected ${weight}, found ${ranking.defaultWeights?.[category]}`);
  }
}

for (const category of CONTEXTUAL_CATEGORIES) {
  if ((ranking.defaultWeights?.[category] ?? 0) > 0) {
    failures.push(`Sparse contextual category ${category} must have zero default weight`);
  }
}

if (!ranking.coverageAudit) {
  failures.push("Missing coverageAudit payload");
} else {
  const audit = ranking.coverageAudit;
  if (audit.cityCount !== ranking.cities.length) {
    failures.push("coverageAudit.cityCount does not match city list length");
  }
  if (!Array.isArray(audit.metrics) || audit.metrics.length !== ranking.metricDefinitions.length) {
    failures.push("coverageAudit.metrics must cover all metric definitions");
  }
  if (!Array.isArray(audit.sparseSignals) || audit.sparseSignals.length === 0) {
    failures.push("coverageAudit.sparseSignals must list sparse manual/contextual metrics");
  }
  for (const entry of audit.categories ?? []) {
    if (entry.includedInDefaultScore && entry.coveragePercent < HIGH_COVERAGE_THRESHOLD_PERCENT) {
      failures.push(
        `Default-weight category ${entry.category} has low coverage (${entry.coveragePercent}% < ${HIGH_COVERAGE_THRESHOLD_PERCENT}%)`
      );
    }
    if (!entry.includedInDefaultScore && (ranking.defaultWeights?.[entry.category] ?? 0) > 0) {
      failures.push(`coverageAudit marks ${entry.category} as contextual but default weight is non-zero`);
    }
  }
  failures.push(...validateMetricCoverageEntries(ranking));
  failures.push(...validateCategoryCoverageEntries(ranking));
}

for (const city of ranking.cities) {
  if (!Number.isFinite(city.score) || city.score < 0 || city.score > 100) {
    failures.push(`${city.city}: score outside 0-100`);
  }
  if (!Number.isFinite(city.dataConfidence) || city.dataConfidence < 0 || city.dataConfidence > 100) {
    failures.push(`${city.city}: confidence outside 0-100`);
  }
  for (const [category, value] of Object.entries(city.categoryScores)) {
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) {
      failures.push(`${city.city}: ${category} category outside 0-100`);
    }
  }
  if (!city.metricSources.cycleNetworkEquivalent) {
    failures.push(`${city.city}: missing cycle network source`);
  }
  for (const metric of ranking.metricDefinitions ?? []) {
    const raw = city.rawMetrics[metric.id];
    const normalized = city.normalizedMetrics[metric.id];
    if (raw == null && normalized !== null) {
      failures.push(
        `${city.city}: ${metric.id} raw is null but normalizedMetrics is ${normalized}`
      );
    }
  }
}

const sourceUrls = new Set(ranking.sources.map((source) => source.url).filter(Boolean));
const sourceIds = new Set(ranking.sources.map((source) => source.id));
if (sourceUrls.size < 10) {
  failures.push("Expected at least 10 source URLs");
}

const REQUIRED_NATIONAL_CONTEXT_FIELDS = [
  "id",
  "label",
  "value",
  "unit",
  "period",
  "sourceId",
  "reliability",
  "interpretation",
  "caveat"
];

function validateNationalContextItem(item, itemPath, registeredSourceIds) {
  for (const field of REQUIRED_NATIONAL_CONTEXT_FIELDS) {
    if (item[field] === undefined || item[field] === null || item[field] === "") {
      failures.push(`${itemPath}: missing required field ${field}`);
    }
  }
  if (item.sourceId && !registeredSourceIds.has(item.sourceId)) {
    failures.push(`${itemPath}: unknown source id ${item.sourceId}`);
  }
}

if (!ranking.nationalContext) {
  failures.push("Missing nationalContext payload");
} else {
  const context = ranking.nationalContext;
  if (context.notUsedInRanking !== true) {
    failures.push("nationalContext.notUsedInRanking must be true");
  }
  if (!Array.isArray(context.sections) || context.sections.length === 0) {
    failures.push("nationalContext.sections must be a non-empty array");
  }
  let timelineCount = 0;
  for (const section of context.sections ?? []) {
    if (!section.id || !section.title || !Array.isArray(section.cards) || section.cards.length === 0) {
      failures.push(`nationalContext section ${section.id ?? "(missing id)"} must have id, title, and cards`);
    }
    for (const card of section.cards ?? []) {
      validateNationalContextItem(card, `nationalContext.${section.id}.cards.${card.id ?? "?"}`, sourceIds);
    }
    if (Array.isArray(section.timeline) && section.timeline.length > 0) {
      timelineCount += 1;
      for (const point of section.timeline) {
        validateNationalContextItem(
          point,
          `nationalContext.${section.id}.timeline.${point.id ?? "?"}`,
          sourceIds
        );
      }
    }
  }
  if (timelineCount === 0) {
    failures.push("nationalContext must include at least one timeline array");
  }
  if (hash(ranking.nationalContext) !== hash(publicRanking.nationalContext)) {
    failures.push("public/data/ranking.json nationalContext is not in sync with data/processed/ranking.json");
  }
}

for (const metric of ranking.metricDefinitions ?? []) {
  if (!sourceIds.has(metric.sourceId)) {
    failures.push(`Metric ${metric.id} references unregistered source id ${metric.sourceId}`);
  }
}

for (const city of ranking.cities) {
  for (const [metric, sourceId] of Object.entries(city.metricSources ?? {})) {
    if (!sourceIds.has(sourceId)) {
      failures.push(`${city.city}: metric ${metric} has unknown source id ${sourceId}`);
    }
  }
  for (const sourceId of city.manualSources ?? []) {
    if (!sourceIds.has(sourceId)) {
      failures.push(`${city.city}: manual source id ${sourceId} is not registered`);
    }
  }
}

if (hash(ranking.cities) !== hash(publicRanking.cities)) {
  failures.push("public/data/ranking.json cities are not in sync with data/processed/ranking.json");
}

for (const file of SYNC_FILES) {
  const processed = await readFile(path.join(PROCESSED_DIR, file), "utf8");
  const published = await readFile(path.join(PUBLIC_DIR, file), "utf8");
  if (processed !== published) {
    failures.push(`${file} differs between data/processed and public/data`);
  }
}

const processedCsv = await readFile(path.join(PROCESSED_DIR, "ranking.csv"), "utf8");
const csvHeaderLine = processedCsv.split("\n")[0] ?? "";
const csvHeaders = parseCsvHeaderLine(csvHeaderLine);
const expectedCsvHeaders = rankingCsvHeaders(ranking);
if (csvHeaders.join(",") !== expectedCsvHeaders.join(",")) {
  failures.push(
    `ranking.csv headers do not match export contract (expected ${expectedCsvHeaders.length} columns including ${ranking.metricDefinitions.length} normalized metrics)`
  );
}
const csvRowCount = processedCsv.trimEnd().split("\n").length - 1;
if (csvRowCount !== ranking.cities.length) {
  failures.push(`ranking.csv row count ${csvRowCount} does not match ${ranking.cities.length} cities`);
}

try {
  await readFile(path.join(PUBLIC_DIR, "raw-indicators.json"), "utf8");
  failures.push("public/data/raw-indicators.json should not be published; keep raw indicator extracts under data/processed only");
} catch (error) {
  if (error.code !== "ENOENT") {
    failures.push(`Could not verify public raw-indicators absence: ${error.message}`);
  }
}

const topRanks = ranking.cities.slice(0, 10).map((city) => city.rank);
if (topRanks.join(",") !== "1,2,3,4,5,6,7,8,9,10") {
  failures.push("Top ranks are not sequential");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `Validated ${ranking.cities.length} cities, ${ranking.metricDefinitions.length} metrics, ${ranking.sources.length} sources, ${ranking.coverageAudit.sparseSignals.length} sparse signals, ${ranking.nationalContext.sections.length} national context sections.`
);
