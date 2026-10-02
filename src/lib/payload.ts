import type { RankingPayload } from "../types";
import { MAX_WEIGHT, PILLAR_ORDER } from "./scoring";

type JsonRecord = Record<string, unknown>;

function fail(path: string, expected: string): never {
  throw new Error(`Dataset non valido: ${path} (${expected})`);
}
function record(value: unknown, path: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "oggetto richiesto");
  return value as JsonRecord;
}
function text(value: unknown, path: string, nonempty = true): asserts value is string {
  if (typeof value !== "string" || (nonempty && !value.trim())) fail(path, "testo richiesto");
}
function numeric(value: unknown, path: string, min = -Infinity, max = Infinity, integer = false): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    fail(path, "numero finito nell'intervallo richiesto");
  }
}
function boolean(value: unknown, path: string): void {
  if (typeof value !== "boolean") fail(path, "booleano richiesto");
}
function list(value: unknown, path: string, nonempty = false): unknown[] {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) fail(path, "elenco richiesto");
  return value;
}
function strings(value: unknown, path: string): string[] {
  return list(value, path).map((entry, index) => {
    text(entry, `${path}[${index}]`);
    return entry;
  });
}
function oneOf(value: unknown, choices: readonly string[], path: string): void {
  if (typeof value !== "string" || !choices.includes(value)) fail(path, `valore ammesso: ${choices.join(", ")}`);
}
function fields(object: JsonRecord, names: string[], path: string, min = -Infinity, max = Infinity, integer = false): void {
  for (const name of names) numeric(object[name], `${path}.${name}`, min, max, integer);
}
function nullableNumber(value: unknown, path: string, min = -Infinity, max = Infinity): void {
  if (value !== null) numeric(value, path, min, max);
}
function interval(value: unknown, path: string, min = -Infinity, max = Infinity): [number, number] {
  const entries = list(value, path);
  if (entries.length !== 2) fail(path, "due estremi richiesti");
  numeric(entries[0], `${path}[0]`, min, max);
  numeric(entries[1], `${path}[1]`, min, max);
  if (entries[0] > entries[1]) fail(path, "estremi in ordine crescente");
  return entries as [number, number];
}
function riskModel(value: unknown, path: string): void {
  const model = record(value, path);
  text(model.period, `${path}.period`);
  fields(model, ["intercept", "exponent"], path);
  fields(model, ["exponentSe", "dispersion", "priorAlpha"], path, 0);
}
function unique(values: string[], path: string): void {
  if (new Set(values).size !== values.length) fail(path, "identificatori duplicati");
}

