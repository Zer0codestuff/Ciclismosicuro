/**
 * Index definition: pillars, metrics, default weights and normalization rules.
 * Kept separate from the build so tests and docs can import it.
 */

export const PILLARS = [
  {
    id: "safety",
    label: "Sicurezza osservata",
    shortLabel: "Sicurezza",
    description:
      "Ciclisti morti e feriti registrati da ISTAT rispetto a un'attesa statistica basata su popolazione e quota storica di pendolari in bici; non è un rischio per viaggio.",
    defaultWeight: 40
  },
  {
    id: "infrastructure",
    label: "Infrastruttura ciclabile",
    shortLabel: "Infrastruttura",
    description: "Quantità e crescita delle piste dichiarate dai Comuni a ISTAT. La mappatura OSM è un dato di contesto, con peso zero.",
    defaultWeight: 25
  },
  {
    id: "traffic",
    label: "Pressione del traffico",
    shortLabel: "Traffico",
    description: "Auto per abitante, incidentalità generale e moderazione della velocità (Zone 30).",
    defaultWeight: 20
  },
  {
    id: "usage",
    label: "Uso della bici",
    shortLabel: "Uso bici",
    description: "Quota storica di pendolari in bici (Censimento 2011) e disponibilità di bike sharing nel 2024, non una misura degli spostamenti attuali.",
    defaultWeight: 15
  },
  {
    id: "transit",
    label: "Trasporto pubblico",
    shortLabel: "TPL",
    description: "Contesto: domanda e offerta di trasporto pubblico locale. Peso 0 nel default.",
    defaultWeight: 0
  },
  {
    id: "environment",
    label: "Qualità dell'aria",
    shortLabel: "Aria",
    description: "Contesto: PM10 e NO2 medi delle centraline comunali. Peso 0 nel default.",
    defaultWeight: 0
  }
];

export const DEFAULT_WEIGHTS = Object.fromEntries(PILLARS.map((pillar) => [pillar.id, pillar.defaultWeight]));

/**
 * normalization:
 *  - "riskRatio": 100 / (1 + r²) → 50 means "in line with expectation", higher is safer.
 *  - "robust": min–max between the 5th and 95th percentile, clamped to 0–100.
 *  - "binary": true → 100, false → 0.
 * transform "log" / "log1p" is applied before robust scaling for skewed metrics.
 */
