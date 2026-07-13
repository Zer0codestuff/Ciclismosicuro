/**
 * Lab24 keeps placeholder zeroes in rows explicitly marked as unavailable.
 * Those zeroes are presentation internals, not observed metric values.
 */
export function publishedMetricValue(row) {
  if (!row || String(row.ndSN) === "1") return null;
  const value = Number(row.punti);
  return Number.isFinite(value) ? value : null;
}

export function publishedSourceRank(row) {
  if (!row || String(row.ndSN) === "1") return null;
  const value = Number(row.posiz);
  return Number.isFinite(value) ? value : null;
}

export function assertLab24Indicator(table, expectedId, expectedName) {
  const actualId = table?.indicatore?.ID == null ? "" : String(table.indicatore.ID);
  const actualName = String(table?.indicatore?.nome ?? "").trim();
  if (actualId !== String(expectedId)) {
    throw new Error(
      `Indicatore Lab24 errato: atteso ${expectedName} (${expectedId}), ricevuto ${actualName || "?"} (${actualId || "?"})`
    );
  }
}
