export type CategoryKey =
  | "infrastructure"
  | "safety"
  | "usage"
  | "connectivity"
  | "policy"
  | "comfort"
  | "dataConfidence";

export type Weights = Record<CategoryKey, number>;

export interface MetricDefinition {
  id: string;
  slug?: string;
  label: string;
  shortLabel: string;
  unit: string;
  direction: "higher" | "lower";
  category: Exclude<CategoryKey, "dataConfidence">;
  categoryWeight: number;
  sourceId: string;
  transform: string;
  domainMin?: number;
  domainMax?: number;
}

export interface SourceEntry {
  id: string;
  title: string;
  publisher: string;
  url: string;
  accessDate: string;
  reliability: "high" | "medium" | "medium-low" | "low" | "interim";
  notes: string;
}

export interface CityRanking {
  id: string;
  city: string;
  rank: number;
  score: number;
  dataConfidence: number;
  regionId: string;
  sizeClass: number | null;
  rawMetrics: Record<string, number | null>;
  normalizedMetrics: Record<string, number | null>;
  metricSources: Record<string, string>;
  manualSources: string[];
  categoryScores: Record<Exclude<CategoryKey, "dataConfidence">, number | null>;
  categoryCoverage: Record<Exclude<CategoryKey, "dataConfidence">, number>;
  strengths: string[];
  weaknesses: string[];
  uncertainty: string;
  missingMetrics: string[];
  policySignals?: string[];
  externalCyclingScore?: number | null;
  externalInfrastructureScore?: number | null;
  externalUsageScore?: number | null;
}

export interface MetricCoverageEntry {
  id: string;
  label: string;
  category: Exclude<CategoryKey, "dataConfidence">;
  sourceId: string;
  citiesWithValue: number;
  coveragePercent: number;
  sparse: boolean;
  manual: boolean;
}

export interface CategoryCoverageEntry {
  category: Exclude<CategoryKey, "dataConfidence">;
  defaultWeight: number;
  citiesWithCategoryScore: number;
  coveragePercent: number;
  averageMetricCoveragePercent: number;
  includedInDefaultScore: boolean;
  sparse: boolean;
}

export interface CoverageAudit {
  cityCount: number;
  defaultWeightTotal: number;
  highCoverageThresholdPercent: number;
  categories: CategoryCoverageEntry[];
  metrics: MetricCoverageEntry[];
  sparseSignals: string[];
  defaultScoreCategories: Exclude<CategoryKey, "dataConfidence">[];
  contextualCategories: Exclude<CategoryKey, "dataConfidence">[];
  notes: string[];
}

export type NationalContextReliability =
  | "high"
  | "medium"
  | "medium-low"
  | "low"
  | "interim";

export interface NationalContextItem {
  id: string;
  label: string;
  value: number | string;
  unit: string;
  period: string;
  sourceId: string;
  reliability: NationalContextReliability;
  interpretation: string;
  caveat: string;
  changeVsPrevious?: number | null;
  changeLabel?: string;
}

export interface NationalContextTimelinePoint {
  id: string;
  label: string;
  period: string;
  value: number;
  unit: string;
  sourceId: string;
  reliability: NationalContextReliability;
  interpretation: string;
  caveat: string;
}

export interface NationalContextSection {
  id: string;
  title: string;
  description: string;
  cards: NationalContextItem[];
  timeline?: NationalContextTimelinePoint[];
}

export interface NationalContext {
  disclaimer: string;
  notUsedInRanking: true;
  sections: NationalContextSection[];
}

export interface RankingPayload {
  generatedAt: string;
  accessDate: string;
  title: string;
  summary: string;
  defaultWeights: Weights;
  coverageAudit: CoverageAudit;
  nationalContext: NationalContext;
  metricDefinitions: MetricDefinition[];
  sources: SourceEntry[];
  sourceGaps: string[];
  cities: CityRanking[];
}

export interface RankedCity extends CityRanking {
  adjustedScore: number;
  adjustedRank: number;
}
