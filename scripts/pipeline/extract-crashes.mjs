/**
 * Aggregate ISTAT road-crash microdata (mIcro.STAT, one record per injury crash)
 * into cyclist casualty counts per capoluogo and year, plus a crash profile.
 *
 * Cyclists = drivers and passengers of vehicles coded 14 (velocipede) or 23
 * (bicicletta elettrica, from May 2020). Driver outcomes: 2 injured, 3/4 killed.
 * Passenger outcomes use a DIFFERENT codebook: 1 killed, 2 injured.
 */
import path from "node:path";
import { decodeLatin1, readZipEntries } from "./lib/archives.mjs";
import { readJson, writeJson } from "./lib/text.mjs";
import { CRASH_FIRST_YEAR, CRASH_LAST_YEAR, INTERMEDIATE_DIR, RAW_SOURCES } from "./config.mjs";

export const BIKE_CODES = new Set(["14", "23"]);
export const EBIKE_CODE = "23";
export const ESCOOTER_CODE = "22";
const VEHICLES = ["a", "b", "c"];
/** City-level crash profile pools these years (large enough for shares, recent enough to matter). */
export const PROFILE_YEARS = [2020, 2021, 2022, 2023, 2024];

/** Independent checks published by ISTAT/ACI, Incidenti stradali in Italia – 2024. */
export const NATIONAL_2024_REFERENCE = {
  incidents: 173364, allKilled: 3030, allInjured: 233853,
  cyclistKilled: 185, cyclistInjured: 16563, ebikeKilled: 20, ebikeInjured: 1724,
  escooterKilled: 23, escooterInjured: 3751
};

export function validateNational2024(totals) {
  for (const [field, expected] of Object.entries(NATIONAL_2024_REFERENCE)) {
    if (totals?.[field] !== expected) throw new Error(`National 2024 ${field}: ${totals?.[field]} extracted, ${expected} officially published`);
  }
}

/** Classify the other party in a crash involving a bicycle. */
export function opponentClass(code) {
  if (!code) return null;
  const value = Number(code);
  if ([1, 2, 3, 4].includes(value)) return "car";
  if ([5, 6, 7, 8, 9, 10, 11, 12, 13].includes(value)) return "heavy";
  if ([15, 16, 17, 18, 21].includes(value)) return "motorbike";
  if ([14, 23].includes(value)) return "bike";
  if (value === 22) return "escooter";
  if (value === 20) return "hitAndRun";
  return "other";
}

export function outcomeOf(code) {
  const value = String(code ?? "").trim();
  if (value === "2") return "injured";
  if (value === "3" || value === "4") return "killed";
  return null;
}

export function passengerOutcomeOf(code) {
  const value = String(code ?? "").trim();
  if (value === "1") return "killed";
  if (value === "2") return "injured";
  return null;
}

/** Public files mix 00–23 and 01–24, sometimes contradicting their HTML metadata. */
export function normalizeHour(raw, oneBased = false) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const hour = Number(value);
  if (!Number.isInteger(hour) || hour < (oneBased ? 1 : 0) || hour > 24) return null;
  return oneBased ? hour - 1 : hour % 24;
}

function emptyYear() {
  return {
    incidents: 0,
    allKilled: 0,
    allInjured: 0,
    urbanKilled: 0,
    urbanInjured: 0,
    cyclistKilled: 0,
    cyclistInjured: 0,
    ebikeKilled: 0,
    ebikeInjured: 0,
    escooterKilled: 0,
    escooterInjured: 0
  };
}

function emptyProfile() {
  return {
    casualties: 0,
    killed: 0,
    atIntersection: 0,
    carInvolved: 0,
    heavyInvolved: 0,
    opponents: { car: 0, heavy: 0, motorbike: 0, bike: 0, escooter: 0, hitAndRun: 0, other: 0, alone: 0, multiple: 0 },
    age: { under18: 0, from18to64: 0, over64: 0, unknown: 0 },
    killedOver64: 0,
    killedAgeKnown: 0,
    night: 0,
    hourKnown: 0,
    hours: new Array(24).fill(0),
    weekdays: new Array(7).fill(0),
    ebike: 0,
    ebikeYearsCasualties: 0
  };
}

export function ageBand(raw) {
  const value = String(raw ?? "").replace(/\s/g, "");
  if (["0-5", "1-5", "6-9", "10-14", "15-17"].includes(value)) return "under18";
  if (["18-29", "30-44", "45-54", "55-64"].includes(value)) return "from18to64";
  if (value === "65+") return "over64";
  return "unknown";
}

