import { describe, expect, it } from "vitest";
import { ageBand, aggregateCrashFile, NATIONAL_2024_REFERENCE, normalizeHour, outcomeOf, passengerOutcomeOf, validateNational2024 } from "./extract-crashes.mjs";
import { parseCommutingRecord } from "./extract-commuting.mjs";
import { reconstructionRow } from "./extract-cities.mjs";
import { cellNumber, cellPresence } from "./extract-istat-tables.mjs";
import { overpassQuery, parseOverpassStats } from "./fetch-osm.mjs";

function crashFixture(records) {
  const base = ["provincia", "comune", "giorno", "intersezione_o_non_interse3", "natura_incidente", "localizzazione_incidente", "tipo_veicolo_a", "tipo_veicoli__b_", "tipo_veicolo__c_", "morti_entro_24_ore", "morti_entro_30_giorni", "feriti", "Ora"];
  for (const v of ["a", "b", "c"]) {
    base.push(`veicolo__${v}___esito_conducente`, `veicolo__${v}___et__conducente`, `veicolo__${v}___passeggeri_an35`, `veicolo__${v}___et__passegger36`);
    for (const suffix of [47, 48, 49, 50]) base.push(`veicolo__${v}___altri_passegg${suffix}`);
  }
  return [base.join("\t"), ...records.map((record) => base.map((name) => record[name] ?? "").join("\t"))].join("\n");
}
const profile = () => ({ casualties: 0, killed: 0, atIntersection: 0, carInvolved: 0, heavyInvolved: 0, opponents: { car: 0, heavy: 0, motorbike: 0, bike: 0, escooter: 0, hitAndRun: 0, other: 0, alone: 0, multiple: 0 }, age: { under18: 0, from18to64: 0, over64: 0, unknown: 0 }, killedOver64: 0, killedAgeKnown: 0, night: 0, hourKnown: 0, hours: Array(24).fill(0), weekdays: Array(7).fill(0), ebike: 0, ebikeYearsCasualties: 0 });

describe("ISTAT crash codebooks", () => {
  it("rejects a recurrence of the missing passenger death against official national totals", () => {
    expect(() => validateNational2024(NATIONAL_2024_REFERENCE)).not.toThrow();
    expect(() => validateNational2024({ ...NATIONAL_2024_REFERENCE, cyclistKilled: 184 })).toThrow(/185 officially published/);
  });
  it("uses distinct driver/passenger fatality codes and documented age bands", () => {
    expect(outcomeOf("1")).toBeNull();
    expect(outcomeOf("3")).toBe("killed");
    expect(outcomeOf("4")).toBe("killed");
    expect(passengerOutcomeOf("1")).toBe("killed");
    expect(passengerOutcomeOf("3")).toBeNull();
    expect(ageBand("1-5")).toBe("under18");
    expect(ageBand("65 +")).toBe("over64");
    expect(ageBand("n.i.")).toBe("unknown");
  });
  it("normalizes midnight in both layouts and excludes blank/unknown hours", () => {
    expect(normalizeHour("24", true)).toBe(23);
    expect(normalizeHour("01", true)).toBe(0);
    expect(normalizeHour("00")).toBe(0);
    expect(normalizeHour("24")).toBe(0);
    expect(normalizeHour("  ")).toBeNull();
    expect(normalizeHour("25")).toBeNull();
  });
  it("counts passenger deaths, passenger ages, extra passenger totals and all scooter occupants", () => {
    const text = crashFixture([
      { provincia: "001", comune: "272", giorno: "2", intersezione_o_non_interse3: "04", localizzazione_incidente: "0", tipo_veicolo_a: "14", tipo_veicoli__b_: "01", tipo_veicolo__c_: "08", morti_entro_24_ore: "1", feriti: "3", Ora: "00", veicolo__a___esito_conducente: "2", veicolo__a___et__conducente: "1-5", veicolo__a___passeggeri_an35: "1", veicolo__a___et__passegger36: "65 +", veicolo__a___altri_passegg49: "2" },
      { provincia: "001", comune: "272", giorno: "3", localizzazione_incidente: "4", tipo_veicolo_a: "22", morti_entro_24_ore: "1", feriti: "1", Ora: " ", veicolo__a___esito_conducente: "2", veicolo__a___passeggeri_an35: "1" }
    ]);
    const state = { national: {}, nationalProfile: profile(), cities: {} };
    aggregateCrashFile(text, 2024, new Map([["001272", "torino"]]), state);
    expect(state.national[2024]).toMatchObject({ cyclistKilled: 1, cyclistInjured: 3, escooterKilled: 1, escooterInjured: 1, allKilled: 2, urbanKilled: 1 });
    expect(state.nationalProfile).toMatchObject({ casualties: 4, killed: 1, atIntersection: 4, carInvolved: 4, heavyInvolved: 4, opponents: { multiple: 4 }, age: { under18: 1, over64: 1, unknown: 2 }, killedAgeKnown: 1, killedOver64: 1, hourKnown: 4 });
    expect(state.cities.torino.byYear[2024].cyclistKilled).toBe(1);
  });
});

