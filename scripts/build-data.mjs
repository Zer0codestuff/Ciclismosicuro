import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  canonicalCityKey,
  indexCitiesByCanonicalKey,
  validateManualEnrichmentKeys
} from "./city-keys.mjs";
import { buildRankingCsvRows, toCsv } from "./csv-export.mjs";

const ROOT = process.cwd();
const ACCESS_DATE = new Date().toISOString().slice(0, 10);
const LAB24_BASE = "https://lab24.ilsole24ore.com/ecosistema-urbano/tabelle/2024";
const MISSING_CATEGORY_FALLBACK = 20;
const HIGH_COVERAGE_THRESHOLD_PERCENT = 95;
const SPARSE_COVERAGE_THRESHOLD_PERCENT = 20;

const defaultWeights = {
  infrastructure: 50,
  safety: 25,
  usage: 0,
  connectivity: 15,
  policy: 0,
  comfort: 5,
  dataConfidence: 5
};

const metrics = [
  {
    id: "cycleNetworkEquivalent",
    slug: "piste-ciclabili",
    label: "Piste ciclabili equivalenti",
    shortLabel: "Ciclabili",
    unit: "m eq / 100 abitanti",
    direction: "higher",
    category: "infrastructure",
    categoryWeight: 0.8,
    sourceId: "lab24-piste-ciclabili-2024",
    transform: "Valore pubblicato da Ecosistema Urbano 2024; normalizzato min-max 0-100."
  },
  {
    id: "pedestrianAreas",
    slug: "isole-pedonali",
    label: "Isole pedonali",
    shortLabel: "Pedonalita",
    unit: "mq / abitante",
    direction: "higher",
    category: "infrastructure",
    categoryWeight: 0.2,
    sourceId: "lab24-isole-pedonali-2024",
    transform: "Valore pubblicato; proxy di spazio urbano calmo e accessibile anche in bici dove consentito."
  },
  {
    id: "roadVictims",
    slug: "vittime-della-strada",
    label: "Morti e feriti stradali",
    shortLabel: "Sicurezza",
    unit: "morti+feriti / 1.000 abitanti",
    direction: "lower",
    category: "safety",
    categoryWeight: 0.65,
    sourceId: "lab24-vittime-strada-2024",
    transform: "Valore pubblicato; invertito e normalizzato per premiare minori tassi di incidentalita."
  },
  {
    id: "motorizationRate",
    slug: "tasso-di-motorizzazione",
    label: "Tasso di motorizzazione",
    shortLabel: "Auto",
    unit: "auto / 100 abitanti",
    direction: "lower",
    category: "safety",
    categoryWeight: 0.35,
    sourceId: "lab24-motorizzazione-2024",
    transform: "Valore pubblicato; invertito come proxy di pressione auto su spazio stradale."
  },
  {
    id: "publicTransportPassengers",
    slug: "passeggeri-trasporto-pubblico",
    label: "Passeggeri trasporto pubblico",
    shortLabel: "TPL uso",
    unit: "viaggi / abitante / anno",
    direction: "higher",
    category: "connectivity",
    categoryWeight: 0.25,
    sourceId: "lab24-tpl-passeggeri-2024",
    transform: "Valore pubblicato; proxy di alternative all'auto e domanda di mobilita sostenibile."
  },
  {
    id: "publicTransportOffer",
    slug: "offerta-trasporto-pubblico",
    label: "Offerta trasporto pubblico",
    shortLabel: "TPL offerta",
    unit: "km vettura / abitante",
    direction: "higher",
    category: "connectivity",
    categoryWeight: 0.35,
    sourceId: "lab24-tpl-offerta-2024",
    transform: "Valore pubblicato; proxy di rete multimodale utile anche a intermodalita bici+TPL."
  },
  {
    id: "ztl",
    slug: "ztl",
    label: "Zone a traffico limitato",
    shortLabel: "ZTL",
    unit: "mq / 100 abitanti",
    direction: "higher",
    category: "connectivity",
    categoryWeight: 0.25,
    sourceId: "lab24-ztl-2024",
    transform: "Valore pubblicato; proxy di moderazione/accesso limitato al traffico motorizzato."
  },
  {
    id: "nitrogenDioxide",
    slug: "biossido-di-azoto",
    label: "Biossido di azoto",
    shortLabel: "NO2",
    unit: "ug/mc",
    direction: "lower",
    category: "comfort",
    categoryWeight: 0.3,
    sourceId: "lab24-no2-2024",
    transform: "Valore pubblicato; invertito per premiare aria piu respirabile."
  },
  {
    id: "pm10",
    slug: "pm-10",
    label: "PM10",
    shortLabel: "PM10",
    unit: "ug/mc",
    direction: "lower",
    category: "comfort",
    categoryWeight: 0.25,
    sourceId: "lab24-pm10-2024",
    transform: "Valore pubblicato; invertito per premiare minore esposizione a particolato."
  },
  {
    id: "pm25",
    slug: "pm-25",
    label: "PM2.5",
    shortLabel: "PM2.5",
    unit: "ug/mc",
    direction: "lower",
    category: "comfort",
    categoryWeight: 0.25,
    sourceId: "lab24-pm25-2024",
    transform: "Valore pubblicato; invertito per premiare minore esposizione a particolato fine."
  },
  {
    id: "ozone",
    slug: "ozono",
    label: "Ozono",
    shortLabel: "O3",
    unit: "giorni superamento",
    direction: "lower",
    category: "comfort",
    categoryWeight: 0.2,
    sourceId: "lab24-ozono-2024",
    transform: "Valore pubblicato; invertito per premiare minori superamenti."
  }
];

