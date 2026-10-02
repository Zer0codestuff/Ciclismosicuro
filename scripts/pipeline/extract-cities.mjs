/**
 * Build the city registry: every comune capoluogo covered by ISTAT "Dati ambientali
 * nelle città", with ISTAT codes, region, coordinates and resident population.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { decodeLatin1, decodeUtf8, forEachZipLine, readXlsx, readZipEntries } from "./lib/archives.mjs";
import { parseDelimited, readJson, slugify, stripFootnotes, writeJson } from "./lib/text.mjs";
import { FINAL_POPULATION_YEAR, INTERMEDIATE_DIR, MANUAL_DIR, POPULATION_YEARS, RAW_SOURCES, RECONSTRUCTED_POPULATION_YEARS } from "./config.mjs";

/** The reconstruction repeats totals, males and females for every year/citizenship. */
export function reconstructionRow(line, context) {
  const row = parseDelimited(line, ";")[0] ?? [];
  const yearMatch = /^(.*?) - Anno: (\d{4}) -/.exec(row[0] ?? "");
  if (yearMatch) {
    context.year = Number(yearMatch[2]);
    context.allCitizenships = yearMatch[1] === "Tutte le cittadinanze";
    context.totalSex = false;
  } else if (row[0] === "Codice comune") {
    context.totalSex = row[2] === "Totale";
  } else if (context.allCitizenships && context.totalSex && RECONSTRUCTED_POPULATION_YEARS.includes(context.year) && /^\d{6}$/.test(row[0])) {
    const ages = row.slice(2).map(Number);
    if (ages.length !== 101 || ages.some((n) => !Number.isFinite(n) || n < 0)) {
      throw new Error(`Invalid reconstructed population for ${row[0]} in ${context.year}`);
    }
    return { code: row[0], year: context.year, total: ages.reduce((sum, value) => sum + value, 0) };
  }
  return null;
}

/** Short display names used by the dashboard (ISTAT official name → common name). */
const DISPLAY_NAMES = {
  "Bolzano/Bozen": "Bolzano",
  "Reggio nell'Emilia": "Reggio Emilia",
  "Reggio di Calabria": "Reggio Calabria",
  "L'Aquila": "L’Aquila"
};

const MACRO_AREAS = {
  "Nord-ovest": "Nord",
  "Nord-est": "Nord",
  Centro: "Centro",
  Sud: "Mezzogiorno",
  Isole: "Mezzogiorno"
};

export function sizeClassFor(population) {
  if (population >= 200_000) return "grande";
  if (population >= 80_000) return "media";
  return "piccola";
}

async function loadMunicipalities() {
  const text = decodeLatin1(await readFile(RAW_SOURCES.municipalities.file));
  const [header, ...rows] = parseDelimited(text, ";").filter((row) => row.length > 10);
  const column = (label) => {
    const index = header.findIndex((name) => name.replace(/\s+/g, " ").startsWith(label));
    if (index < 0) throw new Error(`Missing column ${label} in municipality list`);
    return index;
  };
  const columns = {
    code: column("Codice Comune formato alfanumerico"),
    code110: column("Codice Comune numerico con 110 province"),
    nameFull: column("Denominazione (Italiana e straniera)"),
    nameItalian: column("Denominazione in italiano"),
    region: column("Denominazione Regione"),
    area: column("Ripartizione geografica"),
    utsType: column("Tipologia di Unità territoriale sovracomunale"),
    capital: column("Flag Comune capoluogo")
  };
  return rows.map((row) => ({
    code: row[columns.code],
    code110: row[columns.code110].padStart(6, "0"),
    nameFull: row[columns.nameFull],
    nameItalian: row[columns.nameItalian],
    region: row[columns.region],
    area: row[columns.area],
    utsType: row[columns.utsType],
    capital: row[columns.capital] === "1"
  }));
}

async function loadSurveyCityNames() {
  const entries = await readZipEntries(RAW_SOURCES.urbanEnvironment.file, /MOBILITA_URBANA.*\.xlsx$/);
  const workbook = readXlsx(Object.values(entries)[0], { sheets: ["20.2"] });
  const names = [];
  for (const row of workbook["20.2"]) {
    const label = stripFootnotes(row[0]);
    const looksLikeData = row.slice(1, 7).some((value) => typeof value === "number" || /^[-…. ]+$/.test(String(value ?? "x")));
    if (!label || !looksLikeData || label.length > 60) continue;
    if (/^(Nord|Centro|Sud|Isole|Mezzogiorno|Italia|Capoluoghi|COMUNI)/.test(label)) continue;
    names.push(label);
  }
  return names;
}