describe("source extraction semantics", () => {
  it("reads commuting mode 10 and its weighted L count, excluding S totals", () => {
    const chars = Array(60).fill(" ");
    const put = (start, value) => chars.splice(start - 1, value.length, ...value);
    put(1, "L"); put(5, "001"); put(9, "272"); put(20, "001"); put(24, "059"); put(32, "10"); put(39, "000000018.81");
    expect(parseCommutingRecord(chars.join(""))).toEqual({ origin: "001272", destination: "001059", mode: "bike", count: 18.81 });
    chars[0] = "S";
    expect(parseCommutingRecord(chars.join(""))).toBeNull();
    expect(parseCommutingRecord("L")).toBeNull();
  });
  it("sums reconstructed ages once, ignoring male and foreign-only repeat blocks", () => {
    const context = {};
    reconstructionRow('"Tutte le cittadinanze - Anno: 2015 - Provincia: Torino"', context);
    reconstructionRow("Codice comune;Comune;Totale", context);
    const row = ["001272", "Torino", ...Array(101).fill("10")].join(";");
    expect(reconstructionRow(row, context)).toEqual({ code: "001272", year: 2015, total: 1010 });
    reconstructionRow("Codice comune;Comune;Maschi", context);
    expect(reconstructionRow(row, context)).toBeNull();
    reconstructionRow('"Cittadinanza straniera - Anno: 2015 - Provincia: Torino"', context);
    reconstructionRow("Codice comune;Comune;Totale", context);
    expect(reconstructionRow(row, context)).toBeNull();
  });
  it("distinguishes absent, missing and observed ISTAT values", () => {
    expect(cellNumber("-")).toBe(0);
    expect(cellNumber("....")).toBeNull();
    expect(cellNumber(null)).toBeNull();
    expect(cellNumber(NaN)).toBeNull();
    expect(cellNumber("1.234,5")).toBe(1234.5);
    expect(cellPresence("X")).toBe(true);
    expect(cellPresence("-")).toBe(false);
    expect(cellPresence(null)).toBeNull();
  });
});

describe("OSM incomplete-response handling", () => {
  const valid = () => ({ elements: [{ type: "area", id: 3600044823 }, ...["cycleway", "designated", "track", "lane", "busway", "cycling_network", "separated_network", "roads", "maxspeed_tagged", "maxspeed_le30", "living_street", "known_speed", "slow_streets", "arterial", "bike_parking", "bike_rental"].map((key) => ({ type: "stat", tags: { k: key, len: key === "roads" ? "10000" : "1000", n: "2" } }))] });
  it("returns numeric zero as an observation but rejects missing stats and boundaries", () => {
    const response = valid();
    response.elements.find((e) => e.tags?.k === "cycleway").tags.len = "0";
    expect(parseOverpassStats(response)).toMatchObject({ cyclewayKm: 0, roadKm: 10, knownSpeedRoadKm: 1, slowStreetKm: 1 });
    const partial = valid(); partial.elements.pop();
    expect(() => parseOverpassStats(partial)).toThrow(/Invalid Overpass/);
    expect(() => parseOverpassStats({ ...valid(), remark: "timed out" })).toThrow(/incomplete/);
    expect(() => parseOverpassStats({ elements: valid().elements.slice(1) })).toThrow(/boundary/);
  });
  it("fails impossible road-speed unions and rejects query injection", () => {
    const response = valid(); response.elements.find((e) => e.tags?.k === "slow_streets").tags.len = "2000";
    expect(() => parseOverpassStats(response)).toThrow(/unions/);
    expect(() => overpassQuery('x";out;')).toThrow(/ISTAT code/);
  });
});
