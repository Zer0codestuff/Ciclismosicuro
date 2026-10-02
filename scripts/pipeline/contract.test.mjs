// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCsv, csvHeaders, csvRows } from "./csv.mjs";
import { validatePayload } from "./validate.mjs";
import { compositeScore as pipelineScore } from "./build-index.mjs";
import { compositeScore as frontendScore, WEIGHT_PRESETS } from "../../src/lib/scoring.ts";

const published = JSON.parse(readFileSync(new URL("../../public/data/ranking.json", import.meta.url), "utf8"));

describe("published JSON/CSV contract", () => {
  it("validates the exact exported pair", () => {
    const csv = readFileSync(new URL("../../public/data/ranking.csv", import.meta.url), "utf8");
    expect(validatePayload(published, csv)).toEqual([]);
    expect(csvRows(published)).toHaveLength(published.cityCount);
    expect(csvRows(published).every((row) => row.length === csvHeaders(published).length)).toBe(true);
  });

  it("matches frontend/pipeline aggregation for every city and preset, including missing contextual pillars", () => {
    for (const city of published.cities) {
      for (const preset of WEIGHT_PRESETS) {
        expect(frontendScore(city.pillarScores, preset.weights), `${city.name}: ${preset.id}`).toBe(pipelineScore(city.pillarScores, preset.weights));
      }
    }
  });

  it("exports sensitivity and coverage metadata alongside raw and normalized metrics", () => {
    const headers = csvHeaders(published);
    const row = csvRows(published)[0];
    const city = published.cities[0];
    expect(row[headers.indexOf("metricsAvailable")]).toBe(city.dataCoverage.metricsAvailable);
    expect(row[headers.indexOf("exposureRankLow")]).toBe(city.exposureRankRange[0]);
    expect(row[headers.indexOf("metricScore_injuryRiskRatio")]).toBe(city.metricScores.injuryRiskRatio);
    expect(row[headers.indexOf("exposure_half_rank")]).toBe(city.safety.exposureScenarios.find((scenario) => scenario.multiplier === 0.5).rank);
  });

  it("preserves the source's estimated bike-sharing observations in public flags", () => {
    for (const name of ["Biella", "Teramo", "Monza", "Treviso", "Pisa"]) {
      expect(published.cities.find((city) => city.name === name).flags.some((flag) => /^Bike sharing ISTAT:.*2024 stimat/.test(flag)), name).toBe(true);
    }
  });

  it("detects a corrupt CSV value even when headers and row counts still match", () => {
    const csv = buildCsv(published);
    const corrupt = csv.replace(published.cities[0].name, "Incorrect city");
    expect(validatePayload(published, corrupt)).toContain("CSV content out of sync with payload (header, rows or values)");
  });

  it("detects composite score or rank divergence from public inputs", () => {
    const payload = structuredClone(published);
    payload.cities[0].score -= 10;
    const errors = validatePayload(payload, buildCsv(payload));
    expect(errors.some((error) => error.includes("published score does not match"))).toBe(true);
    expect(errors).toContain("published ranks do not match public scores");
  });

  it("requires all declared metric and pillar values including explicit nulls", () => {
    const payload = structuredClone(published);
    delete payload.cities[0].pillarScores.safety;
    delete payload.cities[0].metrics.pm10;
    const errors = validatePayload(payload, buildCsv(payload));
    expect(errors.some((error) => error.includes("missing core pillar safety"))).toBe(true);
    expect(errors.some((error) => error.includes("missing or invalid metric pm10"))).toBe(true);
  });

  it.each([null, [], {}, { cities: [null] }, { ...published, cities: [null] }, { ...published, national: [] }, { ...published, sources: [null] }, { ...published, cities: [{}] }, { ...published, cities: published.cities.map((city, index) => index === 0 ? { ...city, rankRange: undefined } : city) }])("returns failures without throwing for incomplete JSON", (payload) => {
    expect(() => validatePayload(payload, "invalid CSV")).not.toThrow();
    expect(validatePayload(payload, "invalid CSV").length).toBeGreaterThan(0);
  });

  it("quotes commas, semicolons, quotes and all newline forms", () => {
    const payload = structuredClone(published);
    payload.cities = [{ ...payload.cities[0], name: 'A,"B";C\rD\nE' }];
    expect(buildCsv(payload)).toContain('"A,""B"";C\rD\nE"');
  });

  it("preserves zero, false and missing values distinctly", () => {
    const payload = structuredClone(published);
    payload.cities = [payload.cities[0]];
    payload.cities[0].metrics.zone30 = false;
    payload.cities[0].metrics.bikeSharingPer10k = 0;
    payload.cities[0].metrics.pm10 = null;
    const row = buildCsv(payload).split("\n")[1].split(",");
    const headers = csvHeaders(payload);
    expect(row[headers.indexOf("zone30")]).toBe("0");
    expect(row[headers.indexOf("bikeSharingPer10k")]).toBe("0");
    expect(row[headers.indexOf("pm10")]).toBe("");
  });
});
