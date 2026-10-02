/**
 * Census 2011 commuting matrix (ISTAT): daily commuters by mode for each capoluogo.
 * Historical, household-resident commuting by main mode, used as an exposure proxy;
 * it does not count current cyclists, leisure trips or distance travelled.
 *
 * Record layout (fixed width, 1-based): type 1, residence province 5-7, municipality 9-11,
 * destination province 20-22, municipality 24-26, mode 32-33, weighted count 39-50.
 * Only "L" records carry the mode; their weighted count is the documented estimator.
 */
import path from "node:path";
import { forEachZipLine } from "./lib/archives.mjs";
import { readJson, writeJson } from "./lib/text.mjs";
import { INTERMEDIATE_DIR, RAW_SOURCES } from "./config.mjs";

export const MODE_GROUPS = {
  "01": "transit",
  "02": "transit",
  "03": "transit",
  "04": "transit",
  "05": "transit",
  "06": "transit",
  "07": "car",
  "08": "car",
  "09": "motorbike",
  "10": "bike",
  "11": "other",
  "12": "walk"
};

export function parseCommutingRecord(line) {
  if (line[0] !== "L" || line.length < 50) return null;
  const rawCount = line.slice(38, 50).trim();
  if (!rawCount) return null;
  const count = Number(rawCount);
  if (!Number.isFinite(count) || count < 0) return null;
  return {
    origin: line.slice(4, 7) + line.slice(8, 11),
    destination: line.slice(19, 22) + line.slice(23, 26),
    mode: MODE_GROUPS[line.slice(31, 33)] ?? "other",
    count
  };
}

function emptyCounts() {
  return { total: 0, bike: 0, car: 0, transit: 0, walk: 0, motorbike: 0, other: 0 };
}

async function main() {
  const cities = await readJson(path.join(INTERMEDIATE_DIR, "cities.json"));
  const cityByCode = new Map(cities.map((city) => [city.istatCode2011, city.id]));
  const result = Object.fromEntries(
    cities.map((city) => [city.id, { residents: emptyCounts(), internal: emptyCounts(), inboundBike: 0, inboundTotal: 0 }])
  );
  const national = emptyCounts();
  await forEachZipLine(RAW_SOURCES.commuting2011.file, /matrix_pendo2011.*\.txt$/i, (line) => {
    const record = parseCommutingRecord(line);
    if (!record) return;
    national.total += record.count;
    national[record.mode] += record.count;
    const originCity = cityByCode.get(record.origin);
    const destinationCity = cityByCode.get(record.destination);
    if (originCity) {
      const entry = result[originCity];
      entry.residents.total += record.count;
      entry.residents[record.mode] += record.count;
      if (record.destination === record.origin) {
        entry.internal.total += record.count;
        entry.internal[record.mode] += record.count;
      }
    }
    if (destinationCity && record.destination !== record.origin) {
      result[destinationCity].inboundTotal += record.count;
      if (record.mode === "bike") result[destinationCity].inboundBike += record.count;
    }
  });
  const round = (value) => Math.round(value);
  for (const entry of Object.values(result)) {
    for (const group of [entry.residents, entry.internal]) {
      for (const key of Object.keys(group)) group[key] = round(group[key]);
    }
    entry.inboundBike = round(entry.inboundBike);
    entry.inboundTotal = round(entry.inboundTotal);
  }
  const empty = cities.filter((city) => result[city.id].residents.total === 0);
  if (empty.length) throw new Error(`No commuting records for ${empty.map((city) => city.name).join(", ")}`);
  if (Math.abs(national.total - 28_852_721) > 1) throw new Error(`Census weighted total ${national.total} does not match the documented household-resident universe`);
  await writeJson(path.join(INTERMEDIATE_DIR, "commuting-2011.json"), {
    source: "ISTAT, 15° Censimento della popolazione 2011, matrice del pendolarismo",
    national: Object.fromEntries(Object.entries(national).map(([key, value]) => [key, round(value)])),
    populationScope: "Residents in households; institutional residents are excluded from mode-specific L records",
    sampling: "Weighted estimates; mode was sampled in municipalities with at least 20,000 residents at 31 December 2010",
    referenceNationalTotal: 28_852_721,
    cities: result
  });
  console.log(`commuting-2011.json: ${cities.length} città, quota bici nazionale ${((national.bike / national.total) * 100).toFixed(1)}%`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
