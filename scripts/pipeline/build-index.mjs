/**
 * Build the public dataset from the intermediate extracts:
 *  1. descriptive cyclist casualty model (Poisson + empirical Bayes),
 *  2. metric normalization and pillar scores,
 *  3. composite index, Monte Carlo weight sensitivity,
 *  4. headline findings computed from the same data shown in the dashboard.
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  CRASH_FIRST_YEAR,
  CRASH_LAST_YEAR,
  FATALITY_YEARS,
  INTERMEDIATE_DIR,
  PUBLIC_DATA_DIR,
  RECENT_YEARS
} from "./config.mjs";
import {
  DEFAULT_WEIGHTS,
  LOWER_PERCENTILE,
  METRICS,
  MIN_MAXSPEED_TAG_COVERAGE,
  PILLARS,
  UPPER_PERCENTILE,
  riskRatioScore,
  transformValue,
  weightedCoverage,
  weightedMean
} from "./methodology.mjs";
import {
  empiricalBayesRatio,
  estimateGammaPrior,
  mean,
  poissonRegression,
  quantile,
  quantileSorted,
  round,
  sampleDirichlet,
  seededRandom,
  spearman,
  sum
} from "./lib/stats.mjs";
import { SOURCES } from "./sources.mjs";
import { buildCsv } from "./csv.mjs";
import { readJson, writeJson, writeText } from "./lib/text.mjs";

const SENSITIVITY_DRAWS = 2000;
const SENSITIVITY_CONCENTRATION = 20;
const EXPOSURE_MULTIPLIERS = [0.5, 2];

async function readOptionalJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/** Person-years between 1 January of the first year and 1 January after the last year. */
export function personYears(population, years) {
  return sum(
    years.map((year) => {
      const start = population[year];
      const end = population[year + 1];
      if (!Number.isFinite(start) || start <= 0 || !Number.isFinite(end) || end <= 0) {
        throw new Error(`Missing positive annual population for ${year} or ${year + 1}; person-years cannot be backfilled`);
      }
      return (start + end) / 2;
    })
  );
}

/** Fit casualties ~ Poisson(personYears · exp(a) · bikeShare^b) and shrink city ratios. */
export function fitRiskModel(rows) {
  if (rows.some((row) => !Number.isInteger(row.observed) || row.observed < 0 ||
      !Number.isFinite(row.personYears) || row.personYears <= 0 ||
      !Number.isFinite(row.bikeShare) || row.bikeShare <= 0 || row.bikeShare > 1)) {
    throw new Error("Risk model requires nonnegative counts, positive person-years and observed bike shares in (0, 1]");
  }
  const X = rows.map((row) => [1, Math.log(row.bikeShare)]);
  const y = rows.map((row) => row.observed);
  const offset = rows.map((row) => Math.log(row.personYears));
  const fit = poissonRegression(X, y, offset);
  const alpha = estimateGammaPrior(y, fit.fitted);
  const estimates = rows.map((row, index) => ({
    ...empiricalBayesRatio(row.observed, fit.fitted[index], alpha),
    expected: fit.fitted[index],
    observed: row.observed
  }));
  return {
    intercept: fit.coefficients[0],
    exponent: fit.coefficients[1],
    exponentSe: fit.standardErrors[1],
    dispersion: fit.dispersion,
    alpha,
    estimates
  };
}

function robustScaler(values, direction, transform) {
  const transformed = values.map((value) => transformValue(value, transform)).filter(Number.isFinite);
  const sorted = [...transformed].sort((a, b) => a - b);
  const low = quantileSorted(sorted, LOWER_PERCENTILE);
  const high = quantileSorted(sorted, UPPER_PERCENTILE);
  return (value) => {
    const x = transformValue(value, transform);
    if (x === null) return null;
    if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
    if (high === low) return 50;
    const scaled = Math.min(100, Math.max(0, ((x - low) / (high - low)) * 100));
    return direction === "lower" ? 100 - scaled : scaled;
  };
}

export function scoreMetric(metric, values) {
  if (metric.normalization === "riskRatio") return values.map(riskRatioScore);
  if (metric.normalization === "binary") return values.map((value) => value === true ? 100 : value === false ? 0 : null);
  const scale = robustScaler(values, metric.direction, metric.transform);
  return values.map(scale);
}

