const cache = new Map<string, Intl.NumberFormat>();

function formatter(digits: number): Intl.NumberFormat {
  const key = String(digits);
  let value = cache.get(key);
  if (!value) {
    value = new Intl.NumberFormat("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    cache.set(key, value);
  }
  return value;
}

/** Italian number formatting; null/NaN become "n.d.". */
export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n.d.";
  return formatter(digits).format(value);
}

/** Format a 0–1 share as a percentage. */
export function formatPercent(share: number | null | undefined, digits = 0): string {
  if (share === null || share === undefined || !Number.isFinite(share)) return "n.d.";
  return `${formatNumber(share * 100, digits)}%`;
}

/** Signed percentage change between two values ("+12%" / "−8%"). */
export function formatChange(from: number, to: number, digits = 0): string {
  if (!Number.isFinite(from) || from === 0 || !Number.isFinite(to)) return "n.d.";
  const change = ((to - from) / from) * 100;
  const sign = change > 0 ? "+" : change < 0 ? "−" : "";
  return `${sign}${formatNumber(Math.abs(change), digits)}%`;
}

/** "1,8 volte" style multiplier, or "metà" style phrase for ratios. */
export function describeRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return "n.d.";
  if (ratio >= 1.05) return `${formatNumber(ratio, 1)} volte l'atteso`;
  if (ratio <= 0.95) return `${formatNumber((1 - ratio) * 100, 0)}% sotto l'atteso`;
  return "in linea con l'atteso";
}

export function formatMetricValue(value: number | boolean | null | undefined, digits: number, unit: string): string {
  if (typeof value === "boolean") return value ? "sì" : "no";
  if (value === null || value === undefined) return "n.d.";
  if (unit.startsWith("%")) return `${formatNumber(value, digits)}%`;
  return formatNumber(value, digits);
}

const sizeLabels = { grande: "grande", media: "media", piccola: "piccola" } as const;
export function sizeLabel(size: keyof typeof sizeLabels): string {
  return sizeLabels[size];
}
