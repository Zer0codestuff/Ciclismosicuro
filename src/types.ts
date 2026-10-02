export type PillarId = "safety" | "infrastructure" | "traffic" | "usage" | "transit" | "environment";

export type Weights = Record<PillarId, number>;

export interface Pillar {
  id: PillarId;
  label: string;
  shortLabel: string;
  description: string;
  defaultWeight: number;
}

export interface MetricDefinition {
  id: string;
  pillar: PillarId;
  weight: number;
  label: string;
  shortLabel: string;
  unit: string;
  direction: "higher" | "lower";
  normalization: "riskRatio" | "robust" | "binary";
  transform?: "log" | "log1p";
  digits: number;
  period: string;
  sourceIds: string[];
  description: string;
}

export interface SourceEntry {
  id: string;
  title: string;
  publisher: string;
  url: string;
  license: string;
  period: string;
  notes: string;
}

export interface CitySafety {
  period: string;
  casualties: number;
  casualtiesPerYear: number;
  expected: number;
  ratio: number;
  ratioLow: number;
  ratioHigh: number;
  rawRatio: number;
  lethalityIndex: number;
  perResident100k: number;
  perBikeCommuter1000: number;
  deaths: number;
  deathsPeriod: string;
  expectedDeaths: number;
  fatalityRatio: number;
  fatalityRatioLow: number;
  fatalityRatioHigh: number;
  exposureScenarios?: ExposureScenario[];
}

export interface ExposureScenario {
  multiplier: number;
  ratio: number;
  fatalityRatio: number;
  score: number;
  rank: number;
}

export interface DataCoverage {
  metricsAvailable: number;
  metricsTotal: number;
  pillarCoverage: Record<PillarId, number | null>;
  missingMetricIds: string[];
  defaultWeightedCoverage: number | null;
}

export interface CrashYear {
  year: number;
  killed: number;
  injured: number;
  ebike: number;
  escooter: number;
}

export interface CrashProfile {
  period: string;
  casualties: number;
  killed: number;
  intersectionShare: number | null;
  carShare: number | null;
  heavyShare: number | null;
  aloneShare: number | null;
  hitAndRunShare: number | null;
  over64Share: number | null;
  nightShare: number | null;
  ebikeShare: number | null;
}

export interface CityContext {
  bikeCommuters2011: number;
  commuters2011: number;
  carCommuteShare2011: number;
  cars: number;
  carsPer100Raw: number;
  ztl: boolean;
  pedestrianArea: boolean;
  zone30Expanding: boolean;
  cycleLaneDensity: number | null;
  osm: {
    separatedKm: number;
    paintedLaneKm: number;
    roadKm: number;
    maxspeedTagCoverage: number;
    bikeParking: number;
    timestamp: string | null;
  } | null;
}

export interface City {
  id: string;
  name: string;
  officialName: string;
  istatCode: string;
  region: string;
  area: string;
  macroArea: "Nord" | "Centro" | "Mezzogiorno";
  metropolitanCapital: boolean;
  sizeClass: "grande" | "media" | "piccola";
  population: number;
  populationYear: number;
  lat: number;
  lon: number;
  score: number;
  rank: number;
  rankRange: [number, number];
  exposureRankRange?: [number, number];
  dataCoverage?: DataCoverage;
  pillarScores: Record<PillarId, number | null>;
  metrics: Record<string, number | boolean | null>;
  metricScores: Record<string, number | null>;
  safety: CitySafety;
  crashSeries: CrashYear[];
  crashProfile: CrashProfile;
  cycleLaneSeries: { year: number; km: number | null }[];
  context: CityContext;
  flags: string[];
}

export interface NationalYear {
  year: number;
  cyclistKilled: number;
  cyclistInjured: number;
  ebikeCasualties: number;
  escooterCasualties: number;
  allKilled: number;
  allInjured: number;
  capitalsCyclistCasualties: number;
}

export interface MacroAreaFinding {
  area: string;
  cities: number;
  medianBikeShare: number;
  medianRiskRatio: number;
  medianScore: number;
  medianLethalityIndex: number;
}

export interface Findings {
  lastYear: number;
  cyclistKilledLastYear: number;
  cyclistInjuredLastYear: number;
  cyclistKilledPreAverage: number;
  cyclistKilledRecentAverage: number;
  cyclistInjuredPreAverage: number;
  cyclistInjuredRecentAverage: number;
  ebikeShareFirst: number;
  ebikeShareLast: number;
  capitalsShareOfCyclistCasualties: number;
  safetyInNumbersExponent: number;
  safetyInNumbersCi: [number, number];
  casualtiesPerProxyWhenDoubling: number;
  casualtiesWhenDoubling: number;
  perResidentVsBikeShareCorrelation: number;
  lanesVsRiskCorrelation: number;
  lanesVsBikeShareCorrelation: number;
  roadCasualtiesVsRiskCorrelation: number;
  carsVsRiskCorrelation: number;
  profile: {
    period: string;
    casualties: number;
    killed: number;
    carShare: number;
    heavyShare: number;
    aloneShare: number;
    hitAndRunShare: number;
    intersectionShare: number;
    over64ShareOfCasualties: number;
    over64ShareOfDeaths: number;
    nightShare: number;
    hours: number[];
    weekdays: number[];
    opponents: Record<string, number>;
  };
  macroAreas: MacroAreaFinding[];
}

export interface RiskModelSummary {
  period: string;
  intercept: number;
  exponent: number;
  exponentSe: number;
  dispersion: number;
  priorAlpha: number;
}

export interface RankingPayload {
  schemaVersion: 2;
  generatedAt: string;
  title: string;
  summary: string;
  cityCount: number;
  defaultWeights: Weights;
  pillars: Pillar[];
  metrics: MetricDefinition[];
  model: {
    description: string;
    injury: RiskModelSummary;
    fatality: RiskModelSummary;
    sensitivity: { draws: number; concentration: number; interval: [number, number]; description?: string };
    standardErrorMethod?: string;
    interval?: { level: number; description: string };
    exposureSensitivity?: { multipliers: [number, number]; description: string };
  };
  findings: Findings;
  national: NationalYear[];
  limitations: string[];
  sources: SourceEntry[];
  cities: City[];
}

/** A city with the score/rank recomputed for the user's current weights. */
export interface RankedCity extends City {
  liveScore: number | null;
  liveRank: number | null;
}