export function compositeScore(pillarScores, weights) {
  return weightedMean(
    Object.entries(weights).map(([pillar, weight]) => ({ value: pillarScores[pillar], weight }))
  );
}

export function rankBy(values, names = values.map((_, index) => String(index))) {
  const order = values.map((value, index) => ({ value, index })).filter((entry) => Number.isFinite(entry.value))
    .sort((a, b) => b.value - a.value || names[a.index].localeCompare(names[b.index], "it"));
  const ranks = new Array(values.length).fill(null);
  order.forEach((entry, position) => {
    ranks[entry.index] = position + 1;
  });
  return ranks;
}

function crashSum(byYear, years, field) {
  return sum(years.map((year) => {
    const count = byYear[year]?.[field];
    if (!Number.isInteger(count) || count < 0) throw new Error(`Missing or invalid crash count: ${year} ${field}`);
    return count;
  }));
}

function share(part, total) {
  return total > 0 ? part / total : null;
}

/** A sensitivity scenario for one city's historical exposure proxy; no model refit. */
export function exposureRatio(observed, expected, alpha, exponent, multiplier) {
  if (!Number.isFinite(observed) || observed < 0 || !Number.isFinite(expected) || expected <= 0 ||
      !Number.isFinite(alpha) || alpha <= 0 || !Number.isFinite(multiplier) || multiplier <= 0 || !Number.isFinite(exponent)) {
    throw new Error("Exposure sensitivity requires valid counts, positive expectation/prior/multiplier and finite exponent");
  }
  return (alpha + observed) / (alpha + expected * multiplier ** exponent);
}

export function dataCoverage(scores, weights = DEFAULT_WEIGHTS) {
  const pillarCoverage = Object.fromEntries(PILLARS.map((pillar) => [
    pillar.id,
    weightedCoverage(METRICS.filter((metric) => metric.pillar === pillar.id).map((metric) => ({
      value: scores[metric.id], weight: metric.weight
    })))
  ]));
  const missingMetricIds = METRICS.filter((metric) => !Number.isFinite(scores[metric.id])).map((metric) => metric.id);
  return {
    metricsAvailable: METRICS.length - missingMetricIds.length,
    metricsTotal: METRICS.length,
    pillarCoverage,
    missingMetricIds,
    defaultWeightedCoverage: weightedMean(Object.entries(weights).map(([id, weight]) => ({ value: pillarCoverage[id], weight })))
  };
}

