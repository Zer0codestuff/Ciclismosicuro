import { DEFAULT_WEIGHTS } from "../scoring";
import type { CityRanking, RankingPayload } from "../types";

export function sampleCity(
  name: string,
  rank: number,
  score: number,
  overrides: Partial<CityRanking> = {}
): CityRanking {
  return {
    id: name.toLowerCase().replace(/\s+/g, "-"),
    city: name,
    rank,
    score,
    dataConfidence: 95,
    regionId: "8",
    sizeClass: 2,
    rawMetrics: {
      cycleNetworkEquivalent: 10,
      fiabBikeSmile: null
    },
    normalizedMetrics: {
      cycleNetworkEquivalent: 70
    },
    metricSources: {
      cycleNetworkEquivalent: "lab24-piste-ciclabili-2024"
    },
    manualSources: [],
    categoryScores: {
      infrastructure: 70,
      safety: 60,
      usage: null,
      connectivity: 55,
      policy: null,
      comfort: 50
    },
    categoryCoverage: {
      infrastructure: 100,
      safety: 100,
      usage: 0,
      connectivity: 100,
      policy: 0,
      comfort: 100
    },
    strengths: ["infrastruttura ciclabile"],
    weaknesses: ["uso bici"],
    uncertainty: "Dati di test.",
    missingMetrics: [],
    ...overrides
  };
}

export const minimalRankingPayload: RankingPayload = {
  generatedAt: "2026-05-23T00:00:00.000Z",
  accessDate: "2026-05-23",
  title: "Ranking test",
  summary: "Payload minimo per test UI.",
  defaultWeights: DEFAULT_WEIGHTS,
  coverageAudit: {
    cityCount: 2,
    defaultWeightTotal: 100,
    highCoverageThresholdPercent: 95,
    categories: [
      {
        category: "infrastructure",
        defaultWeight: 50,
        citiesWithCategoryScore: 2,
        coveragePercent: 100,
        averageMetricCoveragePercent: 100,
        includedInDefaultScore: true,
        sparse: false
      },
      {
        category: "policy",
        defaultWeight: 0,
        citiesWithCategoryScore: 0,
        coveragePercent: 0,
        averageMetricCoveragePercent: 0,
        includedInDefaultScore: false,
        sparse: true
      }
    ],
    metrics: [
      {
        id: "cycleNetworkEquivalent",
        label: "Piste ciclabili equivalenti",
        category: "infrastructure",
        sourceId: "lab24-piste-ciclabili-2024",
        citiesWithValue: 2,
        coveragePercent: 100,
        sparse: false,
        manual: false
      },
      {
        id: "fiabBikeSmile",
        label: "FIAB bike-smile",
        category: "policy",
        sourceId: "fiab-comuni-ciclabili",
        citiesWithValue: 0,
        coveragePercent: 0,
        sparse: true,
        manual: true
      }
    ],
    sparseSignals: ["FIAB bike-smile (0% copertura città)"],
    defaultScoreCategories: ["infrastructure", "safety", "connectivity", "comfort"],
    contextualCategories: ["usage", "policy"],
    notes: ["Nota di test sulla copertura."]
  },
  nationalContext: {
    disclaimer: "Contesto di test.",
    notUsedInRanking: true,
    sections: []
  },
  metricDefinitions: [
    {
      id: "cycleNetworkEquivalent",
      label: "Piste ciclabili equivalenti",
      shortLabel: "Ciclabili",
      unit: "km/1000",
      direction: "higher",
      category: "infrastructure",
      categoryWeight: 50,
      sourceId: "lab24-piste-ciclabili-2024",
      transform: "normalize"
    }
  ],
  sources: [
    {
      id: "lab24-piste-ciclabili-2024",
      title: "Lab24 piste ciclabili",
      publisher: "Lab24",
      url: "https://example.com/piste",
      accessDate: "2026-05-23",
      reliability: "high",
      notes: "Fixture"
    }
  ],
  sourceGaps: [],
  cities: [
    sampleCity("Alpha", 1, 80, {
      categoryScores: {
        infrastructure: 90,
        safety: 40,
        usage: null,
        connectivity: 55,
        policy: null,
        comfort: 50
      }
    }),
    sampleCity("Beta", 2, 65, {
      categoryScores: {
        infrastructure: 50,
        safety: 90,
        usage: null,
        connectivity: 55,
        policy: null,
        comfort: 50
      }
    })
  ]
};
