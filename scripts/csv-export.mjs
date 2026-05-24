/** Shared ranking.csv export — keep build-data and remerge-manual in sync. */

export const RANKING_CSV_BASE_COLUMNS = [
  "rank",
  "city",
  "score",
  "dataConfidence",
  "infrastructure",
  "safety",
  "usage",
  "connectivity",
  "policy",
  "comfort"
];

export function normalizedMetricCsvColumn(metricId) {
  return `${metricId}Normalized`;
}

export function rankingCsvHeaders(payload) {
  const metricColumns = (payload.metricDefinitions ?? []).map((metric) =>
    normalizedMetricCsvColumn(metric.id)
  );
  return [...RANKING_CSV_BASE_COLUMNS, ...metricColumns];
}

export function buildRankingCsvRows(payload) {
  const metricIds = (payload.metricDefinitions ?? []).map((metric) => metric.id);
  return payload.cities.map((city) => {
    const row = {
      rank: city.rank,
      city: city.city,
      score: city.score,
      dataConfidence: city.dataConfidence,
      infrastructure: city.categoryScores.infrastructure,
      safety: city.categoryScores.safety,
      usage: city.categoryScores.usage,
      connectivity: city.categoryScores.connectivity,
      policy: city.categoryScores.policy,
      comfort: city.categoryScores.comfort
    };
    for (const metricId of metricIds) {
      row[normalizedMetricCsvColumn(metricId)] = city.normalizedMetrics?.[metricId] ?? null;
    }
    return row;
  });
}

export function toCsv(rows) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const escape = (value) => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join(
    "\n"
  );
}

export function parseCsvHeaderLine(line) {
  const headers = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      headers.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  headers.push(current);
  return headers;
}