const manualMetrics = [
  {
    id: "fiabBikeSmile",
    label: "FIAB bike-smile",
    shortLabel: "FIAB",
    unit: "1-5",
    direction: "higher",
    domainMin: 1,
    domainMax: 5,
    category: "policy",
    categoryWeight: 0.65,
    sourceId: "fiab-comuni-ciclabili",
    transform: "Valutazioni FIAB inserite solo dove rintracciate; normalizzate su scala 1-5 e penalizzate con confidenza inferiore rispetto a serie complete."
  },
  {
    id: "bikeModalSharePercent",
    label: "Quota modale bicicletta",
    shortLabel: "Quota bici",
    unit: "%",
    direction: "higher",
    domainMin: 0,
    domainMax: 30,
    category: "usage",
    categoryWeight: 1,
    sourceId: "legambiente-abc-2015",
    transform: "Dato storico puntuale usato come segnale di uso effettivo dove disponibile; non interpolato sulle citta mancanti."
  },
  {
    id: "externalPolicyScore",
    label: "Score policy esterno",
    shortLabel: "Policy ext",
    unit: "0-100",
    direction: "higher",
    domainMin: 0,
    domainMax: 100,
    category: "policy",
    categoryWeight: 0.35,
    sourceId: "copenhagenize-bologna-2025",
    transform: "Usato solo per Bologna, dove Copenhagenize pubblica lo score di Policy and Support."
  }
];

const sourceRegistry = [
  {
    id: "lab24-ecosistema-urbano-2024",
    title: "Ecosistema Urbano 2024 - tabelle indicatori",
    publisher: "Il Sole 24 Ore Lab24 / Legambiente / Ambiente Italia",
    url: "https://lab24.ilsole24ore.com/ecosistema-urbano/tabelle/2024/piste-ciclabili",
    accessDate: ACCESS_DATE,
    reliability: "high",
    notes: "Tabelle pubbliche per 106 capoluoghi; valori dichiarati/elaborati nel report Ecosistema Urbano 2024."
  },
  {
    id: "istat-ambiente-urbano-2023",
    title: "Ambiente urbano - Anno 2023",
    publisher: "ISTAT",
    url: "https://www.istat.it/comunicato-stampa/ambiente-urbano-anno-2023/",
    accessDate: ACCESS_DATE,
    reliability: "high",
    notes: "Contesto ufficiale della rilevazione Dati ambientali nelle citta su mobilita sostenibile, TPL, aria e ambiente urbano."
  },
  {
    id: "istat-questionario-mobilita-2024",
    title: "Questionario 2024 - Mobilita, Dati ambientali nelle citta",
    publisher: "ISTAT",
    url: "https://www.istat.it/fascicoloSidi/1720/Questionario%202024%20-%20Mobilit%C3%A0.pdf",
    accessDate: ACCESS_DATE,
    reliability: "high",
    notes: "Definisce variabili raccolte su TPL, bike sharing, piste ciclabili, ZTL e Zone 30."
  },
  {
    id: "fiab-comuni-ciclabili",
    title: "FIAB ComuniCiclabili",
    publisher: "FIAB",
    url: "https://www.comuniciclabili.it/",
    accessDate: ACCESS_DATE,
    reliability: "medium",
    notes: "Riconoscimento qualitativo 1-5 bike-smile; copertura non universale e non sostituisce metriche comunali."
  },
  {
    id: "fiab-2024",
    title: "ComuniCiclabili 2024",
    publisher: "FIAB / ComuniCiclabili",
    url: "https://www.comuniciclabili.it/2024/",
    accessDate: ACCESS_DATE,
    reliability: "medium",
    notes: "Fonte per valutazioni 2024 rintracciate in comuni aderenti."
  },
  {
    id: "fiab-2023",
    title: "ComuniCiclabili 2023 - massimo punteggio",
    publisher: "ANSA / FIAB",
    url: "https://www.ansa.it/trentino/notizie/2023/07/14/bolzano-si-conferma-fra-i-comuniciclabili-di-fiab_1a64a32a-b571-4d7a-8d49-3b900bf59a20.html",
    accessDate: ACCESS_DATE,
    reliability: "medium",
    notes: "Fonte secondaria per comuni con massimo punteggio FIAB citati nel 2023."
  },
  {
    id: "comune-pesaro-fiab-2024",
    title: "Pesaro confermata 5 bike-smile FIAB",
    publisher: "Comune di Pesaro",
    url: "https://www.comune.pesaro.pu.it/novita-in-comune/dettaglio/news/il-risultato-annunciato-durante-la-cerimonia-dei-comuniciclabili-fiab-promossa-dalla-federazione-ita/",
    accessDate: ACCESS_DATE,
    reliability: "medium",
    notes: "Fonte comunale per conferma del punteggio FIAB di Pesaro."
  },
  {
    id: "comune-parma-fiab-2024",
    title: "Parma riconfermata citta a misura di bicicletta",
    publisher: "Comune di Parma",
    url: "https://www.comune.parma.it/it/novita/notizie/parma-riconfermata-citta-a-misura-di-bicicletta",
    accessDate: ACCESS_DATE,
    reliability: "medium",
    notes: "Fonte comunale per FIAB 4 bike-smile di Parma."
  },
  {
    id: "fiab-2024-pordenone",
    title: "Pordenone conferma 4 bike-smile",
    publisher: "Il Friuli / FIAB",
    url: "https://www.ilfriuli.it/cronaca/municipalita-regionali-comuniciclabili-2024-fiab/",
    accessDate: ACCESS_DATE,
    reliability: "medium",
    notes: "Fonte secondaria per punteggio e nota su Zone 30 di Pordenone."
  },
  {
    id: "legambiente-abc-2015",
    title: "A Bi Ci della ciclabilita - quote modali storiche",
    publisher: "Legambiente / Rete Mobilita Nuova, ripreso da Il Sole 24 Ore",
    url: "https://st.ilsole24ore.com/art/notizie/2015-04-29/bolzano-pesaro-ferrara-e-treviso-capitali-bici--085335.shtml?uuid=ABbu1fXD",
    accessDate: ACCESS_DATE,
    reliability: "low",
    notes: "Dato storico utile come segnale, non come fotografia attuale; pesato con bassa copertura."
  },
  {
    id: "copenhagenize-bologna-2025",
    title: "Bologna - Copenhagenize Index 2025",
    publisher: "Copenhagenize Index",
    url: "https://copenhagenizeindex.eu/index.php/project/bologna/",
    accessDate: ACCESS_DATE,
    reliability: "medium",
    notes: "Benchmark internazionale puntuale per Bologna; non disponibile per tutti i capoluoghi italiani."
  },
  {
    id: "osm-overpass-candidate",
    title: "OpenStreetMap Overpass API",
    publisher: "OpenStreetMap contributors",
    url: "https://wiki.openstreetmap.org/wiki/Overpass_API",
    accessDate: ACCESS_DATE,
    reliability: "medium",
    notes: "Candidato per protected lanes, bike parking e bike sharing; non incluso nello score default per evitare confronti parziali senza audit di copertura comunale."
  },
  {
    id: "istat-incidenti-stradali-2024",
    title: "Incidenti stradali in Italia - Anno 2024",
    publisher: "ISTAT / ACI",
    url: "https://www.istat.it/comunicato-stampa/incidenti-stradali-in-italia-2024/",
    accessDate: ACCESS_DATE,
    reliability: "high",
    notes: "Serie ufficiale nazionale su incidenti con feriti/morti, costi sociali e mercato biciclette/e-bike 2024."
  },
  {
    id: "aci-istat-province-2024",
    title: "ACI-ISTAT - Incidenti stradali 2024 nelle 107 province italiane",
    publisher: "ACI / ISTAT",
    url: "https://aci.gov.it/comunicati-stampa/aci-istat-gli-incidenti-stradali-2024-nelle-107-province-italiane/",
    accessDate: ACCESS_DATE,
    reliability: "high",
    notes: "Dettaglio provinciale/nazionale su incidenti coinvolgenti ciclisti tradizionali ed e-bike nel 2024."
  },
  {
    id: "isfort-audimob-xxii-2025",
    title: "ISFORT - XXII Rapporto sulla mobilita degli italiani (Audimob)",
    publisher: "ISFORT / Regione Puglia (sintesi pubblica)",
    url: "https://protezionecivile.regione.puglia.it/web/ufficio-statistico/-/isfort.-xxii-rapporto-sulla-mobilita-degli-italiani",
    accessDate: ACCESS_DATE,
    reliability: "interim",
    notes: "Sintesi pubblica del rapporto Audimob; dati primo semestre 2025, utili come contesto modale provvisorio."
  },
  {
    id: "fiab-indagine-furti-bici",
    title: "FIAB - Indagine sui furti di biciclette in Italia",
    publisher: "FIAB",
    url: "https://fiabitalia.it/indagine-furti-bici/",
    accessDate: ACCESS_DATE,
    reliability: "medium-low",
    notes: "Stima FIAB sui furti annuali; l'Italia non dispone di serie ufficiale comparabile sui furti di biciclette."
  }
];

