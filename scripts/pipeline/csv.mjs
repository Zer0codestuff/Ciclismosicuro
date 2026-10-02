/** CSV export of the public ranking (one row per city, default weights). */

function csvCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  const text = String(value);
  return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvHeaders(payload) {
  return [
    "rank",
    "rankLow",
    "rankHigh",
    "city",
    "istatCode",
    "region",
    "macroArea",
    "population",
    "score",
    ...payload.pillars.map((pillar) => `pillar_${pillar.id}`),
    "cyclistCasualties2022_2024",
    "expectedCasualties",
    "riskRatioLow",
    "riskRatioHigh",
    "cyclistDeaths2015_2024",
    ...payload.metrics.map((metric) => metric.id),
    ...payload.metrics.map((metric) => `metricScore_${metric.id}`),
    "exposureRankLow",
    "exposureRankHigh",
    "defaultWeightedCoverage",
    "metricsAvailable",
    "metricsTotal",
    ...payload.pillars.map((pillar) => `coverage_${pillar.id}`),
    ...["half", "double"].flatMap((name) => [`exposure_${name}_ratio`, `exposure_${name}_fatalityRatio`, `exposure_${name}_score`, `exposure_${name}_rank`])
  ];
}

export function csvRows(payload) {
  return payload.cities.map((city) => [
    city.rank,
    city.rankRange[0],
    city.rankRange[1],
    city.name,
    city.istatCode,
    city.region,
    city.macroArea,
    city.population,
    city.score,
    ...payload.pillars.map((pillar) => city.pillarScores[pillar.id]),
    city.safety.casualties,
    city.safety.expected,
    city.safety.ratioLow,
    city.safety.ratioHigh,
    city.safety.deaths,
    ...payload.metrics.map((metric) => city.metrics[metric.id]),
    ...payload.metrics.map((metric) => city.metricScores[metric.id]),
    city.exposureRankRange?.[0],
    city.exposureRankRange?.[1],
    city.dataCoverage?.defaultWeightedCoverage,
    city.dataCoverage?.metricsAvailable,
    city.dataCoverage?.metricsTotal,
    ...payload.pillars.map((pillar) => city.dataCoverage?.pillarCoverage[pillar.id]),
    ...[0.5, 2].flatMap((multiplier) => {
      const scenario = city.safety.exposureScenarios?.find((entry) => entry.multiplier === multiplier);
      return [scenario?.ratio, scenario?.fatalityRatio, scenario?.score, scenario?.rank];
    })
  ]);
}

export function buildCsv(payload) {
  return `${[csvHeaders(payload), ...csvRows(payload)].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}