async function main() {
  const dir = INTERMEDIATE_DIR;
  const cities = await readJson(path.join(dir, "cities.json"));
  const crashes = await readJson(path.join(dir, "crashes.json"));
  const commuting = await readJson(path.join(dir, "commuting-2011.json"));
  const environment = await readJson(path.join(dir, "istat-urban-environment.json"));
  const vehicles = await readJson(path.join(dir, "vehicles.json"));
  const osm = (await readOptionalJson(path.join(dir, "osm-infrastructure.json")))?.cities ?? {};
  const allYears = Array.from({ length: CRASH_LAST_YEAR - CRASH_FIRST_YEAR + 1 }, (_, i) => CRASH_FIRST_YEAR + i);

  // 1. Risk model inputs.
  const rows = cities.map((city) => {
    const byYear = crashes.cities[city.id].byYear;
    const residents = commuting.cities[city.id].residents;
    const bikeShare = residents.bike / residents.total;
    const recentPersonYears = personYears(city.population, RECENT_YEARS);
    const longPersonYears = personYears(city.population, FATALITY_YEARS);
    return {
      city,
      bikeShare,
      injuries: crashSum(byYear, RECENT_YEARS, "cyclistKilled") + crashSum(byYear, RECENT_YEARS, "cyclistInjured"),
      deaths: crashSum(byYear, FATALITY_YEARS, "cyclistKilled"),
      recentPersonYears,
      longPersonYears,
      allCasualties: crashSum(byYear, RECENT_YEARS, "allKilled") + crashSum(byYear, RECENT_YEARS, "allInjured"),
      urbanKilledLong: crashSum(byYear, FATALITY_YEARS, "urbanKilled"),
      urbanInjuredLong: crashSum(byYear, FATALITY_YEARS, "urbanInjured"),
      bikeCommuters: residents.bike + commuting.cities[city.id].inboundBike
    };
  });
  const injuryModel = fitRiskModel(
    rows.map((row) => ({ observed: row.injuries, personYears: row.recentPersonYears, bikeShare: row.bikeShare }))
  );
  const fatalityModel = fitRiskModel(
    rows.map((row) => ({ observed: row.deaths, personYears: row.longPersonYears, bikeShare: row.bikeShare }))
  );

  // 2. Raw metric values.
  const raw = rows.map((row, index) => {
    const { city } = row;
    const env = environment.cities[city.id];
    const lanes = env.cycleLaneKm;
    // Align 2024 infrastructure with that year's average resident population.
    const population = personYears(city.population, [2024]);
    const osmCity = osm[city.id];
    const separatedKm = osmCity ? osmCity.separatedNetworkKm : null;
    const tagCoverage = osmCity && osmCity.roadKm > 0 ? osmCity.knownSpeedRoadKm / osmCity.roadKm : null;
    const vehicle = vehicles.cities[city.id];
    return {
      injuryRiskRatio: injuryModel.estimates[index].ratio,
      fatalityRiskRatio: fatalityModel.estimates[index].ratio,
      cycleLanesPer10k: Number.isFinite(lanes[2024]) ? (lanes[2024] / population) * 1e4 : null,
      cycleLaneGrowthPer10k:
        Number.isFinite(lanes[2024]) && Number.isFinite(lanes[2019])
          ? ((lanes[2024] - lanes[2019]) / population) * 1e4
          : null,
      osmSeparatedNetworkShare: osmCity && osmCity.roadKm > 0 ? (separatedKm / osmCity.roadKm) * 100 : null,
      carsPer100: vehicle.reliable ? vehicle.carsPer100 : null,
      roadCasualtiesPer1000: (row.allCasualties / row.recentPersonYears) * 1000,
      osmSlowStreetShare:
        tagCoverage !== null && tagCoverage >= MIN_MAXSPEED_TAG_COVERAGE
          ? (osmCity.slowStreetKm / osmCity.knownSpeedRoadKm) * 100
          : null,
      zone30: env.zone30In2024,
      bikeCommuteShare: (commuting.cities[city.id].residents.bike / commuting.cities[city.id].residents.total) * 100,
      bikeSharingPer10k: env.bikeSharingPer10k[2024] ?? null,
      transitPassengersPerCapita: env.transitPassengersPerCapita[2024],
      transitSeatKmPerCapita: env.transitSeatKmPerCapita[2024],
      pm10: env.air2024?.pm10 ?? null,
      no2: env.air2024?.no2 ?? null
    };
  });

  // 3. Normalized metric scores and pillar scores.
  const metricScores = raw.map(() => ({}));
  for (const metric of METRICS) {
    const scores = scoreMetric(metric, raw.map((entry) => entry[metric.id]));
    scores.forEach((score, index) => {
      metricScores[index][metric.id] = round(score, 6);
    });
  }
  const pillarScores = metricScores.map((scores) =>
    Object.fromEntries(
      PILLARS.map((pillar) => [
        pillar.id,
        round(weightedMean(
          METRICS.filter((metric) => metric.pillar === pillar.id).map((metric) => ({
            value: scores[metric.id],
            weight: metric.weight
          }))
        ), 6)
      ])
    )
  );
  const composite = pillarScores.map((scores) => compositeScore(scores, DEFAULT_WEIGHTS));
  const cityNames = cities.map((city) => city.name);
  const ranks = rankBy(composite, cityNames);
  if (composite.some((score) => !Number.isFinite(score))) throw new Error("Missing weighted pillars: cannot publish a complete ranking");
  const coverage = metricScores.map((scores) => dataCoverage(scores));
  const exposureScenarios = rows.map((row, index) => EXPOSURE_MULTIPLIERS.map((multiplier) => {
    const ratio = exposureRatio(row.injuries, injuryModel.estimates[index].expected, injuryModel.alpha, injuryModel.exponent, multiplier);
    const fatalityRatio = exposureRatio(row.deaths, fatalityModel.estimates[index].expected, fatalityModel.alpha, fatalityModel.exponent, multiplier);
    const scenarioSafety = weightedMean(METRICS.filter((metric) => metric.pillar === "safety").map((metric) => ({
      value: riskRatioScore(metric.id === "injuryRiskRatio" ? ratio : fatalityRatio), weight: metric.weight
    })));
    const score = compositeScore({ ...pillarScores[index], safety: scenarioSafety }, DEFAULT_WEIGHTS);
    const scenarioRanks = rankBy(composite.map((baseline, cityIndex) => cityIndex === index ? score : baseline), cityNames);
    return { multiplier, ratio: round(ratio, 3), fatalityRatio: round(fatalityRatio, 3), score: round(score, 6), rank: scenarioRanks[index] };
  }));

  // 4. Weight sensitivity: Dirichlet draws around the default pillar weights.
  const activePillars = PILLARS.filter((pillar) => DEFAULT_WEIGHTS[pillar.id] > 0).map((pillar) => pillar.id);
  const random = seededRandom(20261001);
  const rankDraws = cities.map(() => []);
  for (let draw = 0; draw < SENSITIVITY_DRAWS; draw += 1) {
    const sampled = sampleDirichlet(
      activePillars.map((id) => DEFAULT_WEIGHTS[id]),
      SENSITIVITY_CONCENTRATION,
      random
    );
    const weights = Object.fromEntries(activePillars.map((id, index) => [id, sampled[index]]));
    const drawRanks = rankBy(pillarScores.map((scores) => compositeScore(scores, weights)), cityNames);
    drawRanks.forEach((rank, index) => rankDraws[index].push(rank));
  }

  // Reporting check: deaths are almost always recorded, minor injuries are not.
  // Urban roads only, so large municipalities with long extra-urban roads are not penalized.
  // Reference: pooled urban lethality of all capoluoghi.
  const capitalsLethality =
    sum(rows.map((row) => row.urbanKilledLong)) / sum(rows.map((row) => row.urbanKilledLong + row.urbanInjuredLong));
  const lethalityIndex = rows.map(
    (row) => row.urbanKilledLong / (row.urbanKilledLong + row.urbanInjuredLong) / capitalsLethality
  );

  // 5. City records.
  const recentLabel = `${RECENT_YEARS[0]}–${RECENT_YEARS.at(-1)}`;
  const cityRecords = rows.map((row, index) => {
    const { city } = row;
    const byYear = crashes.cities[city.id].byYear;
    const profile = crashes.cities[city.id].profile;
    const env = environment.cities[city.id];
    const osmCity = osm[city.id] ?? null;
    const sortedRanks = [...rankDraws[index]].sort((a, b) => a - b);
    const flags = [];
    if (row.injuries < 15) flags.push("Pochi ciclisti morti e feriti registrati: il rapporto è incerto e ricondotto verso la media.");
    if (!vehicles.cities[city.id].reliable)
      flags.push(
        `Tasso di motorizzazione non utilizzato: ${round(vehicles.cities[city.id].carsPer100, 0)} auto ogni 100 abitanti, oltre la soglia editoriale di 95; possibili distorsioni da flotte e società di noleggio.`
      );
    if (row.bikeShare * 100 < 0.5) flags.push("Nel 2011 meno dello 0,5% dei pendolari usava la bici: il proxy storico è basso e non descrive l'esposizione attuale.");
    if (env.cycleLaneNotes.length) flags.push(`Piste ciclabili ISTAT: ${env.cycleLaneNotes.join(" ")}`);
    for (const [label, notes] of [
      ["Bike sharing ISTAT", env.bikeSharingNotes],
      ["Domanda TPL ISTAT", env.transitDemandNotes],
      ["Offerta TPL ISTAT", env.transitSupplyNotes],
      ["Zone urbane ISTAT", env.zoneNotes]
    ]) {
      if (notes?.length) flags.push(`${label}: ${notes.join(" ")}`);
    }
    if (!osmCity) flags.push("Statistiche OpenStreetMap non disponibili per questo comune.");
    for (const pillar of PILLARS) {
      const available = coverage[index].pillarCoverage[pillar.id];
      if (available !== null && available < 1 && DEFAULT_WEIGHTS[pillar.id] > 0) {
        flags.push(`${pillar.label}: copertura del ${Math.round(available * 100)}% dei pesi previsti; gli indicatori mancanti sono esclusi e i pesi disponibili rinormalizzati.`);
      }
    }

    const injury = injuryModel.estimates[index];
    const fatality = fatalityModel.estimates[index];
    return {
      id: city.id,
      name: city.name,
      officialName: city.officialName,
      istatCode: city.istatCode,
      region: city.region,
      area: city.area,
      macroArea: city.macroArea,
      metropolitanCapital: city.metropolitanCapital,
      sizeClass: city.sizeClass,
      population: city.populationLatest,
      populationYear: city.populationYear,
      lat: city.lat,
      lon: city.lon,
      score: composite[index],
      rank: ranks[index],
      rankRange: [Math.round(quantileSorted(sortedRanks, 0.05)), Math.round(quantileSorted(sortedRanks, 0.95))],
      exposureRankRange: [Math.min(ranks[index], ...exposureScenarios[index].map((scenario) => scenario.rank)), Math.max(ranks[index], ...exposureScenarios[index].map((scenario) => scenario.rank))],
      dataCoverage: coverage[index],
      pillarScores: pillarScores[index],
      metrics: Object.fromEntries(METRICS.map((metric) => {
        const value = raw[index][metric.id];
        return [metric.id, typeof value === "boolean" ? value : round(value, 4)];
      })),
      metricScores: metricScores[index],
      safety: {
        period: recentLabel,
        casualties: row.injuries,
        casualtiesPerYear: round(row.injuries / RECENT_YEARS.length, 1),
        expected: round(injury.expected, 1),
        ratio: round(injury.ratio, 3),
        ratioLow: round(injury.low, 3),
        ratioHigh: round(injury.high, 3),
        rawRatio: round(injury.raw, 3),
        lethalityIndex: round(lethalityIndex[index], 2),
        perResident100k: round((row.injuries / row.recentPersonYears) * 1e5, 1),
        perBikeCommuter1000: round((row.injuries / RECENT_YEARS.length / Math.max(row.bikeCommuters, 1)) * 1000, 1),
        deaths: row.deaths,
        deathsPeriod: `${FATALITY_YEARS[0]}–${FATALITY_YEARS.at(-1)}`,
        expectedDeaths: round(fatality.expected, 2),
        fatalityRatio: round(fatality.ratio, 3),
        fatalityRatioLow: round(fatality.low, 3),
        fatalityRatioHigh: round(fatality.high, 3),
        exposureScenarios: exposureScenarios[index]
      },
      crashSeries: allYears.map((year) => ({
        year,
        killed: byYear[year].cyclistKilled,
        injured: byYear[year].cyclistInjured,
        ebike: byYear[year].ebikeKilled + byYear[year].ebikeInjured,
        escooter: byYear[year].escooterKilled + byYear[year].escooterInjured
      })),
      crashProfile: {
        period: `${crashes.profileYears[0]}–${crashes.profileYears.at(-1)}`,
        casualties: profile.casualties,
        killed: profile.killed,
        intersectionShare: round(share(profile.atIntersection, profile.casualties), 3),
        carShare: round(share(profile.carInvolved, profile.casualties), 3),
        heavyShare: round(share(profile.heavyInvolved, profile.casualties), 3),
        aloneShare: round(share(profile.opponents.alone, profile.casualties), 3),
        hitAndRunShare: round(share(profile.opponents.hitAndRun, profile.casualties), 3),
        over64Share: round(share(profile.age.over64, profile.casualties - profile.age.unknown), 3),
        nightShare: round(share(profile.night, profile.hourKnown), 3),
        ebikeShare: round(share(profile.ebike, profile.ebikeYearsCasualties), 3)
      },
      cycleLaneSeries: Object.entries(env.cycleLaneKm).map(([year, km]) => ({ year: Number(year), km })),
      context: {
        bikeCommuters2011: commuting.cities[city.id].residents.bike,
        commuters2011: commuting.cities[city.id].residents.total,
        carCommuteShare2011: round(
          (commuting.cities[city.id].residents.car / commuting.cities[city.id].residents.total) * 100,
          1
        ),
        cars: vehicles.cities[city.id].cars,
        carsPer100Raw: round(vehicles.cities[city.id].carsPer100, 1),
        ztl: env.ztl2024,
        pedestrianArea: env.pedestrianArea2024,
        zone30Expanding: env.zone30Expanding2024,
        cycleLaneDensity: env.cycleLaneDensity2024,
        osm: osmCity
          ? {
              separatedKm: round(osmCity.separatedNetworkKm, 1),
              paintedLaneKm: round(osmCity.laneKm, 1),
              roadKm: round(osmCity.roadKm, 0),
              maxspeedTagCoverage: round(osmCity.knownSpeedRoadKm / Math.max(osmCity.roadKm, 1), 3),
              bikeParking: osmCity.bikeParking,
              timestamp: osmCity.osmTimestamp
            }
          : null
      },
      flags
    };
  });

  // 6. National series and findings.
  const nationalSeries = allYears.map((year) => {
    const entry = crashes.national[year];
    const capitals = sum(cities.map((city) => crashes.cities[city.id].byYear[year].cyclistKilled + crashes.cities[city.id].byYear[year].cyclistInjured));
    return {
      year,
      cyclistKilled: entry.cyclistKilled,
      cyclistInjured: entry.cyclistInjured,
      ebikeCasualties: entry.ebikeKilled + entry.ebikeInjured,
      escooterCasualties: entry.escooterKilled + entry.escooterInjured,
      allKilled: entry.allKilled,
      allInjured: entry.allInjured,
      capitalsCyclistCasualties: capitals
    };
  });
  const np = crashes.nationalProfile;
  const avg = (years, field) => mean(nationalSeries.filter((entry) => years.includes(entry.year)).map((entry) => entry[field]));
  const preYears = [2015, 2016, 2017, 2018, 2019];
  const lanesPer10k = raw.map((entry) => entry.cycleLanesPer10k);
  const injuryRatios = raw.map((entry) => entry.injuryRiskRatio);
  const bikeShares = raw.map((entry) => entry.bikeCommuteShare);
  const exponent = injuryModel.exponent;
  const exponentCi = [exponent - 1.96 * injuryModel.exponentSe, exponent + 1.96 * injuryModel.exponentSe];
  const macroAreas = ["Nord", "Centro", "Mezzogiorno"].map((area) => {
    const members = cityRecords.filter((city) => city.macroArea === area);
    return {
      area,
      cities: members.length,
      medianBikeShare: round(quantile(members.map((city) => city.metrics.bikeCommuteShare), 0.5), 2),
      medianRiskRatio: round(quantile(members.map((city) => city.safety.ratio), 0.5), 2),
      medianScore: round(quantile(members.map((city) => city.score), 0.5), 1),
      medianLethalityIndex: round(quantile(members.map((city) => city.safety.lethalityIndex), 0.5), 2)
    };
  });
  const lastYear = nationalSeries.at(-1);
  const recentCapitals = sum(nationalSeries.filter((entry) => RECENT_YEARS.includes(entry.year)).map((entry) => entry.capitalsCyclistCasualties));
  const recentNational = sum(
    nationalSeries.filter((entry) => RECENT_YEARS.includes(entry.year)).map((entry) => entry.cyclistKilled + entry.cyclistInjured)
  );
  const findings = {
    lastYear: lastYear.year,
    cyclistKilledLastYear: lastYear.cyclistKilled,
    cyclistInjuredLastYear: lastYear.cyclistInjured,
    cyclistKilledPreAverage: round(avg(preYears, "cyclistKilled"), 1),
    cyclistKilledRecentAverage: round(avg(RECENT_YEARS, "cyclistKilled"), 1),
    cyclistInjuredPreAverage: round(avg(preYears, "cyclistInjured"), 0),
    cyclistInjuredRecentAverage: round(avg(RECENT_YEARS, "cyclistInjured"), 0),
    ebikeShareFirst: round(nationalSeries.find((entry) => entry.year === 2021).ebikeCasualties / (nationalSeries.find((entry) => entry.year === 2021).cyclistKilled + nationalSeries.find((entry) => entry.year === 2021).cyclistInjured), 3),
    ebikeShareLast: round(lastYear.ebikeCasualties / (lastYear.cyclistKilled + lastYear.cyclistInjured), 3),
    capitalsShareOfCyclistCasualties: round(recentCapitals / recentNational, 3),
    safetyInNumbersExponent: round(exponent, 3),
    safetyInNumbersCi: exponentCi.map((value) => round(value, 3)),
    casualtiesPerProxyWhenDoubling: round(2 ** (exponent - 1), 3),
    casualtiesWhenDoubling: round(2 ** exponent, 3),
    perResidentVsBikeShareCorrelation: round(spearman(cityRecords.map((city) => city.safety.perResident100k), bikeShares), 2),
    lanesVsRiskCorrelation: round(spearman(lanesPer10k, injuryRatios), 2),
    lanesVsBikeShareCorrelation: round(spearman(lanesPer10k, bikeShares), 2),
    roadCasualtiesVsRiskCorrelation: round(spearman(raw.map((entry) => entry.roadCasualtiesPer1000), injuryRatios), 2),
    carsVsRiskCorrelation: round(spearman(raw.map((entry) => entry.carsPer100), injuryRatios), 2),
    profile: {
      period: `${crashes.profileYears[0]}–${crashes.profileYears.at(-1)}`,
      casualties: np.casualties,
      killed: np.killed,
      carShare: round(share(np.carInvolved, np.casualties), 3),
      heavyShare: round(share(np.heavyInvolved, np.casualties), 3),
      aloneShare: round(np.opponents.alone / np.casualties, 3),
      hitAndRunShare: round(np.opponents.hitAndRun / np.casualties, 3),
      intersectionShare: round(np.atIntersection / np.casualties, 3),
      over64ShareOfCasualties: round(np.age.over64 / (np.casualties - np.age.unknown), 3),
      over64ShareOfDeaths: round(share(np.killedOver64, np.killedAgeKnown), 3),
      nightShare: round(np.night / np.hourKnown, 3),
      hours: np.hours,
      weekdays: np.weekdays,
      opponents: np.opponents
    },
    macroAreas
  };

  const model = {
    description:
      "Confronto esplorativo tra capoluoghi: ciclisti morti+feriti ~ Poisson(anni-persona × e^a × quotaPendolariBici2011^b). Rapporto osservati/attesi con prior Gamma(α, α) stimato sui dati (empirical Bayes). La quota del 2011 è un proxy storico: il rapporto non è un rischio per persona, viaggio o km e l'esponente non misura un effetto causale dell'aumento dei ciclisti.",
    standardErrorMethod: "HC1 sandwich su osservazioni comunali indipendenti; intervallo dell'esponente al 95% con approssimazione normale. Non comprende errori del proxy, confondimento o dipendenza geografica.",
    interval: { level: 0.9, description: "Intervalli credibili Poisson-Gamma condizionati al modello, ai casi registrati, al proxy 2011 e ai parametri/prior stimati. Non comprendono incertezza dei parametri, sottonotifica o cambiamento dell'esposizione." },
    exposureSensitivity: {
      multipliers: EXPOSURE_MULTIPLIERS,
      description: "Si dimezza o raddoppia il proxy di esposizione di un solo comune, mantenendo fissi casi, parametri stimati, uso storico, altri indicatori e punteggi degli altri comuni. È una sensibilità ad assunzioni arbitrarie, non un intervallo di probabilità né una previsione; una variazione uniforme con rifit sarebbe assorbita dall'intercetta."
    },
    injury: {
      period: recentLabel,
      intercept: round(injuryModel.intercept, 4),
      exponent: round(injuryModel.exponent, 4),
      exponentSe: round(injuryModel.exponentSe, 4),
      dispersion: round(injuryModel.dispersion, 2),
      priorAlpha: round(injuryModel.alpha, 2)
    },
    fatality: {
      period: `${FATALITY_YEARS[0]}–${FATALITY_YEARS.at(-1)}`,
      intercept: round(fatalityModel.intercept, 4),
      exponent: round(fatalityModel.exponent, 4),
      exponentSe: round(fatalityModel.exponentSe, 4),
      dispersion: round(fatalityModel.dispersion, 2),
      priorAlpha: round(fatalityModel.alpha, 2)
    },
    sensitivity: {
      draws: SENSITIVITY_DRAWS, concentration: SENSITIVITY_CONCENTRATION, interval: [0.05, 0.95],
      description: "Quantili 5°–95° delle posizioni con pesi Dirichlet centrati sui quattro pilastri predefiniti. Concentrazione 20 scelta editoriale; dati e parametri fissi, TPL e aria restano esclusi. Non è un intervallo di confidenza della posizione."
    }
  };

  const north = macroAreas.find((entry) => entry.area === "Nord");
  const south = macroAreas.find((entry) => entry.area === "Mezzogiorno");
  const fatalityWeight = METRICS.find((metric) => metric.id === "fatalityRiskRatio").weight;
  const formatIt = (value) => String(value).replace(".", ",");

  const payload = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    title: "Quanto è sicuro pedalare nei capoluoghi italiani",
    summary:
      "Un indice esplorativo aperto su 110 capoluoghi: morti e feriti registrati (ISTAT 2015–2024), quota storica di pendolari in bici (2011), piste, traffico e bike sharing. Non misura il rischio di un viaggio in bici.",
    cityCount: cityRecords.length,
    defaultWeights: DEFAULT_WEIGHTS,
    pillars: PILLARS,
    metrics: METRICS,
    model,
    findings,
    national: nationalSeries,
    limitations: [
      `Gli incidenti sono quelli rilevati dalle forze dell'ordine: i ferimenti lievi possono non essere denunciati. La mediana della letalità urbana nel Mezzogiorno è ${formatIt(south.medianLethalityIndex)} volte il rapporto aggregato dei capoluoghi, contro ${formatIt(north.medianLethalityIndex)} al Nord. Può dipendere da sottonotifica, gravità, età, velocità e soccorsi: non identifica né quantifica i casi mancanti. I decessi pesano il ${Math.round(fatalityWeight * 100)}% del pilastro sicurezza.`,
      "Il modello usa la quota di pendolari in bici del Censimento 2011 come proxy storico, non un conteggio attuale dei ciclisti né dei km percorsi. Cambiamenti diversi tra città possono alterare rapporti e posizioni: si pubblicano scenari individuali di quota dimezzata/raddoppiata, che non sono intervalli di confidenza.",
      "I pendolari misurano solo una parte degli spostamenti in bici (mancano svago, turismo, consegne).",
      "Gli incidenti sono attribuiti al comune in cui avvengono, anche su strade extraurbane o statali del territorio comunale.",
      "OSM dipende dalla mappatura volontaria e non certifica protezione, continuità o qualità: i due indicatori OSM hanno peso zero e non incidono sulla classifica.",
      "Il rapporto morti+feriti/attesi e le correlazioni tra comuni sono descrittivi, non rischi per viaggio o effetti causali. L'incidentalità generale include i ciclisti: la correlazione con il rapporto ciclisti è in parte una relazione tra un totale e una sua componente.",
      "Gli intervalli al 90% dei rapporti sono condizionati a modello, proxy e prior stimati; non includono l'incertezza della stima dei parametri, gli errori di esposizione o la sottonotifica.",
      "I dati mancanti non sono zero: sono esclusi dalla media del pilastro e i pesi rimanenti rinormalizzati; copertura e indicatori esclusi sono riportati per comune. La comparabilità è minore dove manca un indicatore con peso positivo.",
      "I pesi dei pilastri e la distribuzione Dirichlet sono scelte editoriali: il range di posizione descrive soltanto sensibilità ai pesi predefiniti, con dati fissi, e non l'incertezza statistica della classifica."
    ],
    sources: SOURCES,
    cities: cityRecords.sort((a, b) => a.rank - b.rank)
  };

  await writeJson(path.join(PUBLIC_DATA_DIR, "ranking.json"), payload);
  await writeText(path.join(PUBLIC_DATA_DIR, "ranking.csv"), buildCsv(payload));
  console.log(
    `ranking.json: ${cityRecords.length} città · safety-in-numbers b=${round(exponent, 3)} · top: ${payload.cities
      .slice(0, 5)
      .map((city) => `${city.name} ${round(city.score, 1)}`)
      .join(", ")}`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