/** Validate every section consumed by the UI, before any component renders it. */
export function parseRankingPayload(value: unknown): RankingPayload {
  const payload = record(value, "JSON");
  if (payload.schemaVersion !== 2) fail("schemaVersion", `${String(payload.schemaVersion)} non supportata`);
  for (const key of ["title", "summary", "generatedAt"]) text(payload[key], key);
  if (!Number.isFinite(Date.parse(payload.generatedAt as string))) fail("generatedAt", "data non valida");
  strings(payload.limitations, "limitations");
  const cities = list(payload.cities, "cities", true);
  numeric(payload.cityCount, "cityCount", 1, Infinity, true);
  if (payload.cityCount !== cities.length) fail("cityCount", "diverso dal numero di città");

  const weights = record(payload.defaultWeights, "defaultWeights");
  let weightTotal = 0;
  for (const id of PILLAR_ORDER) {
    numeric(weights[id], `defaultWeights.${id}`, 0, MAX_WEIGHT);
    weightTotal += weights[id];
  }
  if (weightTotal <= 0) fail("defaultWeights", "almeno un peso positivo richiesto");
  const pillars = list(payload.pillars, "pillars", true).map((entry, index) => {
    const path = `pillars[${index}]`;
    const pillar = record(entry, path);
    oneOf(pillar.id, PILLAR_ORDER, `${path}.id`);
    for (const key of ["label", "shortLabel", "description"]) text(pillar[key], `${path}.${key}`);
    numeric(pillar.defaultWeight, `${path}.defaultWeight`, 0, MAX_WEIGHT);
    if (pillar.defaultWeight !== weights[pillar.id as string]) fail(path, "peso diverso da defaultWeights");
    return pillar.id as string;
  });
  unique(pillars, "pillars");
  if (pillars.length !== PILLAR_ORDER.length) fail("pillars", "sei pilastri richiesti");

  const sourceIds = list(payload.sources, "sources", true).map((entry, index) => {
    const path = `sources[${index}]`;
    const source = record(entry, path);
    for (const key of ["id", "title", "publisher", "url", "license", "period", "notes"]) text(source[key], `${path}.${key}`, key !== "notes");
    if (!/^https?:\/\//i.test(source.url as string)) fail(`${path}.url`, "URL HTTP o HTTPS richiesto");
    return source.id as string;
  });
  unique(sourceIds, "sources");
  const metrics = list(payload.metrics, "metrics", true).map((entry, index) => {
    const path = `metrics[${index}]`;
    const metric = record(entry, path);
    for (const key of ["id", "label", "shortLabel", "unit", "period", "description"]) text(metric[key], `${path}.${key}`);
    oneOf(metric.pillar, PILLAR_ORDER, `${path}.pillar`);
    oneOf(metric.direction, ["higher", "lower"], `${path}.direction`);
    oneOf(metric.normalization, ["riskRatio", "robust", "binary"], `${path}.normalization`);
    if (metric.transform !== undefined) oneOf(metric.transform, ["log", "log1p"], `${path}.transform`);
    numeric(metric.weight, `${path}.weight`, 0, 1);
    numeric(metric.digits, `${path}.digits`, 0, 10, true);
    const cited = strings(metric.sourceIds, `${path}.sourceIds`);
    if (!cited.length || cited.some((id) => !sourceIds.includes(id))) fail(`${path}.sourceIds`, "fonte mancante o sconosciuta");
    return metric;
  });
  const metricIds = metrics.map((metric) => metric.id as string);
  unique(metricIds, "metrics");

  const model = record(payload.model, "model");
  text(model.description, "model.description");
  riskModel(model.injury, "model.injury");
  riskModel(model.fatality, "model.fatality");
  const sensitivity = record(model.sensitivity, "model.sensitivity");
  numeric(sensitivity.draws, "model.sensitivity.draws", 1, Infinity, true);
  numeric(sensitivity.concentration, "model.sensitivity.concentration", Number.MIN_VALUE);
  interval(sensitivity.interval, "model.sensitivity.interval", 0, 1);
  if (sensitivity.description !== undefined) text(sensitivity.description, "model.sensitivity.description");
  if (model.interval !== undefined) {
    const conditional = record(model.interval, "model.interval");
    numeric(conditional.level, "model.interval.level", 0, 1);
    text(conditional.description, "model.interval.description");
  }
  if (model.standardErrorMethod !== undefined) text(model.standardErrorMethod, "model.standardErrorMethod");
  if (model.exposureSensitivity !== undefined) {
    const exposure = record(model.exposureSensitivity, "model.exposureSensitivity");
    interval(exposure.multipliers, "model.exposureSensitivity.multipliers", Number.MIN_VALUE);
    text(exposure.description, "model.exposureSensitivity.description");
  }

  const national = list(payload.national, "national", true).map((entry, index) => {
    const path = `national[${index}]`;
    const year = record(entry, path);
    fields(year, ["year", "cyclistKilled", "cyclistInjured", "ebikeCasualties", "escooterCasualties", "allKilled", "allInjured", "capitalsCyclistCasualties"], path, 0, Infinity, true);
    return year;
  });
  const years = national.map((entry) => entry.year as number);
  if (years.some((year, index) => index > 0 && year <= years[index - 1])) fail("national", "anni non in ordine crescente");

  const findings = record(payload.findings, "findings");
  fields(findings, ["lastYear", "cyclistKilledLastYear", "cyclistInjuredLastYear"], "findings", 0, Infinity, true);
  fields(findings, ["cyclistKilledPreAverage", "cyclistKilledRecentAverage", "cyclistInjuredPreAverage", "cyclistInjuredRecentAverage", "casualtiesPerProxyWhenDoubling", "casualtiesWhenDoubling"], "findings", 0);
  fields(findings, ["ebikeShareFirst", "ebikeShareLast", "capitalsShareOfCyclistCasualties"], "findings", 0, 1);
  fields(findings, ["safetyInNumbersExponent"], "findings");
  interval(findings.safetyInNumbersCi, "findings.safetyInNumbersCi");
  fields(findings, ["perResidentVsBikeShareCorrelation", "lanesVsRiskCorrelation", "lanesVsBikeShareCorrelation", "roadCasualtiesVsRiskCorrelation", "carsVsRiskCorrelation"], "findings", -1, 1);
  if (findings.lastYear !== years.at(-1)) fail("findings.lastYear", "diverso dall'ultimo anno nazionale");
  const profile = record(findings.profile, "findings.profile");
  text(profile.period, "findings.profile.period");
  fields(profile, ["casualties", "killed"], "findings.profile", 0, Infinity, true);
  fields(profile, ["carShare", "heavyShare", "aloneShare", "hitAndRunShare", "intersectionShare", "over64ShareOfCasualties", "over64ShareOfDeaths", "nightShare"], "findings.profile", 0, 1);
  for (const [key, length] of [["hours", 24], ["weekdays", 7]] as const) {
    const entries = list(profile[key], `findings.profile.${key}`);
    if (entries.length !== length) fail(`findings.profile.${key}`, `${length} valori richiesti`);
    entries.forEach((count, index) => numeric(count, `findings.profile.${key}[${index}]`, 0, Infinity, true));
  }
  const opponents = record(profile.opponents, "findings.profile.opponents");
  for (const [id, count] of Object.entries(opponents)) numeric(count, `findings.profile.opponents.${id}`, 0, Infinity, true);
  for (const [index, entry] of list(findings.macroAreas, "findings.macroAreas", true).entries()) {
    const path = `findings.macroAreas[${index}]`;
    const area = record(entry, path);
    text(area.area, `${path}.area`);
    numeric(area.cities, `${path}.cities`, 1, cities.length, true);
    fields(area, ["medianBikeShare", "medianRiskRatio", "medianLethalityIndex"], path, 0);
    numeric(area.medianScore, `${path}.medianScore`, 0, 100);
  }

  const cityIds: string[] = [];
  const codes: string[] = [];
  const ranks: number[] = [];
  for (const [index, entry] of cities.entries()) {
    const path = `cities[${index}]`;
    const city = record(entry, path);
    for (const key of ["id", "name", "officialName", "istatCode", "region", "area"]) text(city[key], `${path}.${key}`);
    cityIds.push(city.id as string);
    if (!/^\d{6}$/.test(city.istatCode as string)) fail(`${path}.istatCode`, "codice a sei cifre richiesto");
    codes.push(city.istatCode as string);
    oneOf(city.macroArea, ["Nord", "Centro", "Mezzogiorno"], `${path}.macroArea`);
    oneOf(city.sizeClass, ["grande", "media", "piccola"], `${path}.sizeClass`);
    boolean(city.metropolitanCapital, `${path}.metropolitanCapital`);
    numeric(city.population, `${path}.population`, 1, Infinity, true);
    numeric(city.populationYear, `${path}.populationYear`, 1900, 2200, true);
    numeric(city.lat, `${path}.lat`, -90, 90);
    numeric(city.lon, `${path}.lon`, -180, 180);
    numeric(city.score, `${path}.score`, 0, 100);
    numeric(city.rank, `${path}.rank`, 1, cities.length, true);
    ranks.push(city.rank);
    interval(city.rankRange, `${path}.rankRange`, 1, cities.length).forEach((rank) => numeric(rank, `${path}.rankRange`, 1, cities.length, true));
    const pillarScores = record(city.pillarScores, `${path}.pillarScores`);
    for (const id of PILLAR_ORDER) nullableNumber(pillarScores[id], `${path}.pillarScores.${id}`, 0, 100);
    const raw = record(city.metrics, `${path}.metrics`);
    const normalized = record(city.metricScores, `${path}.metricScores`);
    for (const metric of metrics) {
      const id = metric.id as string;
      if (raw[id] !== null && metric.normalization === "binary") boolean(raw[id], `${path}.metrics.${id}`);
      else nullableNumber(raw[id], `${path}.metrics.${id}`);
      nullableNumber(normalized[id], `${path}.metricScores.${id}`, 0, 100);
      if ((raw[id] === null) !== (normalized[id] === null)) fail(`${path}.metricScores.${id}`, "disponibilità diversa dal dato grezzo");
    }
    const safety = record(city.safety, `${path}.safety`);
    for (const key of ["period", "deathsPeriod"]) text(safety[key], `${path}.safety.${key}`);
    fields(safety, ["casualties", "deaths"], `${path}.safety`, 0, Infinity, true);
    fields(safety, ["casualtiesPerYear", "rawRatio", "lethalityIndex", "perResident100k", "perBikeCommuter1000", "ratioLow", "fatalityRatioLow"], `${path}.safety`, 0);
    fields(safety, ["expected", "expectedDeaths", "ratio", "ratioHigh", "fatalityRatio", "fatalityRatioHigh"], `${path}.safety`, Number.MIN_VALUE);
    for (const prefix of ["ratio", "fatalityRatio"]) {
      if ((safety[`${prefix}Low`] as number) > (safety[prefix] as number) || (safety[prefix] as number) > (safety[`${prefix}High`] as number)) fail(`${path}.safety.${prefix}`, "fuori dall'intervallo");
    }
    const series = list(city.crashSeries, `${path}.crashSeries`, true);
    if (series.length !== years.length) fail(`${path}.crashSeries`, "anni diversi dalla serie nazionale");
    series.forEach((entry, yearIndex) => {
      const year = record(entry, `${path}.crashSeries[${yearIndex}]`);
      fields(year, ["year", "killed", "injured", "ebike", "escooter"], `${path}.crashSeries[${yearIndex}]`, 0, Infinity, true);
      if (year.year !== years[yearIndex]) fail(`${path}.crashSeries[${yearIndex}].year`, "anno diverso dalla serie nazionale");
    });
    const cityProfile = record(city.crashProfile, `${path}.crashProfile`);
    text(cityProfile.period, `${path}.crashProfile.period`);
    fields(cityProfile, ["casualties", "killed"], `${path}.crashProfile`, 0, Infinity, true);
    for (const id of ["intersectionShare", "carShare", "heavyShare", "aloneShare", "hitAndRunShare", "over64Share", "nightShare", "ebikeShare"]) nullableNumber(cityProfile[id], `${path}.crashProfile.${id}`, 0, 1);
    list(city.cycleLaneSeries, `${path}.cycleLaneSeries`).forEach((entry, yearIndex) => {
      const year = record(entry, `${path}.cycleLaneSeries[${yearIndex}]`);
      numeric(year.year, `${path}.cycleLaneSeries[${yearIndex}].year`, 1900, 2200, true);
      nullableNumber(year.km, `${path}.cycleLaneSeries[${yearIndex}].km`, 0);
    });
    const context = record(city.context, `${path}.context`);
    fields(context, ["bikeCommuters2011", "commuters2011", "cars"], `${path}.context`, 0, Infinity, true);
    fields(context, ["carsPer100Raw"], `${path}.context`, 0);
    numeric(context.carCommuteShare2011, `${path}.context.carCommuteShare2011`, 0, 100);
    nullableNumber(context.cycleLaneDensity, `${path}.context.cycleLaneDensity`, 0);
    for (const id of ["ztl", "pedestrianArea", "zone30Expanding"]) boolean(context[id], `${path}.context.${id}`);
    if (context.osm !== null) {
      const osm = record(context.osm, `${path}.context.osm`);
      fields(osm, ["separatedKm", "paintedLaneKm", "roadKm", "bikeParking"], `${path}.context.osm`, 0);
      numeric(osm.maxspeedTagCoverage, `${path}.context.osm.maxspeedTagCoverage`, 0, 1);
      if (osm.timestamp !== null) text(osm.timestamp, `${path}.context.osm.timestamp`);
    }
    strings(city.flags, `${path}.flags`);
    if (city.dataCoverage !== undefined) {
      const coverage = record(city.dataCoverage, `${path}.dataCoverage`);
      fields(coverage, ["metricsAvailable", "metricsTotal"], `${path}.dataCoverage`, 0, metrics.length, true);
      nullableNumber(coverage.defaultWeightedCoverage, `${path}.dataCoverage.defaultWeightedCoverage`, 0, 1);
      const pillarCoverage = record(coverage.pillarCoverage, `${path}.dataCoverage.pillarCoverage`);
      for (const id of PILLAR_ORDER) nullableNumber(pillarCoverage[id], `${path}.dataCoverage.pillarCoverage.${id}`, 0, 1);
      const missing = strings(coverage.missingMetricIds, `${path}.dataCoverage.missingMetricIds`);
      if (missing.some((id) => !metricIds.includes(id))) fail(`${path}.dataCoverage.missingMetricIds`, "metrica sconosciuta");
      unique(missing, `${path}.dataCoverage.missingMetricIds`);
      const actualMissing = metricIds.filter((id) => normalized[id] === null);
      if (coverage.metricsTotal !== metrics.length || coverage.metricsAvailable !== metrics.length - actualMissing.length ||
          missing.length !== actualMissing.length || actualMissing.some((id) => !missing.includes(id))) {
        fail(`${path}.dataCoverage`, "conteggi diversi dalle metriche disponibili");
      }
      for (const id of PILLAR_ORDER) {
        const weighted = metrics.filter((metric) => metric.pillar === id && (metric.weight as number) > 0);
        const total = weighted.reduce((sum, metric) => sum + (metric.weight as number), 0);
        const available = weighted.filter((metric) => normalized[metric.id as string] !== null).reduce((sum, metric) => sum + (metric.weight as number), 0);
        const expected = total > 0 ? available / total : null;
        if ((expected === null && pillarCoverage[id] !== null) || (expected !== null && (pillarCoverage[id] === null || Math.abs((pillarCoverage[id] as number) - expected) > 1e-6))) {
          fail(`${path}.dataCoverage.pillarCoverage.${id}`, "copertura diversa dai dati disponibili");
        }
      }
    }
    if (city.exposureRankRange !== undefined) interval(city.exposureRankRange, `${path}.exposureRankRange`, 1, cities.length);
    if (safety.exposureScenarios !== undefined) list(safety.exposureScenarios, `${path}.safety.exposureScenarios`).forEach((entry, scenarioIndex) => {
      const scenarioPath = `${path}.safety.exposureScenarios[${scenarioIndex}]`;
      const scenario = record(entry, scenarioPath);
      fields(scenario, ["multiplier", "ratio", "fatalityRatio"], scenarioPath, Number.MIN_VALUE);
      numeric(scenario.score, `${scenarioPath}.score`, 0, 100);
      numeric(scenario.rank, `${scenarioPath}.rank`, 1, cities.length, true);
    });
  }
  unique(cityIds, "cities.id");
  unique(codes, "cities.istatCode");
  if (new Set(ranks).size !== cities.length) fail("cities.rank", "posizioni duplicate");
  return payload as unknown as RankingPayload;
}