function buildNationalContext() {
  return {
    disclaimer:
      "Contesto nazionale informativo: non entra nel ranking comparabile dei capoluoghi e non modifica pesi o score cittadini.",
    notUsedInRanking: true,
    sections: [
      {
        id: "roadSafety",
        title: "Sicurezza stradale nazionale",
        description:
          "Serie ufficiali ISTAT/ACI 2024 su incidentalita generale e coinvolgimento di ciclisti tradizionali ed e-bike.",
        cards: [
          {
            id: "injuryCrashes2024",
            label: "Incidenti con feriti",
            value: 173364,
            unit: "incidenti",
            period: "2024",
            sourceId: "istat-incidenti-stradali-2024",
            reliability: "high",
            interpretation: "Incidenti stradali con almeno un ferito registrati in Italia nel 2024.",
            caveat: "Contesto nazionale generale; non sostituisce i tassi comunali Lab24 usati nel ranking.",
            changeVsPrevious: 4.1,
            changeLabel: "vs 2023"
          },
          {
            id: "roadDeaths2024",
            label: "Decessi stradali",
            value: 3030,
            unit: "decessi",
            period: "2024",
            sourceId: "istat-incidenti-stradali-2024",
            reliability: "high",
            interpretation: "Vittime della strada in incidenti registrati nel 2024.",
            caveat: "Include tutti i modi e tipologie di incidente, non solo ciclisti.",
            changeVsPrevious: -0.3,
            changeLabel: "vs 2023"
          },
          {
            id: "injured2024",
            label: "Feriti stradali",
            value: 233853,
            unit: "feriti",
            period: "2024",
            sourceId: "istat-incidenti-stradali-2024",
            reliability: "high",
            interpretation: "Persone ferite negli incidenti stradali con almeno un ferito nel 2024.",
            caveat: "Conteggio persone ferite, non incidenti.",
            changeVsPrevious: 4.1,
            changeLabel: "vs 2023"
          },
          {
            id: "socialCostInjuryCrashes2024",
            label: "Costo sociale incidenti con feriti",
            value: "poco oltre 18",
            unit: "mld EUR",
            period: "2024",
            sourceId: "istat-incidenti-stradali-2024",
            reliability: "high",
            interpretation: "Stima del costo sociale degli incidenti con feriti pubblicata da ISTAT/ACI.",
            caveat: "Valore comunicato come approssimazione ('poco oltre 18 mld EUR'), non cifra puntualmente arrotondata."
          },
          {
            id: "traditionalBikeIncidents2024",
            label: "Incidenti con biciclette tradizionali",
            value: 15237,
            unit: "incidenti",
            period: "2024",
            sourceId: "aci-istat-province-2024",
            reliability: "high",
            interpretation: "Incidenti stradali che coinvolgono biciclette tradizionali.",
            caveat: "Dato nazionale da release provinciale ACI-ISTAT; non disponibile per singoli capoluoghi in questa pipeline.",
            changeVsPrevious: -19.1,
            changeLabel: "incidenti vs 2023"
          },
          {
            id: "traditionalBikeDeaths2024",
            label: "Decessi ciclisti su bici tradizionali",
            value: 165,
            unit: "decessi",
            period: "2024",
            sourceId: "aci-istat-province-2024",
            reliability: "high",
            interpretation: "Vittime in incidenti con biciclette tradizionali.",
            caveat: "Sottoinsieme dei decessi totali di ciclisti.",
            changeVsPrevious: -19.1,
            changeLabel: "vs 2023"
          },
          {
            id: "ebikeIncidents2024",
            label: "Incidenti con e-bike",
            value: 1767,
            unit: "incidenti",
            period: "2024",
            sourceId: "aci-istat-province-2024",
            reliability: "high",
            interpretation: "Incidenti stradali che coinvolgono biciclette a pedalata assistita.",
            caveat: "Crescita forte su base ancora piu piccola rispetto alle bici tradizionali.",
            changeVsPrevious: 66.7,
            changeLabel: "incidenti vs 2023"
          },
          {
            id: "ebikeDeaths2024",
            label: "Decessi ciclisti su e-bike",
            value: 20,
            unit: "decessi",
            period: "2024",
            sourceId: "aci-istat-province-2024",
            reliability: "high",
            interpretation: "Vittime in incidenti con e-bike.",
            caveat: "Numeri assoluti bassi; variazioni percentuali molto sensibili.",
            changeVsPrevious: 66.7,
            changeLabel: "vs 2023"
          },
          {
            id: "totalCyclistDeaths2024",
            label: "Decessi totali ciclisti",
            value: 185,
            unit: "decessi",
            period: "2024",
            sourceId: "aci-istat-province-2024",
            reliability: "high",
            interpretation: "Somma dei decessi di ciclisti tradizionali ed e-bike nel 2024.",
            caveat: "Contesto nazionale; il ranking cittadino usa proxy Lab24 su morti e feriti stradali complessivi.",
            changeVsPrevious: -12.7,
            changeLabel: "vs 2023"
          }
        ],
        timeline: [
          {
            id: "traditionalBikeIncidents2024",
            label: "Incidenti bici tradizionali",
            period: "2024",
            value: 15237,
            unit: "incidenti",
            sourceId: "aci-istat-province-2024",
            reliability: "high",
            interpretation: "Incidenti con biciclette tradizionali nel 2024.",
            caveat: "Variazione vs 2023: -19.1%; valore 2023 non codificato."
          },
          {
            id: "ebikeIncidents2024",
            label: "Incidenti e-bike",
            period: "2024",
            value: 1767,
            unit: "incidenti",
            sourceId: "aci-istat-province-2024",
            reliability: "high",
            interpretation: "Incidenti con e-bike nel 2024.",
            caveat: "Variazione vs 2023: +66.7%; base numerica piu piccola."
          },
          {
            id: "totalCyclistDeaths2024",
            label: "Decessi totali ciclisti",
            period: "2024",
            value: 185,
            unit: "decessi",
            sourceId: "aci-istat-province-2024",
            reliability: "high",
            interpretation: "Decessi complessivi di ciclisti tradizionali ed e-bike.",
            caveat: "Variazione vs 2023: -12.7%."
          }
        ]
      },
      {
        id: "cyclingMarket",
        title: "Mercato biciclette ed e-bike",
        description:
          "Vendite nazionali 2024 da ISTAT/ACI con confronto 2023 e quota e-bike rispetto al 2019.",
        cards: [
          {
            id: "traditionalBikeSales2024",
            label: "Vendite biciclette tradizionali",
            value: 1080000,
            unit: "unita",
            period: "2024",
            sourceId: "istat-incidenti-stradali-2024",
            reliability: "high",
            interpretation: "Biciclette tradizionali vendute in Italia nel 2024.",
            caveat: "Dato di mercato nazionale, non uso effettivo o parco circolante.",
            changeVsPrevious: -0.9,
            changeLabel: "vs 2023"
          },
          {
            id: "ebikeSales2024",
            label: "Vendite e-bike",
            value: 274000,
            unit: "unita",
            period: "2024",
            sourceId: "istat-incidenti-stradali-2024",
            reliability: "high",
            interpretation: "Biciclette a pedalata assistita vendute in Italia nel 2024.",
            caveat: "Crescita strutturale rispetto al 2019 (+40%); non implica automaticamente piu chilometri in bici.",
            changeVsPrevious: 0.3,
            changeLabel: "vs 2023"
          },
          {
            id: "ebikeShareOfSales2024",
            label: "Quota e-bike sulle vendite",
            value: 20,
            unit: "%",
            period: "2024",
            sourceId: "istat-incidenti-stradali-2024",
            reliability: "high",
            interpretation: "Le e-bike rappresentano circa un quinto delle biciclette vendute nel 2024.",
            caveat: "Quota sulle vendite, non sul parco circolante o sulla quota modale."
          },
          {
            id: "ebikeShareOfSales2019",
            label: "Quota e-bike sulle vendite (2019)",
            value: 11,
            unit: "%",
            period: "2019",
            sourceId: "istat-incidenti-stradali-2024",
            reliability: "high",
            interpretation: "Riferimento storico per il raddoppio della quota e-bike tra 2019 e 2024.",
            caveat: "Confronto tra anni diversi su base vendite, non stock."
          }
        ],
        timeline: [
          {
            id: "traditionalBikeSales2024",
            label: "Vendite bici tradizionali",
            period: "2024",
            value: 1080000,
            unit: "unita",
            sourceId: "istat-incidenti-stradali-2024",
            reliability: "high",
            interpretation: "Vendite bici tradizionali 2024.",
            caveat: "Variazione vs 2023: -0.9%."
          },
          {
            id: "ebikeSales2024",
            label: "Vendite e-bike",
            period: "2024",
            value: 274000,
            unit: "unita",
            sourceId: "istat-incidenti-stradali-2024",
            reliability: "high",
            interpretation: "Vendite e-bike 2024.",
            caveat: "Variazione vs 2023: +0.3%; vs 2019: +40%."
          },
          {
            id: "ebikeSalesShare2019",
            label: "Quota e-bike sulle vendite",
            period: "2019",
            value: 11,
            unit: "%",
            sourceId: "istat-incidenti-stradali-2024",
            reliability: "high",
            interpretation: "Quota e-bike sulle vendite nel 2019.",
            caveat: "Confronto con quota vendite 2024, non stock circolante."
          },
          {
            id: "ebikeSalesShare2024",
            label: "Quota e-bike sulle vendite",
            period: "2024",
            value: 20,
            unit: "%",
            sourceId: "istat-incidenti-stradali-2024",
            reliability: "high",
            interpretation: "Quota e-bike sulle vendite nel 2024.",
            caveat: "Raddoppio della quota rispetto al 2019 sulle vendite."
          }
        ]
      },
      {
        id: "infrastructureTrend",
        title: "Rete ciclabile nei capoluoghi",
        description:
          "Chilometri di rete ciclabile nei capoluoghi di provincia da ISTAT Ambiente urbano 2023.",
        cards: [
          {
            id: "capoluoghiCycleNetwork2023",
            label: "Rete ciclabile capoluoghi",
            value: 5758.9,
            unit: "km",
            period: "2023",
            sourceId: "istat-ambiente-urbano-2023",
            reliability: "high",
            interpretation: "Somma della rete ciclabile rilevata nei capoluoghi di provincia nel 2023.",
            caveat: "Aggregato nazionale sui capoluoghi; qualita e continuita variano per citta.",
            changeVsPrevious: 6.4,
            changeLabel: "vs anno precedente"
          },
          {
            id: "capoluoghiCycleNetworkFiveYear",
            label: "Crescita rete ciclabile capoluoghi",
            value: 27.4,
            unit: "%",
            period: "2019-2023",
            sourceId: "istat-ambiente-urbano-2023",
            reliability: "high",
            interpretation: "Incremento della rete ciclabile nei capoluoghi negli ultimi cinque anni.",
            caveat: "Non misura km protetti o percepiti sicuri; il ranking usa piste equivalenti Lab24 per citta."
          }
        ],
        timeline: [
          {
            id: "capoluoghiCycleNetwork2023Point",
            label: "Rete ciclabile capoluoghi",
            period: "2023",
            value: 5758.9,
            unit: "km",
            sourceId: "istat-ambiente-urbano-2023",
            reliability: "high",
            interpretation: "Stock di rete ciclabile rilevato nel 2023.",
            caveat: "+6.4% vs anno precedente e +27.4% in cinque anni secondo ISTAT."
          }
        ]
      },
      {
        id: "modalTrend",
        title: "Trend modale nazionale",
        description:
          "Sintesi provvisoria Audimob/ISFORT sul primo semestre 2025; solo contesto, non input di ranking.",
        cards: [
          {
            id: "dailyWeekdayTripsH12025",
            label: "Spostamenti giornalieri feriali",
            value: 102.7,
            unit: "mln/giorno",
            period: "H1 2025",
            sourceId: "isfort-audimob-xxii-2025",
            reliability: "interim",
            interpretation: "Stima degli spostamenti giornalieri feriali nel primo semestre 2025.",
            caveat: "Dato provvisorio e parziale (H1); non comparabile con serie annuali complete.",
            changeVsPrevious: 6.4,
            changeLabel: "vs H1 2024"
          },
          {
            id: "cyclingMicromobilityShareH12025",
            label: "Quota ciclo/micromobilita",
            value: 5,
            unit: "% (soglia)",
            period: "H1 2025",
            sourceId: "isfort-audimob-xxii-2025",
            reliability: "interim",
            interpretation: "Per la prima volta la quota combinata di ciclismo e micromobilita supera il 5%.",
            caveat: "Soglia comunicata nella sintesi pubblica; valore puntualmente superiore al 5% non quantificato nel brief.",
            changeLabel: "prima volta >5%"
          },
          {
            id: "carShareH12025",
            label: "Quota auto",
            value: 60.8,
            unit: "%",
            period: "H1 2025",
            sourceId: "isfort-audimob-xxii-2025",
            reliability: "interim",
            interpretation: "Quota modale dell'auto negli spostamenti feriali nel primo semestre 2025.",
            caveat: "Contesto nazionale provvisorio; non sostituisce quote modali comunali storiche nel dataset."
          }
        ]
      },
      {
        id: "bikeThefts",
        title: "Furti di biciclette",
        description:
          "Stima FIAB in assenza di statistiche ufficiali nazionali sui furti di biciclette.",
        cards: [
          {
            id: "annualBikeTheftsEstimate",
            label: "Furti di biciclette stimati",
            value: 320000,
            unit: "furto/anno (circa)",
            period: "stima FIAB (indagine)",
            sourceId: "fiab-indagine-furti-bici",
            reliability: "medium-low",
            interpretation: "FIAB stima circa 320.000 biciclette rubate ogni anno in Italia.",
            caveat: "Stima da indagine FIAB, non serie ufficiale ISTAT/Ministero; affidabilita media-bassa."
          },
          {
            id: "theftDamageEstimate",
            label: "Danno economico stimato",
            value: 150,
            unit: "mln EUR",
            period: "stima FIAB (indagine)",
            sourceId: "fiab-indagine-furti-bici",
            reliability: "medium-low",
            interpretation: "Danno economico stimato associato ai furti di biciclette.",
            caveat: "FIAB segnala esplicitamente la mancanza di dati ufficiali sui furti in Italia."
          }
        ]
      }
    ]
  };
}