async function loadPopulation(codes) {
  const population = new Map([...codes].map((code) => [code, {}]));
  const context = {};
  await forEachZipLine(RAW_SOURCES.reconstructedPopulation.file, /\.csv$/i, (line) => {
    const record = reconstructionRow(line, context);
    if (record && population.has(record.code)) population.get(record.code)[record.year] = record.total;
  }, { encoding: "utf-8" });
  for (const year of POPULATION_YEARS) {
    const entries = await readZipEntries(RAW_SOURCES.population(year).file, /\.csv$/i);
    const text = decodeUtf8(Object.values(entries)[0]);
    const rows = parseDelimited(text, ";");
    const headerIndex = rows.findIndex((row) => row[0] === "Codice comune");
    const header = rows[headerIndex] ?? [];
    const codeIndex = header.indexOf("Codice comune");
    const ageIndex = header.indexOf("Età");
    const totalIndex = header.indexOf("Totale");
    if (headerIndex < 0 || codeIndex < 0 || ageIndex < 0 || totalIndex < 0) throw new Error(`Invalid POSAS layout in ${year}`);
    for (const row of rows.slice(headerIndex + 1)) {
      if (row[ageIndex] !== "999") continue;
      const code = row[codeIndex];
      if (population.has(code)) population.get(code)[year] = Number(row[totalIndex]);
    }
  }
  return population;
}

async function main() {
  const municipalities = await loadMunicipalities();
  const byName = new Map();
  for (const municipality of municipalities) {
    for (const name of new Set([municipality.nameFull, municipality.nameItalian])) {
      const list = byName.get(name) ?? [];
      list.push(municipality);
      byName.set(name, list);
    }
  }
  const surveyNames = await loadSurveyCityNames();
  const coordinates = (await readJson(path.join(MANUAL_DIR, "city-coordinates.json"))).coordinates;

  const cities = surveyNames.map((surveyName) => {
    const candidates = byName.get(surveyName) ?? [];
    const match = candidates.length === 1 ? candidates[0] : candidates.find((entry) => entry.capital);
    if (!match) throw new Error(`Cannot match ISTAT survey city "${surveyName}" to a municipality code`);
    const coordinate = coordinates[match.code];
    if (!coordinate) throw new Error(`Missing coordinates for ${surveyName} (${match.code})`);
    const name = DISPLAY_NAMES[match.nameFull] ?? DISPLAY_NAMES[match.nameItalian] ?? match.nameItalian;
    return {
      id: slugify(name),
      name,
      officialName: match.nameFull,
      istatCode: match.code,
      istatCode2011: match.code110,
      region: match.region,
      area: match.area,
      macroArea: MACRO_AREAS[match.area] ?? match.area,
      metropolitanCapital: match.utsType === "3",
      lat: coordinate.lat,
      lon: coordinate.lon
    };
  });

  const population = await loadPopulation(new Set(cities.map((city) => city.istatCode)));
  for (const city of cities) {
    city.population = population.get(city.istatCode);
    const missing = [...RECONSTRUCTED_POPULATION_YEARS, ...POPULATION_YEARS].filter((year) => !(city.population[year] > 0));
    if (missing.length) throw new Error(`Missing population for ${city.name}: ${missing.join(", ")}`);
    city.populationMetadata = {
      reconstructedYears: RECONSTRUCTED_POPULATION_YEARS,
      estimatedYears: [2026],
      dateConvention: "1 January of the named year"
    };
    const latestYear = Math.max(...Object.keys(city.population).map(Number).filter((year) => year <= FINAL_POPULATION_YEAR));
    if (!Number.isFinite(latestYear)) throw new Error(`No population for ${city.name}`);
    city.populationYear = latestYear;
    city.populationLatest = city.population[latestYear];
    city.sizeClass = sizeClassFor(city.populationLatest);
  }

  const ids = new Set(cities.map((city) => city.id));
  if (ids.size !== cities.length) throw new Error("Duplicate city ids in registry");
  await writeJson(path.join(INTERMEDIATE_DIR, "cities.json"), cities);
  console.log(`cities.json: ${cities.length} capoluoghi`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
