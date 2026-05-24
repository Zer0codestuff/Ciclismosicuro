import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildRankingCsvRows,
  normalizedMetricCsvColumn,
  parseCsvHeaderLine,
  rankingCsvHeaders,
  toCsv
} from "./csv-export.mjs";

describe("ranking.csv export contract", () => {
  it("maps every metricDefinitions id to a {id}Normalized column", async () => {
    const rankingPath = path.join(process.cwd(), "public/data/ranking.json");
    const ranking = JSON.parse(await readFile(rankingPath, "utf8"));
    const headers = rankingCsvHeaders(ranking);

    for (const metric of ranking.metricDefinitions) {
      expect(headers).toContain(normalizedMetricCsvColumn(metric.id));
    }
    expect(headers.filter((header) => header.endsWith("Normalized"))).toHaveLength(
      ranking.metricDefinitions.length
    );
  });

  it("buildRankingCsvRows emits 106 rows aligned with JSON cities", async () => {
    const rankingPath = path.join(process.cwd(), "public/data/ranking.json");
    const ranking = JSON.parse(await readFile(rankingPath, "utf8"));
    const rows = buildRankingCsvRows(ranking);

    expect(rows).toHaveLength(106);
    expect(rows.map((row) => row.city).sort()).toEqual(
      ranking.cities.map((city) => city.city).sort()
    );
    expect(rows[0].rank).toBe(1);
    expect(rows.at(-1)?.rank).toBe(106);
  });

  it("exports null normalized metrics as empty CSV cells", async () => {
    const rankingPath = path.join(process.cwd(), "public/data/ranking.json");
    const ranking = JSON.parse(await readFile(rankingPath, "utf8"));
    const cosenza = ranking.cities.find((city) => city.city === "Cosenza");
    expect(cosenza?.normalizedMetrics.fiabBikeSmile).toBeNull();

    const row = buildRankingCsvRows(ranking).find((entry) => entry.city === "Cosenza");
    const csv = toCsv([row]);
    const fiabColumn = normalizedMetricCsvColumn("fiabBikeSmile");
    const headerIndex = rankingCsvHeaders(ranking).indexOf(fiabColumn);
    const values = csv.split("\n")[1].split(",");
    expect(values[headerIndex]).toBe("");
  });

  it("published ranking.csv matches headers and row count from contract", async () => {
    const rankingPath = path.join(process.cwd(), "public/data/ranking.json");
    const ranking = JSON.parse(await readFile(rankingPath, "utf8"));
    const csvPath = path.join(process.cwd(), "public/data/ranking.csv");
    const csv = await readFile(csvPath, "utf8");
    const [headerLine, ...dataLines] = csv.trimEnd().split("\n");

    expect(parseCsvHeaderLine(headerLine)).toEqual(rankingCsvHeaders(ranking));
    expect(dataLines).toHaveLength(106);
  });

  it("includes pedestrianAreas and externalPolicyScore normalized columns", async () => {
    const rankingPath = path.join(process.cwd(), "public/data/ranking.json");
    const ranking = JSON.parse(await readFile(rankingPath, "utf8"));
    const headers = rankingCsvHeaders(ranking);

    expect(headers).toContain("pedestrianAreasNormalized");
    expect(headers).toContain("externalPolicyScoreNormalized");

    const bologna = buildRankingCsvRows(ranking).find((row) => row.city === "Bologna");
    expect(bologna?.pedestrianAreasNormalized).toBe(4.29);
    expect(bologna?.externalPolicyScoreNormalized).toBe(66.7);
  });
});