const sourceByMetric = {
  "lab24-piste-ciclabili-2024": `${LAB24_BASE}/piste-ciclabili`,
  "lab24-isole-pedonali-2024": `${LAB24_BASE}/isole-pedonali`,
  "lab24-vittime-strada-2024": `${LAB24_BASE}/vittime-della-strada`,
  "lab24-motorizzazione-2024": `${LAB24_BASE}/tasso-di-motorizzazione`,
  "lab24-tpl-passeggeri-2024": `${LAB24_BASE}/passeggeri-trasporto-pubblico`,
  "lab24-tpl-offerta-2024": `${LAB24_BASE}/offerta-trasporto-pubblico`,
  "lab24-ztl-2024": `${LAB24_BASE}/ztl`,
  "lab24-no2-2024": `${LAB24_BASE}/biossido-di-azoto`,
  "lab24-pm10-2024": `${LAB24_BASE}/pm-10`,
  "lab24-pm25-2024": `${LAB24_BASE}/pm-25`,
  "lab24-ozono-2024": `${LAB24_BASE}/ozono`
};

function metricSources() {
  return Object.entries(sourceByMetric).map(([id, url]) => ({
    id,
    title: id.replace(/^lab24-/, "Lab24 ").replace(/-2024$/, " 2024"),
    publisher: "Il Sole 24 Ore Lab24 / Legambiente / Ambiente Italia",
    url,
    accessDate: ACCESS_DATE,
    reliability: "high",
    notes: "Pagina tabellare usata dalla pipeline per estrarre il valore comunale dell'indicatore."
  }));
}

