/**
 * ACI "Autoritratto 2025" – vehicle fleet per municipality at 31 December 2025.
 * Cars per 100 residents is the motorization proxy. Municipalities where rental and
 * leasing companies register their fleets (e.g. Aosta, Bolzano, Trento) show
 * implausible rates; those are flagged instead of being used.
 */
import path from "node:path";
import { readXlsx, readZipEntries } from "./lib/archives.mjs";
import { readJson, writeJson } from "./lib/text.mjs";
import { INTERMEDIATE_DIR, RAW_SOURCES } from "./config.mjs";

/** Above this many cars per 100 residents the figure reflects fleet registrations, not residents. */
export const IMPLAUSIBLE_CARS_PER_100 = 95;

export function aciName(name) {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "'")
    .replace(/'+/g, "'")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const cities = await readJson(path.join(INTERMEDIATE_DIR, "cities.json"));
  const entries = await readZipEntries(RAW_SOURCES.vehicleFleet.file, /Parco_veicolare_\d+\.xlsx$/);
  const sheetName = "45 Comune categoria";
  const rows = readXlsx(Object.values(entries)[0], { sheets: [sheetName] })[sheetName];
  const header = rows.find((row) => row.includes("AUTOVETTURE"));
  const carsIndex = header.indexOf("AUTOVETTURE");
  const motorbikeIndex = header.indexOf("MOTOCICLI");
  const regionIndex = header.indexOf("Regione");
  const municipalityIndex = header.indexOf("Comune");

  let region = null;
  const byName = new Map();
  for (const row of rows.slice(rows.indexOf(header) + 1)) {
    if (row[regionIndex]) region = aciName(String(row[regionIndex]));
    const municipality = row[municipalityIndex];
    if (!municipality) continue;
    const name = aciName(String(municipality));
    const list = byName.get(name) ?? [];
    list.push({ region, cars: Number(row[carsIndex]) || 0, motorbikes: Number(row[motorbikeIndex]) || 0 });
    byName.set(name, list);
  }
  /** ACI region labels are shorter than ISTAT ones ("VALLE D'AOSTA" vs "Valle d'Aosta/Vallée d'Aoste"). */
  const sameRegion = (aciRegion, istatRegion) =>
    aciName(istatRegion).replace(/[^A-Z]/g, "").startsWith(aciRegion.replace(/[^A-Z]/g, "").slice(0, 6));

  const result = {};
  for (const city of cities) {
    const candidates = [city.officialName.split("/")[0], city.name, city.officialName];
    const fleet = candidates
      .flatMap((name) => byName.get(aciName(name)) ?? [])
      .find((entry) => sameRegion(entry.region, city.region));
    if (!fleet) throw new Error(`ACI fleet row not found for ${city.name}`);
    // 1 January 2026 aligns with the fleet at the end of 2025. ISTAT marks it a stima.
    const population = city.population[2026];
    if (!(population > 0)) throw new Error(`Missing population at 1 January 2026 for ${city.name}`);
    const carsPer100 = (fleet.cars / population) * 100;
    result[city.id] = {
      cars: fleet.cars,
      motorbikes: fleet.motorbikes,
      population,
      populationYear: 2026,
      populationEstimated: true,
      fleetDate: "2025-12-31",
      carsPer100,
      reliable: carsPer100 <= IMPLAUSIBLE_CARS_PER_100
    };
  }
  await writeJson(path.join(INTERMEDIATE_DIR, "vehicles.json"), {
    source: "ACI, Autoritratto 2025 – Parco veicolare per comune al 31/12/2025",
    implausibleThreshold: IMPLAUSIBLE_CARS_PER_100,
    cities: result
  });
  const flagged = Object.entries(result).filter(([, value]) => !value.reliable);
  console.log(`vehicles.json: ${Object.keys(result).length} città; non affidabili: ${flagged.map(([id, v]) => `${id} ${v.carsPer100.toFixed(0)}`).join(", ")}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