export const METRICS = [
  {
    id: "injuryRiskRatio",
    pillar: "safety",
    weight: 0.6,
    label: "Morti e feriti in bici rispetto all'atteso",
    shortLabel: "Morti e feriti / attesi",
    unit: "rapporto",
    direction: "lower",
    normalization: "riskRatio",
    digits: 2,
    period: "2022–2024",
    sourceIds: ["istat-incidenti", "istat-censimento-2011", "istat-popolazione"],
    description:
      "Rapporto empirical-Bayes tra morti e feriti registrati nel comune e attesa statistica per popolazione e quota di pendolari in bici del 2011. 1 = attesa del modello; 0,5 = metà dei casi attesi. Non misura il rischio per ciclista, viaggio o km; l'intervallo al 90% è condizionato a modello, proxy e prior stimati."
  },
  {
    id: "fatalityRiskRatio",
    pillar: "safety",
    weight: 0.4,
    label: "Morti in bici rispetto all'atteso",
    shortLabel: "Morti / attesi",
    unit: "rapporto",
    direction: "lower",
    normalization: "riskRatio",
    digits: 2,
    period: "2015–2024",
    sourceIds: ["istat-incidenti", "istat-censimento-2011", "istat-popolazione"],
    description:
      "Rapporto sui soli ciclisti morti entro 30 giorni, su dieci anni perché i decessi sono rari a livello comunale. Meno sensibile alla sottonotifica dei feriti lievi, ma sempre basato sul proxy storico del 2011. Le stime con pochi casi sono ricondotte verso 1; l'intervallo al 90% è condizionato ai parametri stimati."
  },
  {
    id: "cycleLanesPer10k",
    pillar: "infrastructure",
    weight: 0.7,
    label: "Piste ciclabili per 10.000 abitanti",
    shortLabel: "Piste ciclabili",
    unit: "km / 10.000 ab.",
    direction: "higher",
    normalization: "robust",
    digits: 1,
    period: "2024",
    sourceIds: ["istat-ambiente-urbano"],
    description: "Chilometri di piste ciclabili dichiarati dal Comune a ISTAT nel 2024, per 10.000 residenti medi del 2024 (media delle popolazioni al 1° gennaio 2024 e 2025)."
  },
  {
    id: "cycleLaneGrowthPer10k",
    pillar: "infrastructure",
    weight: 0.3,
    label: "Nuove piste 2019–2024 per 10.000 abitanti",
    shortLabel: "Crescita rete",
    unit: "km / 10.000 ab.",
    direction: "higher",
    normalization: "robust",
    digits: 1,
    period: "2019–2024",
    sourceIds: ["istat-ambiente-urbano"],
    description:
      "Variazione dei km dichiarati tra 2019 e 2024, per 10.000 residenti medi del 2024. Se manca uno dei due anni il dato resta mancante; revisioni di misura possono contribuire alla variazione."
  },
  {
    id: "osmSeparatedNetworkShare",
    pillar: "infrastructure",
    weight: 0,
    label: "Rete designata o protetta su rete stradale (OSM, contesto)",
    shortLabel: "Rete mappata OSM",
    unit: "% km strade",
    direction: "higher",
    normalization: "robust",
    digits: 1,
    period: "ott. 2026",
    sourceIds: ["osm"],
    description:
      "Rapporto tra km mappati come highway=cycleway o strade con cycleway=track e km di rete stradale selezionata nell'area comunale. Le geometrie non sono ritagliate al confine e i percorsi misti bicycle=designated sono esclusi. Non certifica protezione, continuità, qualità o copertura; non è una quota di strade protette e può superare il 100%. Peso zero: la completezza OSM varia tra comuni."
  },
  {
    id: "carsPer100",
    pillar: "traffic",
    weight: 0.4,
    label: "Autovetture per 100 abitanti",
    shortLabel: "Auto",
    unit: "auto / 100 ab.",
    direction: "lower",
    normalization: "robust",
    digits: 1,
    period: "31/12/2025",
    sourceIds: ["aci-autoritratto"],
    description:
      "Parco auto ACI al 31 dicembre 2025 per 100 residenti al 1° gennaio 2026 (popolazione stimata ISTAT). Valori >95 esclusi secondo una soglia editoriale per possibili distorsioni da flotte e società di noleggio; non è una misura dei km percorsi o del traffico effettivo."
  },
  {
    id: "roadCasualtiesPer1000",
    pillar: "traffic",
    weight: 0.4,
    label: "Morti e feriti stradali (tutti) per 1.000 abitanti",
    shortLabel: "Incidentalità",
    unit: "per 1.000 ab./anno",
    direction: "lower",
    normalization: "robust",
    digits: 2,
    period: "2022–2024",
    sourceIds: ["istat-incidenti", "istat-popolazione"],
    description: "Tutte le vittime della strada (pedoni, auto, moto, bici) nel comune, media annua 2022–2024."
  },
  {
    id: "osmSlowStreetShare",
    pillar: "traffic",
    weight: 0,
    label: "Strade a 30 km/h o meno (OSM, contesto)",
    shortLabel: "Strade ≤30",
    unit: "% km con limite",
    direction: "higher",
    normalization: "robust",
    digits: 1,
    period: "ott. 2026",
    sourceIds: ["osm"],
    description:
      "Quota dei km di rete con limite mappato o classificati living_street che hanno limite ≤30 km/h o sono living_street, senza duplicare le strade presenti in entrambi gli insiemi. Calcolata solo se la copertura dei limiti raggiunge il 40%. Peso zero: dati volontari non uniformemente completi."
  },
  {
    id: "zone30",
    pillar: "traffic",
    weight: 0.2,
    label: "Zone 30 attive",
    shortLabel: "Zone 30",
    unit: "sì/no",
    direction: "higher",
    normalization: "binary",
    digits: 0,
    period: "2024",
    sourceIds: ["istat-ambiente-urbano"],
    description: "Presenza di almeno una Zona 30 dichiarata dal Comune a ISTAT nel 2024."
  },
  {
    id: "bikeCommuteShare",
    pillar: "usage",
    weight: 0.7,
    label: "Pendolari in bici nel 2011",
    shortLabel: "Quota bici",
    unit: "% pendolari",
    direction: "higher",
    normalization: "robust",
    transform: "log",
    digits: 1,
    period: "2011",
    sourceIds: ["istat-censimento-2011"],
    description:
      "Quota di residenti pendolari che andavano al lavoro o a scuola in bicicletta nel Censimento 2011. Proxy storico disponibile per tutti i comuni, non quota attuale di chi pedala né di tutti gli spostamenti."
  },
  {
    id: "bikeSharingPer10k",
    pillar: "usage",
    weight: 0.3,
    label: "Biciclette in sharing per 10.000 abitanti",
    shortLabel: "Bike sharing",
    unit: "bici / 10.000 ab.",
    direction: "higher",
    normalization: "robust",
    transform: "log1p",
    digits: 1,
    period: "2024",
    sourceIds: ["istat-ambiente-urbano"],
    description: "Biciclette dei servizi di bike sharing (stazioni fisse e free floating)."
  },
  {
    id: "transitPassengersPerCapita",
    pillar: "transit",
    weight: 0.5,
    label: "Passeggeri TPL per abitante",
    shortLabel: "Passeggeri TPL",
    unit: "viaggi / ab. / anno",
    direction: "higher",
    normalization: "robust",
    transform: "log1p",
    digits: 0,
    period: "2024",
    sourceIds: ["istat-ambiente-urbano"],
    description: "Domanda di trasporto pubblico locale (bus, tram, metro, ecc.)."
  },
  {
    id: "transitSeatKmPerCapita",
    pillar: "transit",
    weight: 0.5,
    label: "Offerta TPL (posti-km per abitante)",
    shortLabel: "Offerta TPL",
    unit: "posti-km / ab.",
    direction: "higher",
    normalization: "robust",
    transform: "log1p",
    digits: 0,
    period: "2024",
    sourceIds: ["istat-ambiente-urbano"],
    description: "Posti-km offerti dal trasporto pubblico locale per residente."
  },
  {
    id: "pm10",
    pillar: "environment",
    weight: 0.5,
    label: "PM10 medio annuo",
    shortLabel: "PM10",
    unit: "µg/m³",
    direction: "lower",
    normalization: "robust",
    digits: 1,
    period: "2024",
    sourceIds: ["istat-ambiente-urbano"],
    description: "Media delle concentrazioni annue delle centraline comunali con misure valide."
  },
  {
    id: "no2",
    pillar: "environment",
    weight: 0.5,
    label: "NO2 medio annuo",
    shortLabel: "NO2",
    unit: "µg/m³",
    direction: "lower",
    normalization: "robust",
    digits: 1,
    period: "2024",
    sourceIds: ["istat-ambiente-urbano"],
    description: "Media delle concentrazioni annue delle centraline comunali con misure valide."
  }
];

