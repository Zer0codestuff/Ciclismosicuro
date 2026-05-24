import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  categoryCoverageFromCities,
  metricCoverageFromCities,
  syncCoverageAuditMetrics,
  validateCategoryCoverageEntries,
  validateMetricCoverageEntries
} from "./coverage-audit.mjs";

describe("coverage-audit helpers", () => {
  it("computes FIAB coverage as 16 / 106 / 15.1% from published cities", async () => {
    const rankingPath = path.join(process.cwd(), "public/data/ranking.json");
    const ranking = JSON.parse(await readFile(rankingPath, "utf8"));
    const fiab = metricCoverageFromCities(ranking.cities, "fiabBikeSmile");
    expect(fiab.citiesWithValue).toBe(16);
    expect(fiab.coveragePercent).toBe(15.1);
    expect(fiab.sparse).toBe(true);
  });

  it("published policy category coverage matches live categoryScores (16 / 106)", async () => {
    const rankingPath = path.join(process.cwd(), "public/data/ranking.json");
    const ranking = JSON.parse(await readFile(rankingPath, "utf8"));
    const policy = categoryCoverageFromCities(ranking.cities, "policy");
    expect(policy.citiesWithCategoryScore).toBe(16);
    expect(policy.coveragePercent).toBe(15.1);

    const auditPolicy = ranking.coverageAudit.categories.find(
      (entry) => entry.category === "policy"
    );
    expect(auditPolicy?.citiesWithCategoryScore).toBe(16);
    expect(auditPolicy?.coveragePercent).toBe(15.1);
  });

  it("syncCoverageAuditMetrics recomputes stale category citiesWithCategoryScore", () => {
    const payload = {
      defaultWeights: { policy: 0, usage: 0 },
      cities: [
        {
          categoryScores: { policy: 80, usage: null },
          categoryCoverage: { policy: 50, usage: 0 }
        },
        {
          categoryScores: { policy: null, usage: 70 },
          categoryCoverage: { policy: 0, usage: 100 }
        },
        {
          categoryScores: { policy: 60, usage: null },
          categoryCoverage: { policy: 50, usage: 0 }
        }
      ],
      metricDefinitions: [],
      coverageAudit: {
        cityCount: 99,
        categories: [
          {
            category: "policy",
            defaultWeight: 0,
            citiesWithCategoryScore: 1,
            coveragePercent: 33.3,
            averageMetricCoveragePercent: 0,
            includedInDefaultScore: false,
            sparse: true
          },
          {
            category: "usage",
            defaultWeight: 0,
            citiesWithCategoryScore: 0,
            coveragePercent: 0,
            averageMetricCoveragePercent: 0,
            includedInDefaultScore: false,
            sparse: true
          }
        ],
        metrics: [],
        sparseSignals: []
      }
    };

    syncCoverageAuditMetrics(payload);

    const policy = payload.coverageAudit.categories.find((entry) => entry.category === "policy");
    expect(policy?.citiesWithCategoryScore).toBe(2);
    expect(policy?.coveragePercent).toBe(66.7);
    expect(policy?.averageMetricCoveragePercent).toBe(33.3);

    const usage = payload.coverageAudit.categories.find((entry) => entry.category === "usage");
    expect(usage?.citiesWithCategoryScore).toBe(1);
    expect(usage?.coveragePercent).toBe(33.3);
    expect(payload.coverageAudit.cityCount).toBe(3);
  });

  it("validateCategoryCoverageEntries fails when category counts drift", () => {
    const ranking = {
      defaultWeights: { policy: 0 },
      cities: [
        { categoryScores: { policy: 80 }, categoryCoverage: { policy: 100 } },
        { categoryScores: { policy: 70 }, categoryCoverage: { policy: 100 } }
      ],
      coverageAudit: {
        cityCount: 2,
        categories: [
          {
            category: "policy",
            defaultWeight: 0,
            citiesWithCategoryScore: 1,
            coveragePercent: 50,
            averageMetricCoveragePercent: 100,
            includedInDefaultScore: false,
            sparse: true
          }
        ]
      }
    };

    const failures = validateCategoryCoverageEntries(ranking);
    expect(failures.some((message) => message.includes("citiesWithCategoryScore"))).toBe(true);
  });

  it("syncCoverageAuditMetrics sets citiesWithValue and removes per-metric cityCount", () => {
    const payload = {
      cities: [
        { rawMetrics: { fiabBikeSmile: 4 } },
        { rawMetrics: { fiabBikeSmile: null } }
      ],
      metricDefinitions: [{ id: "fiabBikeSmile" }],
      coverageAudit: {
        metrics: [
          {
            id: "fiabBikeSmile",
            citiesWithValue: 0,
            coveragePercent: 0,
            sparse: true,
            cityCount: 99
          }
        ],
        categories: [{ category: "policy", coveragePercent: 0 }],
        sparseSignals: []
      }
    };

    syncCoverageAuditMetrics(payload);
    const fiab = payload.coverageAudit.metrics[0];
    expect(fiab.citiesWithValue).toBe(1);
    expect(fiab.coveragePercent).toBe(50);
    expect(fiab.cityCount).toBeUndefined();
  });

  it("validateMetricCoverageEntries fails when citiesWithValue drifts from rawMetrics", () => {
    const ranking = {
      cities: [{ rawMetrics: { fiabBikeSmile: 3 } }, { rawMetrics: { fiabBikeSmile: 4 } }],
      coverageAudit: {
        cityCount: 2,
        metrics: [
          {
            id: "fiabBikeSmile",
            citiesWithValue: 1,
            coveragePercent: 50
          }
        ]
      }
    };

    const failures = validateMetricCoverageEntries(ranking);
    expect(failures.some((message) => message.includes("citiesWithValue"))).toBe(true);
    expect(failures.some((message) => message.includes("cityCount"))).toBe(false);
  });

  it("validateMetricCoverageEntries rejects per-metric cityCount", () => {
    const ranking = {
      cities: [{ rawMetrics: { fiabBikeSmile: 3 } }],
      coverageAudit: {
        cityCount: 1,
        metrics: [
          {
            id: "fiabBikeSmile",
            citiesWithValue: 1,
            coveragePercent: 100,
            cityCount: 1
          }
        ]
      }
    };

    const failures = validateMetricCoverageEntries(ranking);
    expect(failures.some((message) => message.includes("unexpected per-metric cityCount"))).toBe(
      true
    );
  });
});
