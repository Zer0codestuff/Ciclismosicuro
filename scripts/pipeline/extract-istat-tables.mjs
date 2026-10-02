/**
 * ISTAT "Ambiente urbano – Dati ambientali nelle città" 2024 tables (CC BY 4.0):
 * cycle lanes, bike sharing, Zone 30/ZTL/pedestrian areas, public transport, air quality.
 */
import path from "node:path";
import { readXlsx, readZipEntries } from "./lib/archives.mjs";
import { readJson, stripFootnotes, writeJson } from "./lib/text.mjs";
import { INTERMEDIATE_DIR, RAW_SOURCES } from "./config.mjs";

/** ISTAT convention: "-" = phenomenon absent (zero); "...." / "…." = not available. */
const ZERO = /^[-–]$/;
const NOT_AVAILABLE = /^[….: ]*$/;

export function cellNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (ZERO.test(text)) return 0;
  if (NOT_AVAILABLE.test(text)) return null;
  const numeric = Number(text.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
}

/** Empty/unavailable observations cannot be read as an absent policy. */
export function cellPresence(value) {
  const text = String(value ?? "").trim().toUpperCase();
  if (text === "X") return true;
  if (ZERO.test(text)) return false;
  return null;
}

export function footnoteMarkers(label) {
  return [...String(label ?? "").matchAll(/\(([a-z]{1,2})\)/g)].map((match) => match[1]);
}

/** Map city rows of an ISTAT table to registry ids; also resolve footnote text per city. */
export function tableRows(rows, nameToId) {
  const notes = new Map();
  for (const row of rows) {
    const match = /^\(([a-z]{1,2})\)\s*(.+)$/.exec(String(row[0] ?? "").trim());
    if (match) notes.set(match[1], match[2].trim());
  }
  const result = new Map();
  for (const row of rows) {
    const label = stripFootnotes(row[0]);
    const id = nameToId.get(label);
    if (!id || result.has(id)) continue;
    result.set(id, {
      values: row.slice(1),
      notes: footnoteMarkers(row[0]).map((marker) => notes.get(marker)).filter(Boolean)
    });
  }
  return result;
}

function yearSeries(row, years) {
  return Object.fromEntries(years.map((year, index) => [year, cellNumber(row?.values[index])]));
}

async function main() {
  const cities = await readJson(path.join(INTERMEDIATE_DIR, "cities.json"));
  const nameToId = new Map();
  for (const city of cities) {
    nameToId.set(city.officialName, city.id);
    nameToId.set(city.name, city.id);
    nameToId.set(city.officialName.split("/")[0], city.id);
  }
  const entries = await readZipEntries(RAW_SOURCES.urbanEnvironment.file, /(MOBILITA_URBANA|ARIA)_\d+\.xlsx$/);
  const file = (prefix) => Object.entries(entries).find(([name]) => name.includes(prefix))[1];
  const mobility = readXlsx(file("MOBILITA_URBANA"), { sheets: ["2.1", "9.1", "17.1", "20.1", "20.2", "21.2"] });
  const air = readXlsx(file("ARIA"), { sheets: ["Prosp.2.1"] });

  const lanes = tableRows(mobility["20.2"], nameToId);
  const density = tableRows(mobility["20.1"], nameToId);
  const transitDemand = tableRows(mobility["2.1"], nameToId);
  const transitSupply = tableRows(mobility["9.1"], nameToId);
  const sharing = tableRows(mobility["17.1"], nameToId);
  const zones = tableRows(mobility["21.2"], nameToId);
  const yearsLanes = [2019, 2020, 2021, 2022, 2023, 2024];

  const airByCity = new Map();
  for (const row of air["Prosp.2.1"]) {
    const id = nameToId.get(stripFootnotes(row[0]));
    if (!id) continue;
    const entry = airByCity.get(id) ?? { pm10: [], no2: [], pm25: [], stations: new Set() };
    const pm10 = cellNumber(row[6]);
    const pm25 = cellNumber(row[7]);
    const no2 = cellNumber(row[9]);
    if (pm10 !== null) entry.pm10.push(pm10);
    if (pm25 !== null) entry.pm25.push(pm25);
    if (no2 !== null) entry.no2.push(no2);
    if (pm10 !== null || pm25 !== null || no2 !== null) entry.stations.add(row[1]);
    airByCity.set(id, entry);
  }
  const average = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

  const result = {};
  for (const city of cities) {
    const zoneRow = zones.get(city.id)?.values ?? [];
    const sharingRow = sharing.get(city.id);
    const airEntry = airByCity.get(city.id);
    result[city.id] = {
      cycleLaneKm: yearSeries(lanes.get(city.id), yearsLanes),
      cycleLaneDensity2024: cellNumber(density.get(city.id)?.values[5]),
      cycleLaneNotes: lanes.get(city.id)?.notes ?? [],
      transitPassengersPerCapita: yearSeries(transitDemand.get(city.id), yearsLanes),
      transitSeatKmPerCapita: yearSeries(transitSupply.get(city.id), yearsLanes),
      // Layout: station-based 2022-24, spacer, free-floating 2022-24, spacer, total 2022-24.
      bikeSharingPer10k: {
        2022: cellNumber(sharingRow?.values[8]),
        2023: cellNumber(sharingRow?.values[9]),
        2024: cellNumber(sharingRow?.values[10])
      },
      bikeSharingNotes: sharingRow?.notes ?? [],
      transitDemandNotes: transitDemand.get(city.id)?.notes ?? [],
      transitSupplyNotes: transitSupply.get(city.id)?.notes ?? [],
      zoneNotes: zones.get(city.id)?.notes ?? [],
      // Layout per block: presence 2022-24, spacer, extension (up/same/down), spacer.
      pedestrianArea2024: cellPresence(zoneRow[2]),
      ztl2024: cellPresence(zoneRow[10]),
      zone30In2024: cellPresence(zoneRow[18]),
      zone30Expanding2024: cellPresence(zoneRow[20]),
      air2024: airEntry
        ? {
            pm10: average(airEntry.pm10),
            pm25: average(airEntry.pm25),
            no2: average(airEntry.no2),
            stations: airEntry.stations.size,
            pollutantStations: { pm10: airEntry.pm10.length, pm25: airEntry.pm25.length, no2: airEntry.no2.length }
          }
        : null
    };
  }
  const missingLanes = cities.filter((city) => !lanes.has(city.id)).map((city) => city.name);
  if (missingLanes.length) throw new Error(`Missing cycle-lane rows: ${missingLanes.join(", ")}`);
  await writeJson(path.join(INTERMEDIATE_DIR, "istat-urban-environment.json"), {
    source: "ISTAT, Ambiente urbano – Dati ambientali nelle città, tavole 2024 (pubblicate settembre 2026)",
    cities: result
  });
  console.log(`istat-urban-environment.json: ${Object.keys(result).length} città`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