function headerIndex(header) {
  const index = new Map(header.map((name, position) => [name.trim(), position]));
  const get = (name) => {
    if (!index.has(name)) throw new Error(`Missing microdata column ${name}`);
    return index.get(name);
  };
  const passengerColumns = (vehicle) =>
    header
      .map((name, position) => [name.trim(), position])
      .filter(
        ([name]) =>
          name.startsWith(`veicolo__${vehicle}___esito_passegg`) ||
          name.startsWith(`veicolo__${vehicle}___passeggeri_an`)
      )
      // The age column immediately follows each passenger outcome in the ISTAT layout.
      .map(([, position]) => ({ outcome: position, age: position + 1 }));
  const extraPassengers = (vehicle) =>
    header.map((name, position) => [name.trim(), position])
      .filter(([name]) => name.startsWith(`veicolo__${vehicle}___altri_passegg`))
      .map(([, position], index) => ({ position, outcome: index < 2 ? "killed" : "injured" }));
  return {
    province: get("provincia"),
    municipality: get("comune"),
    weekday: get("giorno"),
    intersection: get("intersezione_o_non_interse3"),
    nature: get("natura_incidente"),
    location: get("localizzazione_incidente"),
    type: { a: get("tipo_veicolo_a"), b: get("tipo_veicoli__b_"), c: get("tipo_veicolo__c_") },
    driverOutcome: Object.fromEntries(VEHICLES.map((v) => [v, get(`veicolo__${v}___esito_conducente`)])),
    driverAge: Object.fromEntries(VEHICLES.map((v) => [v, get(`veicolo__${v}___et__conducente`)])),
    passengers: Object.fromEntries(VEHICLES.map((v) => [v, passengerColumns(v)])),
    extraPassengers: Object.fromEntries(VEHICLES.map((v) => [v, extraPassengers(v)])),
    killed24: get("morti_entro_24_ore"),
    killed30: get("morti_entro_30_giorni"),
    injured: get("feriti"),
    hour: index.has("Ora") ? index.get("Ora") : null
  };
}

/** Process one microdata file. `cityByCode` maps 6-digit codes to city ids. */
export function aggregateCrashFile(text, year, cityByCode, state) {
  const lines = text.split(/\r?\n/);
  const columns = headerIndex(lines[0].split("\t"));
  // 2015–18 and 2023 encode rounded hours as 01–24; other files use 00–23.
  // Detect from the populated source, rather than trusting the contradictory metadata.
  let zeroHours = 0;
  let twentyFourHours = 0;
  if (columns.hour !== null) {
    for (const line of lines.slice(1)) {
      const rawHour = line.split("\t")[columns.hour]?.trim();
      if (rawHour === "00" || rawHour === "0") zeroHours += 1;
      if (rawHour === "24") twentyFourHours += 1;
    }
  }
  const oneBasedHours = twentyFourHours > zeroHours;
  (state.hourCoding ??= {})[year] = oneBasedHours ? "01–24 normalized to 00–23" : "00–23 (24 mapped to midnight)";
  const national = (state.national[year] ??= emptyYear());
  const nationalProfile = state.nationalProfile;
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!line) continue;
    const row = line.split("\t");
    const code = row[columns.province].trim().padStart(3, "0") + row[columns.municipality].trim().padStart(3, "0");
    const cityId = cityByCode.get(code) ?? null;
    const cityYear = cityId ? ((state.cities[cityId] ??= { byYear: {}, profile: emptyProfile() }).byYear[year] ??= emptyYear()) : null;
    const killedAll = (Number(row[columns.killed24]) || 0) + (Number(row[columns.killed30]) || 0);
    const injuredAll = Number(row[columns.injured]) || 0;
    // Localizzazione 0-3: roads inside built-up areas (urban, or regional/provincial/state roads in town).
    const urban = ["0", "1", "2", "3"].includes(row[columns.location].trim());
    for (const target of [national, cityYear]) {
      if (!target) continue;
      target.incidents += 1;
      target.allKilled += killedAll;
      target.allInjured += injuredAll;
      if (urban) {
        target.urbanKilled += killedAll;
        target.urbanInjured += injuredAll;
      }
    }

    const types = Object.fromEntries(VEHICLES.map((v) => [v, row[columns.type[v]].trim()]));
    const occupants = (vehicle) => [
      { outcome: outcomeOf(row[columns.driverOutcome[vehicle]]), age: ageBand(row[columns.driverAge[vehicle]]) },
      ...columns.passengers[vehicle].map((positions) => ({
        outcome: passengerOutcomeOf(row[positions.outcome]), age: ageBand(row[positions.age])
      })),
      ...columns.extraPassengers[vehicle].flatMap(({ position, outcome }) =>
        Array.from({ length: Math.max(0, Number(row[position]) || 0) }, () => ({ outcome, age: "unknown" })))
    ];
    for (const vehicle of VEHICLES) {
      if (types[vehicle] !== ESCOOTER_CODE) continue;
      for (const { outcome } of occupants(vehicle)) {
        if (outcome === "killed") national.escooterKilled += 1;
        if (outcome === "injured") national.escooterInjured += 1;
        if (cityYear && outcome === "killed") cityYear.escooterKilled += 1;
        if (cityYear && outcome === "injured") cityYear.escooterInjured += 1;
      }
    }

    const bikeVehicles = VEHICLES.filter((v) => BIKE_CODES.has(types[v]));
    if (bikeVehicles.length === 0) continue;

    const intersectionCode = Number(row[columns.intersection]);
    const atIntersection = intersectionCode >= 1 && intersectionCode <= 5;
    const hour = columns.hour === null ? null : normalizeHour(row[columns.hour], oneBasedHours);
    const hourKnown = hour !== null;
    const weekday = Number(row[columns.weekday]) - 1;

    for (const vehicle of bikeVehicles) {
      const others = VEHICLES.filter((v) => v !== vehicle && types[v]);
      const opponentClasses = others.map((v) => opponentClass(types[v]));
      const opponent = others.length === 0 ? "alone" : others.length > 1 ? "multiple" : opponentClasses[0];
      const people = occupants(vehicle);
      for (const person of people) {
        if (!person.outcome) continue;
        const isEbike = types[vehicle] === EBIKE_CODE;
        const field = person.outcome === "killed" ? "Killed" : "Injured";
        national[`cyclist${field}`] += 1;
        if (isEbike) national[`ebike${field}`] += 1;
        if (cityYear) {
          cityYear[`cyclist${field}`] += 1;
          if (isEbike) cityYear[`ebike${field}`] += 1;
        }
        if (!PROFILE_YEARS.includes(year)) continue;
        const profiles = [nationalProfile, cityId ? state.cities[cityId].profile : null].filter(Boolean);
        for (const profile of profiles) {
          profile.casualties += 1;
          if (person.outcome === "killed") profile.killed += 1;
          if (atIntersection) profile.atIntersection += 1;
          profile.opponents[opponent] += 1;
          if (opponentClasses.includes("car")) profile.carInvolved += 1;
          if (opponentClasses.includes("heavy")) profile.heavyInvolved += 1;
          profile.age[person.age] += 1;
          if (person.outcome === "killed" && person.age === "over64") profile.killedOver64 += 1;
          if (person.outcome === "killed" && person.age !== "unknown") profile.killedAgeKnown += 1;
          if (hourKnown) {
            profile.hourKnown += 1;
            profile.hours[hour] += 1;
            if (hour >= 20 || hour < 7) profile.night += 1;
          }
          if (weekday >= 0 && weekday < 7) profile.weekdays[weekday] += 1;
          if (year >= 2021) {
            profile.ebikeYearsCasualties += 1;
            if (isEbike) profile.ebike += 1;
          }
        }
      }
    }
  }
}

