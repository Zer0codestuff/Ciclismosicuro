/** Sanity checks on the exact JSON/CSV pair published before every build. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PUBLIC_DATA_DIR } from "./config.mjs";
import { buildCsv } from "./csv.mjs";
import { DEFAULT_WEIGHTS, METRICS, PILLARS, weightedMean } from "./methodology.mjs";

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const score = (value) => Number.isFinite(value) && value >= 0 && value <= 100;
const rankRange = (value, count) => Array.isArray(value) && value.length === 2 && value.every((rank) => Number.isInteger(rank) && rank >= 1 && rank <= count) && value[0] <= value[1];

export function validatePayload(payload, csvText) {
  const failures = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };
  if (!object(payload)) return ["payload must be an object"];
  check(payload.schemaVersion === 2, "schemaVersion must be 2");
  for (const key of ["cities", "sources", "metrics", "pillars", "national", "limitations"]) {
    check(Array.isArray(payload[key]) && (key === "limitations" || payload[key].length > 0), `${key} must be an array${key === "limitations" ? "" : " with entries"}`);
  }
  for (const key of ["defaultWeights", "findings", "model"]) check(object(payload[key]), `${key} must be an object`);
  check(typeof csvText === "string", "CSV must be text");
  if (failures.length) return failures;
  check(payload.cities.length >= 100, "expected at least 100 cities");
  check(payload.cityCount === payload.cities.length, "cityCount does not match cities");
  check(Number.isFinite(Date.parse(payload.generatedAt)), "generatedAt is not a date");
  check(JSON.stringify(payload.defaultWeights) === JSON.stringify(DEFAULT_WEIGHTS), "default weights out of sync with methodology");
  if (payload.sources.some((source) => !object(source) || typeof source.id !== "string")) return [...failures, "invalid source entries"];
  if (payload.metrics.some((metric) => !object(metric) || typeof metric.id !== "string" || !Array.isArray(metric.sourceIds))) return [...failures, "invalid metric entries"];
  if (payload.pillars.some((pillar) => !object(pillar) || typeof pillar.id !== "string")) return [...failures, "invalid pillar entries"];
  const sourceIds = new Set(payload.sources.map((source) => source.id));
  check(sourceIds.size === payload.sources.length, "duplicate source identifiers");
  for (const metric of payload.metrics) {
    for (const id of metric.sourceIds) check(sourceIds.has(id), `metric ${metric.id} cites unknown source ${id}`);
  }
  check(JSON.stringify(payload.metrics) === JSON.stringify(METRICS), "metric list out of sync with methodology");
  check(JSON.stringify(payload.pillars) === JSON.stringify(PILLARS), "pillar list out of sync with methodology");
  if (payload.cities.some((city) => !object(city))) return [...failures, "city entries must be objects"];
  const ranks = payload.cities.map((city) => city.rank).sort((a, b) => a - b);
  check(ranks.every((rank, index) => rank === index + 1), "ranks must be 1..N without gaps");
  const ids = new Set();
  const codes = new Set();
  let completeCities = true;
  for (const city of payload.cities) {
    const label = city.name ?? city.id ?? "unknown city";
    const missing = ["pillarScores", "metricScores", "metrics", "safety", "context", "crashProfile"].filter((key) => !object(city[key]));
    check(!missing.length, `${label}: missing objects ${missing.join(", ")}`);
    const arraysValid = ["crashSeries", "cycleLaneSeries", "flags"].every((key) => Array.isArray(city[key]));
    check(arraysValid, `${label}: missing series or flags`);
    if (missing.length || !arraysValid) { completeCities = false; continue; }
    check(typeof city.id === "string" && city.id.length > 0, `${label}: missing city id`);
    check(!ids.has(city.id), `duplicate city id ${city.id}`);
    ids.add(city.id);
    check(typeof city.istatCode === "string" && /^\d{6}$/.test(city.istatCode), `${label}: invalid ISTAT code`);
    check(!codes.has(city.istatCode), `duplicate ISTAT code ${city.istatCode}`);
    codes.add(city.istatCode);
    check(score(city.score), `${label}: score out of range`);
    const ranksValid = rankRange(city.rankRange, payload.cities.length);
    check(ranksValid, `${label}: invalid rank range`);
    if (!ranksValid) completeCities = false;
    for (const pillar of PILLARS) {
      const value = city.pillarScores[pillar.id];
      check(value === null || score(value), `${label}: pillar ${pillar.id} missing or out of range`);
      if (pillar.defaultWeight > 0) check(Number.isFinite(value), `${label}: missing core pillar ${pillar.id}`);
    }
    const composite = weightedMean(PILLARS.map((pillar) => ({ value: city.pillarScores[pillar.id], weight: payload.defaultWeights[pillar.id] })));
    check(composite !== null && Math.abs(composite - city.score) < 1e-5, `${label}: published score does not match public pillar scores`);
    for (const metric of METRICS) {
      const raw = city.metrics[metric.id];
      const normalized = city.metricScores[metric.id];
      const rawValid = raw === null || (metric.normalization === "binary" ? typeof raw === "boolean" : Number.isFinite(raw));
      check(rawValid, `${label}: missing or invalid metric ${metric.id}`);
      check(normalized === null || score(normalized), `${label}: missing or invalid metric score ${metric.id}`);
      check((raw === null) === (normalized === null), `${label}: raw/normalized availability mismatch for ${metric.id}`);
    }
    check(Number.isFinite(city.safety.ratio) && city.safety.ratio > 0 && city.safety.ratio < 10, `${label}: implausible risk ratio`);
    for (const key of ["ratio", "fatalityRatio"]) {
      check(Number.isFinite(city.safety[`${key}Low`]) && Number.isFinite(city.safety[`${key}High`]) && city.safety[`${key}Low`] <= city.safety[key] && city.safety[key] <= city.safety[`${key}High`], `${label}: ${key} outside its interval`);
    }
    check(city.crashSeries.length === payload.national.length, `${label}: crash series length mismatch`);
    check(city.crashSeries.every((entry, index) => object(entry) && entry.year === payload.national[index]?.year), `${label}: crash series years mismatch`);
    check(Number.isFinite(city.lat) && Number.isFinite(city.lon) && Math.abs(city.lat - 42) < 6 && Math.abs(city.lon - 12.5) < 7, `${label}: coordinates outside Italy`);
  }
  if (completeCities) {
    const ordered = [...payload.cities].sort((left, right) => right.score - left.score || String(left.name).localeCompare(String(right.name), "it"));
    check(ordered.every((city, index) => city.rank === index + 1), "published ranks do not match public scores");
    check(csvText === buildCsv(payload), "CSV content out of sync with payload (header, rows or values)");
  }
  const last = payload.national.at(-1);
  check(object(last) && last.cyclistKilled > 100 && last.cyclistKilled < 400, "national cyclist deaths implausible");
  check(object(last) && last.cyclistInjured > 8000 && last.cyclistInjured < 30000, "national cyclist injuries implausible");
  check(payload.national.every((entry, index) => object(entry) && Number.isInteger(entry.year) && (index === 0 || entry.year > payload.national[index - 1]?.year)), "national years must be distinct and increasing");
  const exponent = payload.findings.safetyInNumbersExponent;
  check(Number.isFinite(exponent) && exponent > 0 && exponent < 1.2, `safety-in-numbers exponent implausible (${exponent})`);
  return failures;
}

async function main() {
  const payload = JSON.parse(await readFile(path.join(PUBLIC_DATA_DIR, "ranking.json"), "utf8"));
  const csv = await readFile(path.join(PUBLIC_DATA_DIR, "ranking.csv"), "utf8");
  const failures = validatePayload(payload, csv);
  if (failures.length) {
    console.error(`Validation failed:\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`Dataset valid: ${payload.cities.length} cities, ${payload.metrics.length} metrics.`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