function round(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

function parseAssignment(html, variableName) {
  const marker = `let ${variableName}=`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`Cannot find ${variableName} assignment`);
  }
  let index = html.indexOf("{", markerIndex);
  if (index < 0) {
    throw new Error(`Cannot find object start for ${variableName}`);
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = index; i < html.length; i += 1) {
    const char = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(html.slice(index, i + 1));
      }
    }
  }
  throw new Error(`Cannot parse ${variableName}`);
}

function parseArrayAssignment(html, variableName) {
  const marker = `let ${variableName}=`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`Cannot find ${variableName} assignment`);
  }
  let index = html.indexOf("[", markerIndex);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = index; i < html.length; i += 1) {
    const char = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(html.slice(index, i + 1));
      }
    }
  }
  throw new Error(`Cannot parse ${variableName}`);
}

async function fetchIndicator(metric) {
  const url = `${LAB24_BASE}/${metric.slug}`;
  const response = await fetch(url, {
    headers: {
      "user-agent": "CiclismoSicuro data pipeline (local research; contact: local)"
    }
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }
  const html = await response.text();
  const table = parseAssignment(html, "datiTabella");
  return { url, html, table };
}

function normalize(values, direction, domainMin = null, domainMax = null) {
  const numeric = values.filter((value) => Number.isFinite(value));
  const min = domainMin ?? Math.min(...numeric);
  const max = domainMax ?? Math.max(...numeric);
  if (max === min) {
    return new Map(values.map((value, index) => [index, Number.isFinite(value) ? 50 : null]));
  }
  return new Map(
    values.map((value, index) => {
      if (!Number.isFinite(value)) return [index, null];
      const scaled = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
      return [index, direction === "lower" ? 100 - scaled : scaled];
    })
  );
}

function weightedAverage(items) {
  const present = items.filter((item) => Number.isFinite(item.value));
  if (present.length === 0) return null;
  const totalWeight = present.reduce((sum, item) => sum + item.weight, 0);
  return present.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

function confidenceForCity(city, scoringMetricIds) {
  const available = scoringMetricIds.filter((id) => city.rawMetrics[id] !== null && city.rawMetrics[id] !== undefined).length;
  const coverage = available / scoringMetricIds.length;
  return Math.max(35, Math.min(100, 58 + coverage * 42));
}

function categoryScores(city, metricDefinitions) {
  const categories = ["infrastructure", "safety", "usage", "connectivity", "policy", "comfort"];
  const scores = {};
  const coverage = {};
  for (const category of categories) {
    const defs = metricDefinitions.filter((metric) => metric.category === category);
    const items = defs.map((metric) => ({
      value: city.normalizedMetrics[metric.id],
      weight: metric.categoryWeight ?? 1
    }));
    const available = items.filter((item) => Number.isFinite(item.value)).length;
    const average = weightedAverage(items);
    const coveragePenalty = defs.length === 0 ? 1 : 0.72 + 0.28 * (available / defs.length);
    scores[category] = average === null ? null : round(average * coveragePenalty, 2);
    coverage[category] = defs.length === 0 ? 0 : round((available / defs.length) * 100, 1);
  }
  return { scores, coverage };
}

function scoreCity(city, weights) {
  const weighted = Object.entries(weights)
    .filter(([category]) => category !== "dataConfidence")
    .map(([category, weight]) => ({
      value: city.categoryScores[category] ?? MISSING_CATEGORY_FALLBACK,
      weight
    }))
    .filter((item) => item.weight > 0 && Number.isFinite(item.value));
  const categoryScore = weightedAverage(weighted) ?? 0;
  const confidenceComponent = city.dataConfidence;
  const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0);
  const score =
    (categoryScore * (totalWeight - weights.dataConfidence) + confidenceComponent * weights.dataConfidence) /
    totalWeight;
  return round(score, 2);
}

function buildCoverageAudit(cities, metricDefinitions) {
  const cityCount = cities.length;
  const manualMetricIds = new Set(manualMetrics.map((metric) => metric.id));
  const categories = [
    "infrastructure",
    "safety",
    "usage",
    "connectivity",
    "policy",
    "comfort"
  ];

  const metrics = metricDefinitions.map((metric) => {
    const citiesWithValue = cities.filter(
      (city) => city.rawMetrics[metric.id] !== null && city.rawMetrics[metric.id] !== undefined
    ).length;
    const coveragePercent = round((citiesWithValue / cityCount) * 100, 1);
    return {
      id: metric.id,
      label: metric.label,
      category: metric.category,
      sourceId: metric.sourceId,
      citiesWithValue,
      coveragePercent,
      sparse: coveragePercent < SPARSE_COVERAGE_THRESHOLD_PERCENT,
      manual: manualMetricIds.has(metric.id)
    };
  });

  const categoryEntries = categories.map((category) => {
    const defaultWeight = defaultWeights[category];
    const citiesWithCategoryScore = cities.filter(
      (city) => city.categoryScores[category] !== null && city.categoryScores[category] !== undefined
    ).length;
    const coveragePercent = round((citiesWithCategoryScore / cityCount) * 100, 1);
    const averageMetricCoveragePercent = round(
      cities.reduce((sum, city) => sum + (city.categoryCoverage[category] ?? 0), 0) / cityCount,
      1
    );
    const includedInDefaultScore = defaultWeight > 0;
    return {
      category,
      defaultWeight,
      citiesWithCategoryScore,
      coveragePercent,
      averageMetricCoveragePercent,
      includedInDefaultScore,
      sparse: coveragePercent < SPARSE_COVERAGE_THRESHOLD_PERCENT
    };
  });

  const sparseSignals = metrics
    .filter((metric) => metric.sparse)
    .map((metric) => `${metric.id} (${metric.coveragePercent}% city coverage)`);

  const defaultScoreCategories = categoryEntries
    .filter((entry) => entry.includedInDefaultScore)
    .map((entry) => entry.category);
  const contextualCategories = categoryEntries
    .filter((entry) => !entry.includedInDefaultScore)
    .map((entry) => entry.category);

  return {
    cityCount,
    defaultWeightTotal: Object.values(defaultWeights).reduce((sum, value) => sum + value, 0),
    highCoverageThresholdPercent: HIGH_COVERAGE_THRESHOLD_PERCENT,
    categories: categoryEntries,
    metrics,
    sparseSignals,
    defaultScoreCategories,
    contextualCategories,
    notes: [
      "Default ranking weights include only categories with broad Lab24 coverage across capoluoghi.",
      "Default data confidence is calculated only from default-score metrics, so sparse manual signals cannot boost the default score indirectly.",
      "Manual usage and policy signals remain in the dataset for city detail and optional weighting, not for the default score.",
      "Categories with zero default weight can still be enabled in the UI; missing evidence then uses the prudent fallback score."
    ]
  };
}

function topEntries(record, count, direction = "desc") {
  return Object.entries(record)
    .filter(([, value]) => Number.isFinite(value))
    .sort((a, b) => direction === "desc" ? b[1] - a[1] : a[1] - b[1])
    .slice(0, count)
    .map(([key, value]) => ({ key, value: round(value, 1) }));
}

function describeCity(city) {
  const labels = {
    infrastructure: "infrastruttura ciclabile/spazio calmo",
    safety: "sicurezza e pressione auto",
    usage: "uso e alternative all'auto",
    connectivity: "intermodalita e restrizioni al traffico",
    policy: "segnali di policy ciclabile",
    comfort: "aria e comfort urbano"
  };
  const defaultCategoryScores = Object.fromEntries(
    Object.entries(city.categoryScores).filter(([category]) => defaultWeights[category] > 0)
  );
  const strengths = topEntries(defaultCategoryScores, 3, "desc").map((item) => labels[item.key]);
  const weaknesses = topEntries(defaultCategoryScores, 2, "asc").map((item) => labels[item.key]);
  const missing = Object.entries(city.rawMetrics)
    .filter(([, value]) => value === null || value === undefined)
    .map(([key]) => key);
  return {
    strengths,
    weaknesses,
    uncertainty:
      city.dataConfidence >= 90
        ? "bassa sul ranking default: copertura metrica completa sulle categorie comparabili"
        : city.dataConfidence >= 75
          ? "media sul ranking default: alcune categorie comparabili hanno copertura incompleta"
          : "alta sul ranking default: servono piu dati comparabili per confermare il profilo",
    missingMetrics: missing
  };
}

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function writeText(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
}

async function main() {
  const manual = JSON.parse(await readFile(path.join(ROOT, "data/manual/city-enrichment.json"), "utf8"));
  const fetched = [];
  for (const metric of metrics) {
    const result = await fetchIndicator(metric);
    fetched.push({ metric, ...result });
    await writeText(path.join(ROOT, "data/raw", `${metric.id}.html`), result.html);
  }

  const province = parseArrayAssignment(fetched[0].html, "province");
  const cityByName = new Map(
    province.map((city) => [
      city.nome,
      {
        id: city.ID,
        city: city.nome,
        regionId: city.IDregione,
        sizeClass: city.fascia ? Number(city.fascia) : null,
        rawMetrics: {},
        normalizedMetrics: {},
        metricSources: {},
        manualSources: []
      }
    ])
  );

  for (const { metric, table } of fetched) {
    for (const row of table.righe) {
      const city = cityByName.get(row.nome);
      if (!city) continue;
      city.rawMetrics[metric.id] = Number(row.punti);
      city.metricSources[metric.id] = metric.sourceId;
    }
  }

  const manualKeyFailures = validateManualEnrichmentKeys(manual, [...cityByName.keys()]);
  if (manualKeyFailures.length) {
    throw new Error(manualKeyFailures.join("\n"));
  }

  const cityByCanonicalKey = indexCitiesByCanonicalKey(cityByName.values());

  for (const [cityName, enrichment] of Object.entries(manual)) {
    const city = cityByCanonicalKey.get(canonicalCityKey(cityName));
    if (!city) continue;
    for (const metric of manualMetrics) {
      if (enrichment[metric.id] !== undefined) {
        city.rawMetrics[metric.id] = Number(enrichment[metric.id]);
        city.metricSources[metric.id] = metric.sourceId;
      }
    }
    city.policySignals = enrichment.policySignals ?? [];
    city.manualSources = enrichment.sources ?? [];
    city.externalCyclingScore = enrichment.externalCyclingScore ?? null;
    city.externalInfrastructureScore = enrichment.externalInfrastructureScore ?? null;
    city.externalUsageScore = enrichment.externalUsageScore ?? null;
  }

  const allMetricDefinitions = [...metrics, ...manualMetrics];
  for (const metric of allMetricDefinitions) {
    const cities = [...cityByName.values()];
    const values = cities.map((city) => city.rawMetrics[metric.id]);
    const normalized = normalize(values, metric.direction, metric.domainMin, metric.domainMax);
    cities.forEach((city, index) => {
      city.normalizedMetrics[metric.id] = round(normalized.get(index), 2);
    });
  }

  const allMetricIds = allMetricDefinitions.map((metric) => metric.id);
  const defaultScoringMetricIds = allMetricDefinitions
    .filter((metric) => defaultWeights[metric.category] > 0)
    .map((metric) => metric.id);
  for (const city of cityByName.values()) {
    for (const id of allMetricIds) {
      city.rawMetrics[id] ??= null;
      city.normalizedMetrics[id] ??= null;
    }
    city.dataConfidence = round(confidenceForCity(city, defaultScoringMetricIds), 1);
    const categories = categoryScores(city, allMetricDefinitions);
    city.categoryScores = categories.scores;
    city.categoryCoverage = categories.coverage;
    city.score = scoreCity(city, defaultWeights);
    Object.assign(city, describeCity(city));
  }

  const cities = [...cityByName.values()]
    .sort((a, b) => b.score - a.score)
    .map((city, index) => ({ ...city, rank: index + 1 }));

  const coverageAudit = buildCoverageAudit(cities, allMetricDefinitions);

  const rawIndicators = fetched.map(({ metric, table, url }) => ({
    metricId: metric.id,
    metricLabel: metric.label,
    url,
    rows: table.righe.map((row) => ({
      city: row.nome,
      value: Number(row.punti),
      sourceRank: Number(row.posiz)
    }))
  }));

  const payload = {
    generatedAt: new Date().toISOString(),
    accessDate: ACCESS_DATE,
    title: "Ranking citta italiane per ciclisti",
    summary:
      "Score 0-100 costruito da metriche Lab24 comparabili su infrastruttura ciclabile equivalente, sicurezza stradale, pressione auto, TPL, ZTL, pedonalita e qualita dell'aria. I segnali FIAB, Copenhagenize e quote modali storiche restano contestuali: sono esposti nel dataset ma hanno peso 0 nel ranking default per evitare confronti parziali.",
    defaultWeights,
    coverageAudit,
    nationalContext: buildNationalContext(),
    metricDefinitions: allMetricDefinitions,
    sources: [...sourceRegistry, ...metricSources()],
    sourceGaps: [
      "Protected lanes, bike parking, bike/e-bike sharing and lane-by-lane quality require audit OSM/local open data before being comparable across 106 citta.",
      "Perceived safety is not available as a consistent national city-level series.",
      "PNRR/local investment and Biciplan/PUMS are documented unevenly; the current score uses verified policy signals only where source coverage is explicit.",
      "Weather and slope are omitted from the default score until a stable city-boundary methodology is added."
    ],
    cities
  };

  const csvRows = buildRankingCsvRows(payload);

  await writeJson(path.join(ROOT, "data/processed/ranking.json"), payload);
  await writeJson(path.join(ROOT, "data/processed/raw-indicators.json"), rawIndicators);
  await writeJson(path.join(ROOT, "data/processed/normalized-indicators.json"), cities.map((city) => ({
    city: city.city,
    rank: city.rank,
    score: city.score,
    normalizedMetrics: city.normalizedMetrics,
    categoryScores: city.categoryScores
  })));
  await writeText(path.join(ROOT, "data/processed/ranking.csv"), `${toCsv(csvRows)}\n`);
  await writeJson(path.join(ROOT, "public/data/ranking.json"), payload);
  await writeJson(path.join(ROOT, "public/data/normalized-indicators.json"), cities.map((city) => ({
    city: city.city,
    rank: city.rank,
    score: city.score,
    normalizedMetrics: city.normalizedMetrics,
    categoryScores: city.categoryScores
  })));
  await writeText(path.join(ROOT, "public/data/ranking.csv"), `${toCsv(csvRows)}\n`);

  console.log(`Generated ${cities.length} city rows. Top city: ${cities[0].city} (${cities[0].score})`);
}

const NATIONAL_CONTEXT_SOURCE_IDS = new Set([
  "istat-incidenti-stradali-2024",
  "aci-istat-province-2024",
  "isfort-audimob-xxii-2025",
  "fiab-indagine-furti-bici"
]);

async function patchNationalContextOnly() {
  const processedPath = path.join(ROOT, "data/processed/ranking.json");
  const payload = JSON.parse(await readFile(processedPath, "utf8"));
  const existingIds = new Set(payload.sources.map((source) => source.id));
  for (const source of sourceRegistry) {
    if (NATIONAL_CONTEXT_SOURCE_IDS.has(source.id) && !existingIds.has(source.id)) {
      payload.sources.push(source);
    }
  }
  payload.nationalContext = buildNationalContext();
  await writeJson(processedPath, payload);
  await writeJson(path.join(ROOT, "public/data/ranking.json"), payload);
  console.log(
    `Patched nationalContext (${payload.nationalContext.sections.length} sections) into existing ${payload.cities.length} city ranking payloads.`
  );
}

if (process.argv.includes("--national-context-only")) {
  patchNationalContextOnly().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