async function main() {
  const cities = await readJson(path.join(INTERMEDIATE_DIR, "cities.json"));
  const cityByCode = new Map();
  for (const city of cities) {
    cityByCode.set(city.istatCode, city.id);
    cityByCode.set(city.istatCode2011, city.id);
  }
  const state = { national: {}, nationalProfile: emptyProfile(), cities: {} };
  for (let year = CRASH_FIRST_YEAR; year <= CRASH_LAST_YEAR; year += 1) {
    const entries = await readZipEntries(RAW_SOURCES.crashMicrodata(year).file, /MICRODATI\/.*\.txt$/i);
    const [name, bytes] = Object.entries(entries)[0] ?? [];
    if (!bytes) throw new Error(`No microdata text file for ${year}`);
    aggregateCrashFile(decodeLatin1(bytes), year, cityByCode, state);
    const totals = state.national[year];
    console.log(
      `${year}: ${path.basename(name)} → ciclisti morti ${totals.cyclistKilled}, feriti ${totals.cyclistInjured}`
    );
  }
  const missing = cities.filter((city) => !state.cities[city.id]);
  validateNational2024(state.national[2024]);
  if (missing.length) throw new Error(`No crash records for ${missing.map((city) => city.name).join(", ")}`);
  for (const city of cities) {
    for (let year = CRASH_FIRST_YEAR; year <= CRASH_LAST_YEAR; year += 1) {
      state.cities[city.id].byYear[year] ??= emptyYear();
    }
  }
  await writeJson(path.join(INTERMEDIATE_DIR, "crashes.json"), {
    source: "ISTAT, Rilevazione degli incidenti stradali con lesioni a persone, microdati mIcro.STAT",
    years: Object.keys(state.national).map(Number),
    profileYears: PROFILE_YEARS,
    hourCoding: state.hourCoding,
    nationalValidation: {
      year: 2024,
      sourceUrl: "https://www.istat.it/wp-content/uploads/2025/07/REPORT_INCIDENTI_STRADALI_2024.pdf",
      expected: NATIONAL_2024_REFERENCE,
      passed: true
    },
    national: state.national,
    nationalProfile: state.nationalProfile,
    cities: state.cities
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
