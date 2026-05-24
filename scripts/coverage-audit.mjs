/** Shared coverage-audit helpers for build, remerge, and validate. */

export const SPARSE_COVERAGE_THRESHOLD_PERCENT = 95;

export function round(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

export function countCitiesWithRawMetric(cities, metricId) {
  return cities.filter(
    (city) => city.rawMetrics[metricId] !== null && city.rawMetrics[metricId] !== undefined
  ).length;
}

export function metricCoverageFromCities(cities, metricId) {
  const cityCount = cities.length;
  const citiesWithValue = countCitiesWithRawMetric(cities, metricId);
  const coveragePercent = round((citiesWithValue / cityCount) * 100, 1);
  return {
    citiesWithValue,
    coveragePercent,
    sparse: coveragePercent < SPARSE_COVERAGE_THRESHOLD_PERCENT
  };
}

export function categoryCoverageFromCities(cities, category) {
  const cityCount = cities.length;
  const citiesWithCategoryScore = cities.filter(
    (city) =>
      city.categoryScores?.[category] !== null && city.categoryScores?.[category] !== undefined
  ).length;
  const coveragePercent = round((citiesWithCategoryScore / cityCount) * 100, 1);
  const averageMetricCoveragePercent = round(
    cities.reduce((sum, city) => sum + (city.categoryCoverage?.[category] ?? 0), 0) / cityCount,
    1
  );
  return { citiesWithCategoryScore, coveragePercent, averageMetricCoveragePercent };
}

/** Recompute per-category coverage fields on an existing payload (remerge path). */
export function syncCoverageAuditCategories(payload) {
  const audit = payload.coverageAudit;
  if (!audit?.categories) return;

  const defaultWeights = payload.defaultWeights ?? {};
  audit.cityCount = payload.cities.length;

  for (const entry of audit.categories) {
    const defaultWeight = defaultWeights[entry.category] ?? entry.defaultWeight ?? 0;
    const { citiesWithCategoryScore, coveragePercent, averageMetricCoveragePercent } =
      categoryCoverageFromCities(payload.cities, entry.category);

    entry.defaultWeight = defaultWeight;
    entry.citiesWithCategoryScore = citiesWithCategoryScore;
    entry.coveragePercent = coveragePercent;
    entry.averageMetricCoveragePercent = averageMetricCoveragePercent;
    entry.includedInDefaultScore = defaultWeight > 0;
    entry.sparse = coveragePercent < SPARSE_COVERAGE_THRESHOLD_PERCENT;
  }
}

/** Recompute per-metric coverage fields on an existing payload (remerge path). */
export function syncCoverageAuditMetrics(payload) {
  for (const metric of payload.metricDefinitions) {
    const auditMetric = payload.coverageAudit.metrics.find((entry) => entry.id === metric.id);
    if (!auditMetric) continue;
    const { citiesWithValue, coveragePercent, sparse } = metricCoverageFromCities(
      payload.cities,
      metric.id
    );
    auditMetric.citiesWithValue = citiesWithValue;
    auditMetric.coveragePercent = coveragePercent;
    auditMetric.sparse = sparse;
    delete auditMetric.cityCount;
  }

  payload.coverageAudit.sparseSignals = payload.metricDefinitions
    .filter((metric) => {
      const auditMetric = payload.coverageAudit.metrics.find((entry) => entry.id === metric.id);
      return auditMetric && auditMetric.coveragePercent < SPARSE_COVERAGE_THRESHOLD_PERCENT;
    })
    .map((metric) => {
      const auditMetric = payload.coverageAudit.metrics.find((entry) => entry.id === metric.id);
      return `${metric.id} (${auditMetric.coveragePercent}% city coverage)`;
    });

  syncCoverageAuditCategories(payload);
}

export function validateMetricCoverageEntries(ranking) {
  const failures = [];
  const audit = ranking.coverageAudit;
  if (!audit) return failures;

  for (const entry of audit.metrics ?? []) {
    if (Object.prototype.hasOwnProperty.call(entry, "cityCount")) {
      failures.push(
        `coverageAudit.metrics.${entry.id}: unexpected per-metric cityCount (use citiesWithValue; denominator is coverageAudit.cityCount)`
      );
    }

    const observed = countCitiesWithRawMetric(ranking.cities, entry.id);
    if (entry.citiesWithValue !== observed) {
      failures.push(
        `coverageAudit.metrics.${entry.id}: citiesWithValue ${entry.citiesWithValue} does not match ${observed} cities with rawMetrics`
      );
    }

    const expectedPercent = round((observed / audit.cityCount) * 100, 1);
    if (entry.coveragePercent !== expectedPercent) {
      failures.push(
        `coverageAudit.metrics.${entry.id}: coveragePercent ${entry.coveragePercent} expected ${expectedPercent}`
      );
    }
  }

  return failures;
}

export function validateCategoryCoverageEntries(ranking) {
  const failures = [];
  const audit = ranking.coverageAudit;
  if (!audit) return failures;

  const defaultWeights = ranking.defaultWeights ?? {};

  for (const entry of audit.categories ?? []) {
    const category = entry.category;
    const observed = categoryCoverageFromCities(ranking.cities, category);
    const expectedDefaultWeight = defaultWeights[category] ?? 0;

    if (entry.citiesWithCategoryScore !== observed.citiesWithCategoryScore) {
      failures.push(
        `coverageAudit.categories.${category}: citiesWithCategoryScore ${entry.citiesWithCategoryScore} does not match ${observed.citiesWithCategoryScore} cities with categoryScores`
      );
    }

    if (entry.coveragePercent !== observed.coveragePercent) {
      failures.push(
        `coverageAudit.categories.${category}: coveragePercent ${entry.coveragePercent} expected ${observed.coveragePercent}`
      );
    }

    if (entry.averageMetricCoveragePercent !== observed.averageMetricCoveragePercent) {
      failures.push(
        `coverageAudit.categories.${category}: averageMetricCoveragePercent ${entry.averageMetricCoveragePercent} expected ${observed.averageMetricCoveragePercent}`
      );
    }

    if (entry.includedInDefaultScore !== expectedDefaultWeight > 0) {
      failures.push(
        `coverageAudit.categories.${category}: includedInDefaultScore ${entry.includedInDefaultScore} expected ${expectedDefaultWeight > 0}`
      );
    }

    const expectedSparse = observed.coveragePercent < SPARSE_COVERAGE_THRESHOLD_PERCENT;
    if (entry.sparse !== expectedSparse) {
      failures.push(
        `coverageAudit.categories.${category}: sparse ${entry.sparse} expected ${expectedSparse}`
      );
    }
  }

  return failures;
}
