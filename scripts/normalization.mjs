export function quantile(sortedValues, percentile) {
  if (sortedValues.length === 0) return null;
  const bounded = Math.max(0, Math.min(1, percentile));
  const position = (sortedValues.length - 1) * bounded;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sortedValues[lowerIndex];
  const upper = sortedValues[upperIndex];
  if (lowerIndex === upperIndex) return lower;
  return lower + (upper - lower) * (position - lowerIndex);
}

/** Robust 0-100 scaling with explicit tails capped before scaling. */
export function normalizeValues(
  values,
  {
    direction = "higher",
    domainMin = null,
    domainMax = null,
    lowerPercentile = 0.05,
    upperPercentile = 0.95
  } = {}
) {
  const numeric = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (numeric.length === 0) return values.map(() => null);
  const min = domainMin ?? quantile(numeric, lowerPercentile);
  const max = domainMax ?? quantile(numeric, upperPercentile);
  if (max === min) return values.map((value) => (Number.isFinite(value) ? 50 : null));

  return values.map((value) => {
    if (!Number.isFinite(value)) return null;
    const scaled = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
    return direction === "lower" ? 100 - scaled : scaled;
  });
}