/** Robust-scaling bounds. */
export const LOWER_PERCENTILE = 0.05;
export const UPPER_PERCENTILE = 0.95;
/** OSM speed-limit share is only trusted when limits are mapped on enough of the network. */
export const MIN_MAXSPEED_TAG_COVERAGE = 0.4;

export function riskRatioScore(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  return 100 / (1 + ratio * ratio);
}

export function transformValue(value, transform) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (transform === "log") return value > 0 ? Math.log(value) : null;
  if (transform === "log1p") return value >= 0 ? Math.log1p(value) : null;
  return value;
}

/** Weighted mean over available entries; returns null when nothing is available. */
export function weightedMean(entries) {
  const available = entries.filter((entry) => Number.isFinite(entry.value) && Number.isFinite(entry.weight) && entry.weight > 0);
  const totalWeight = available.reduce((total, entry) => total + entry.weight, 0);
  if (totalWeight <= 0) return null;
  return available.reduce((total, entry) => total + entry.value * entry.weight, 0) / totalWeight;
}

/** Available positive metric weight, before reweighting; zero-weight context is excluded. */
export function weightedCoverage(entries) {
  const eligible = entries.filter((entry) => Number.isFinite(entry.weight) && entry.weight > 0);
  const totalWeight = eligible.reduce((total, entry) => total + entry.weight, 0);
  if (totalWeight === 0) return null;
  return eligible.filter((entry) => Number.isFinite(entry.value)).reduce((total, entry) => total + entry.weight, 0) / totalWeight;
}
