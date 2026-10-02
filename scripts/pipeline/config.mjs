import path from "node:path";

export const ROOT = process.cwd();
export const RAW_DIR = path.join(ROOT, "data/raw");
export const INTERMEDIATE_DIR = path.join(ROOT, "data/intermediate");
export const MANUAL_DIR = path.join(ROOT, "data/manual");
export const PUBLIC_DATA_DIR = path.join(ROOT, "public/data");

/** First and last year of ISTAT crash microdata used by the pipeline. */
export const CRASH_FIRST_YEAR = 2015;
export const CRASH_LAST_YEAR = 2024;
/** Recent pooled window for injury risk (post-pandemic, large counts). */
export const RECENT_YEARS = [2022, 2023, 2024];
/** Long window for fatalities, which are rare at city level. */
export const FATALITY_YEARS = Array.from(
  { length: CRASH_LAST_YEAR - CRASH_FIRST_YEAR + 1 },
  (_, index) => CRASH_FIRST_YEAR + index
);
export const POPULATION_YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
export const RECONSTRUCTED_POPULATION_YEARS = [2015, 2016, 2017, 2018];
/** 2026 POSAS is a provisional estimate; keep the latest final year for the city registry. */
export const FINAL_POPULATION_YEAR = 2025;

const ISTAT_MICRODATA_DOWNLOAD =
  "https://www.istat.it/wp-content/themes/EGPbs5-child/microdata/download.php";

export const RAW_SOURCES = {
  crashMicrodata: (year) => ({
    file: path.join(RAW_DIR, "istat-incidenti", `INCSTRAD_${year}.zip`),
    url: `${ISTAT_MICRODATA_DOWNLOAD}?file=${encodeURIComponent(`/3/${year}/01/01.zip`)}&filename=INCSTRAD_${year}_IT.zip`
  }),
  municipalities: {
    file: path.join(RAW_DIR, "istat", "Elenco-comuni-italiani.csv"),
    url: "https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.csv"
  },
  population: (year) => ({
    file: path.join(RAW_DIR, "istat-popolazione", `POSAS_${year}_it_Comuni.zip`),
    url: `https://demo.istat.it/data/posas/POSAS_${year}_it_Comuni.zip`
  }),
  reconstructedPopulation: {
    file: path.join(RAW_DIR, "istat-popolazione", "PopolazioneEta-Territorio-Comuni.zip"),
    url: "https://demo.istat.it/data/ricostruzione/PopolazioneEta-Territorio-Comuni.zip"
  },
  commuting2011: {
    file: path.join(RAW_DIR, "istat", "matrici_pendolarismo_2011.zip"),
    url: "https://www.istat.it/storage/cartografia/matrici_pendolarismo/matrici_pendolarismo_2011.zip"
  },
  urbanEnvironment: {
    file: path.join(RAW_DIR, "istat", "TAVOLE_AMBURB_2024.zip"),
    url: "https://www.istat.it/wp-content/uploads/2026/09/TAVOLE_AMBURB_2024.zip"
  },
  vehicleFleet: {
    file: path.join(RAW_DIR, "aci", "Autoritratto2025_Parco_veicolare.zip"),
    url: "https://aci.gov.it//app/uploads/2026/06/Autoritratto2025_Parco_veicolare.zip"
  }
};

export const OVERPASS_ENDPOINTS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];

export const USER_AGENT = "CiclismoSicuro open-data pipeline (https://github.com/Zer0codestuff/Ciclismosicuro)";
