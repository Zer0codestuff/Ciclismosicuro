/// <reference types="vite/client" />
import {
  Activity,
  AlertTriangle,
  ArrowDownUp,
  BarChart3,
  Bike,
  Database,
  Download,
  ExternalLink,
  Filter,
  Info,
  Link2,
  MapPin,
  Search,
  ShieldAlert,
  X,
  ShieldCheck,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from "react";
import {
  buildCityComparison,
  categoryGapSummary,
  formatRankDelta,
  formatScoreDelta
} from "./cityComparison";
import { CityMapPanel } from "./CityMapPanel";
import { scrollIntoViewOptions } from "./motion";
import { scrollSelectedRankingIntoView } from "./scrollSelectedRanking";
import {
  buildCityShareUrl,
  cityMatchesQuery,
  copyTextToClipboard,
  readCitySearchParam,
  resolveCityFromParam,
  resolveExactCityFromQuery,
  syncCitySearchParam
} from "./cityKeys";
import { cityDocumentTitle, DEFAULT_DOCUMENT_TITLE } from "./pageTitle";
import { useRankingWeightAnnouncement } from "./rankingWeightAnnouncement";
import { topNavLinksForPage } from "./sectionNav";
import { useSectionNavSpy } from "./useSectionNavSpy";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  categoryDescriptions,
  categoryLabels,
  categoryOrder,
  confidenceLabel,
  DEFAULT_WEIGHTS,
  formatMetric,
  normalizeWeights,
  rankCities,
  totalWeight,
  weightsEqual
} from "./scoring";
import type {
  CategoryKey,
  CoverageAudit,
  MetricCoverageEntry,
  MetricDefinition,
  NationalContext,
  NationalContextItem,
  NationalContextReliability,
  NationalContextSection,
  NationalContextTimelinePoint,
  RankedCity,
  RankingPayload,
  SourceEntry,
  Weights
} from "./types";

/** Resolve a public asset or data path against the Vite base URL (subpath-safe). */
function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const suffix = path.startsWith("/") ? path.slice(1) : path;
  return `${base}${suffix}`;
}

/** First-click sort direction: rank and city ascending; metrics descending. */
function initialSortDirection(sortKey: SortKey): "asc" | "desc" {
  return sortKey === "city" || sortKey === "rank" ? "asc" : "desc";
}

type SortKey =
  | "rank"
  | "city"
  | "score"
  | "confidence"
  | "infrastructure"
  | "safety"
  | "usage"
  | "connectivity"
  | "policy"
  | "comfort"
  | "cycleNetworkEquivalent";

const categoryColors: Record<CategoryKey, string> = {
  infrastructure: "#0f766e",
  safety: "#2563eb",
  usage: "#d97706",
  connectivity: "#7c3aed",
  policy: "#15803d",
  comfort: "#0891b2",
  dataConfidence: "#475569"
};

const sizeLabels: Record<number, string> = {
  1: "grandi",
  2: "medie",
  3: "piccole"
};

const sizeFilterLabels: Record<string, string> = {
  "1": "Grandi",
  "2": "Medie",
  "3": "Piccole",
  unknown: "Non classificata"
};

const reliabilityLabels: Record<NationalContextReliability, string> = {
  high: "Alta",
  medium: "Media",
  "medium-low": "Media-bassa",
  low: "Bassa",
  interim: "Provvisoria"
};

const contextSectionIcons: Record<string, ReactNode> = {
  roadSafety: <ShieldCheck aria-hidden="true" />,
  cyclingMarket: <Bike aria-hidden="true" />,
  infrastructureTrend: <BarChart3 aria-hidden="true" />,
  modalTrend: <Activity aria-hidden="true" />,
  bikeThefts: <ShieldAlert aria-hidden="true" />
};

const sortLabels: Record<SortKey, string> = {
  rank: "rank",
  city: "città",
  score: "punteggio",
  confidence: "confidenza",
  infrastructure: "infrastruttura",
  safety: "sicurezza",
  usage: "uso bici",
  connectivity: "connessioni",
  policy: "policy",
  comfort: "comfort",
  cycleNetworkEquivalent: "ciclabili"
};

type ScoredCategoryKey = Exclude<CategoryKey, "dataConfidence">;

const mobileRankingCategories = [
  "infrastructure",
  "safety",
  "connectivity",
  "comfort"
] as const satisfies readonly ScoredCategoryKey[];

const contextualCategoryTableLabels: Partial<Record<ScoredCategoryKey, string>> = {
  usage: "Uso",
  policy: "Policy"
};

const CONTEXTUAL_CATEGORY_SR_HINT =
  "categoria contestuale: peso default 0, esclusa dal ranking comparabile per copertura bassa";

const mobileSortOptions: { key: SortKey; label: string }[] = [
  { key: "score", label: "Punteggio" },
  { key: "rank", label: "Posizione" },
  { key: "city", label: "Città" },
  { key: "cycleNetworkEquivalent", label: "Ciclabili (km)" },
  { key: "infrastructure", label: "Infrastruttura" },
  { key: "safety", label: "Sicurezza" },
  { key: "connectivity", label: "Connessioni" },
  { key: "comfort", label: "Comfort" },
  { key: "usage", label: "Uso" },
  { key: "policy", label: "Policy" },
  { key: "confidence", label: "Confidenza" }
];

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => readMediaQuery(query));

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const sync = () => setMatches(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [query]);

  return matches;
}

function readMediaQuery(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(query).matches;
}

function App() {
  const citySearchInputId = useId();
  const citySearchListId = useId();
  const [payload, setPayload] = useState<RankingPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const loadAttemptRef = useRef(0);
  const [query, setQuery] = useState("");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [minConfidence, setMinConfidence] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [selectedCityName, setSelectedCityName] = useState<string | null>(null);
  const [deepLinkWarning, setDeepLinkWarning] = useState<string | null>(null);
  const [mapPanelOpen, setMapPanelOpen] = useState(false);
  const [scrollToDetail, setScrollToDetail] = useState(false);
  const mapTriggerRef = useRef<HTMLButtonElement | null>(null);
  const detailTitleRef = useRef<HTMLHeadingElement | null>(null);
  const loadingStatusId = useId();
  const isCompactRanking = useMediaQuery("(max-width: 1180px)");
  const topNavLinks = useMemo(() => topNavLinksForPage(mapPanelOpen), [mapPanelOpen]);
  const topNavSectionOrder = useMemo(
    () => topNavLinks.map((link) => link.sectionId),
    [topNavLinks]
  );
  const activeNavSectionId = useSectionNavSpy(
    payload && !isLoading ? topNavSectionOrder : []
  );

  const loadRankingData = useCallback(async () => {
    const attempt = ++loadAttemptRef.current;
    setLoadError(null);
    setIsLoading(true);

    try {
      const response = await fetch(withBase("data/ranking.json"));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as RankingPayload;
      if (attempt !== loadAttemptRef.current) return;

      setPayload(data);
      setWeights(normalizeWeights(data.defaultWeights));
      const fallback = data.cities[0]?.city ?? null;
      const { city: linkedCity, requestedLabel } = resolveCityFromParam(
        data.cities,
        readCitySearchParam()
      );
      if (linkedCity) {
        setSelectedCityName(linkedCity);
        setDeepLinkWarning(null);
        setScrollToDetail(true);
      } else if (requestedLabel) {
        setSelectedCityName(fallback);
        setDeepLinkWarning(
          fallback
            ? `«${requestedLabel}» non è nel ranking: mostriamo ${fallback}.`
            : `«${requestedLabel}» non è nel ranking.`
        );
      } else {
        setSelectedCityName(fallback);
        setDeepLinkWarning(null);
      }
    } catch (error) {
      if (attempt !== loadAttemptRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      setLoadError(message);
      setPayload(null);
    } finally {
      if (attempt === loadAttemptRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadRankingData();
  }, [loadRankingData]);

  useEffect(() => {
    if (!payload || !selectedCityName) return;
    syncCitySearchParam(selectedCityName);
  }, [payload, selectedCityName]);

  const defaultWeights = useMemo(
    () => (payload ? normalizeWeights(payload.defaultWeights) : normalizeWeights(DEFAULT_WEIGHTS)),
    [payload]
  );

  const usesCustomWeights = payload ? !weightsEqual(weights, defaultWeights) : false;
  const weightTotal = totalWeight(weights);

  const rankedCities = useMemo(() => {
    if (!payload) return [];
    return rankCities(payload.cities, weights);
  }, [payload, weights]);

  const citySearchSuggestions = useMemo(
    () =>
      [...rankedCities]
        .map((city) => city.city)
        .sort((left, right) => left.localeCompare(right, "it")),
    [rankedCities]
  );

  const filteredCities = useMemo(() => {
    const filtered = rankedCities.filter((city) => {
      const matchesQuery = cityMatchesQuery(city.city, query);
      const matchesSize = sizeFilter === "all" || String(city.sizeClass ?? "unknown") === sizeFilter;
      const matchesConfidence = city.dataConfidence >= minConfidence;
      return matchesQuery && matchesSize && matchesConfidence;
    });

    const direction = sortDirection === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const left = sortValue(a, sortKey);
      const right = sortValue(b, sortKey);
      if (typeof left === "string" && typeof right === "string") {
        return left.localeCompare(right, "it") * direction;
      }
      return ((left as number) - (right as number)) * direction;
    });
  }, [rankedCities, query, sizeFilter, minConfidence, sortDirection, sortKey]);

  const selectedCity = useMemo(() => {
    if (!rankedCities.length) return null;
    return rankedCities.find((city) => city.city === selectedCityName) ?? rankedCities[0];
  }, [rankedCities, selectedCityName]);

  const rankingWeightAnnouncement = useRankingWeightAnnouncement(
    rankedCities,
    selectedCity,
    weights,
    defaultWeights
  );

  useLayoutEffect(() => {
    if (loadError || isLoading || !payload || !selectedCity) {
      document.title = DEFAULT_DOCUMENT_TITLE;
      return;
    }
    document.title = cityDocumentTitle(selectedCity.city);
  }, [loadError, isLoading, payload, selectedCity]);

  useEffect(() => {
    return () => {
      document.title = DEFAULT_DOCUMENT_TITLE;
    };
  }, []);

  const topCities = rankedCities.slice(0, 6);
  const topTwelveCities = rankedCities.slice(0, 12);
  const averageScore =
    rankedCities.reduce((sum, city) => sum + city.adjustedScore, 0) / Math.max(1, rankedCities.length);
  const highConfidenceCount = rankedCities.filter((city) => city.dataConfidence >= 90).length;
  const manualPolicyCount = rankedCities.filter((city) => city.rawMetrics.fiabBikeSmile !== null).length;

  function updateWeight(category: CategoryKey, value: number) {
    setWeights((current) => normalizeWeights({ ...current, [category]: value }));
  }

  function resetWeights() {
    setWeights(defaultWeights);
  }

  function chooseSort(next: SortKey) {
    if (next === sortKey) {
      setSortDirection((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(next);
    setSortDirection(initialSortDirection(next));
  }

  function applyMobileSortKey(next: SortKey) {
    if (next === sortKey) return;
    setSortKey(next);
    setSortDirection(initialSortDirection(next));
  }

  const selectCity = useCallback((cityName: string) => {
    setDeepLinkWarning(null);
    setSelectedCityName(cityName);
    setScrollToDetail(true);
  }, []);

  const handlePrime12BarClick = useCallback(
    (bar: unknown) => {
      if (!bar || typeof bar !== "object") return;
      const cityName = (bar as { payload?: { city?: unknown } }).payload?.city;
      if (typeof cityName === "string") {
        selectCity(cityName);
      }
    },
    [selectCity]
  );

  const updateSearchQuery = useCallback(
    (nextQuery: string) => {
      setQuery(nextQuery);
      const exactMatch = resolveExactCityFromQuery(rankedCities, nextQuery);
      if (exactMatch) {
        setDeepLinkWarning(null);
        setSelectedCityName(exactMatch);
      }
    },
    [rankedCities]
  );

  const openCityMap = useCallback((cityName: string) => {
    setSelectedCityName(cityName);
    setMapPanelOpen(true);
  }, []);

  const closeMapPanel = useCallback(() => {
    setMapPanelOpen(false);
  }, []);

  const clearFilters = useCallback(() => {
    setQuery("");
    setSizeFilter("all");
    setMinConfidence(0);
  }, []);

  const filtersActive =
    query.trim().length > 0 || sizeFilter !== "all" || minConfidence > 0;

  const selectedCityHidden = useMemo(() => {
    if (!selectedCity || !filtersActive) return false;
    return !filteredCities.some((city) => city.city === selectedCity.city);
  }, [selectedCity, filteredCities, filtersActive]);

  useEffect(() => {
    if (!scrollToDetail) return;
    if (!selectedCityHidden) {
      scrollSelectedRankingIntoView();
    }
    document.getElementById("detail")?.scrollIntoView(scrollIntoViewOptions());
    if (!mapPanelOpen) {
      detailTitleRef.current?.focus({ preventScroll: true });
    }
    setScrollToDetail(false);
  }, [scrollToDetail, selectedCityName, mapPanelOpen, selectedCityHidden]);

  const revealSelectedCityInTable = useCallback(() => {
    if (!selectedCityName) return;
    const city = rankedCities.find((entry) => entry.city === selectedCityName);
    if (!city) return;

    if (query.trim().length > 0 && !cityMatchesQuery(city.city, query)) {
      setQuery("");
    }
    if (sizeFilter !== "all" && String(city.sizeClass ?? "unknown") !== sizeFilter) {
      setSizeFilter("all");
    }
    if (city.dataConfidence < minConfidence) {
      setMinConfidence(0);
    }
    requestAnimationFrame(() => {
      scrollSelectedRankingIntoView();
    });
  }, [selectedCityName, rankedCities, query, sizeFilter, minConfidence]);

  if (loadError) {
    return (
      <div className="app-shell">
        <main id="main-content" tabIndex={-1}>
        <section className="empty-state empty-state-error" role="alert" aria-live="assertive">
          <AlertTriangle aria-hidden="true" />
          <h1>Dataset non caricato</h1>
          <p>Errore: {loadError}.</p>
          <button
            type="button"
            className="empty-state-retry"
            onClick={() => void loadRankingData()}
            disabled={isLoading}
          >
            {isLoading ? "Caricamento..." : "Riprova"}
          </button>
          <p className="empty-state-hint">
            Se stai sviluppando in locale, esegui <code>npm run data</code> e riavvia il server.
          </p>
        </section>
        </main>
      </div>
    );
  }

  if (isLoading || !payload || !selectedCity) {
    return (
      <div className="app-shell">
        <main id="main-content" tabIndex={-1}>
        <section
          className="empty-state empty-state-loading"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-labelledby={loadingStatusId}
        >
          <BarChart3 aria-hidden="true" />
          <h1 id={loadingStatusId}>Caricamento dati</h1>
          <p>Sto leggendo ranking, metriche e fonti.</p>
        </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          const mainContent = document.getElementById("main-content");
          mainContent?.scrollIntoView(scrollIntoViewOptions());
          mainContent?.focus();
        }}
      >
        Salta al contenuto
      </a>
      <header className="site-header">
        <a className="brand" href="#dashboard" aria-label="Vai alla dashboard">
          <img src={withBase("assets/ciclismo-sicuro-logo.png")} alt="" />
          <span>
            <strong>Ciclismo Sicuro</strong>
            <small>ranking metriche comparabili</small>
          </span>
        </a>
        <nav className="top-nav" aria-label="Navigazione principale">
          {topNavLinks.map((link) => {
            const isActive = activeNavSectionId === link.sectionId;
            return (
              <a
                key={link.sectionId}
                href={link.hash}
                className={isActive ? "is-active" : undefined}
                aria-current={isActive ? "page" : undefined}
              >
                {link.label}
              </a>
            );
          })}
        </nav>
      </header>

      <main id="main-content" tabIndex={-1}>
      <section className="hero-band scroll-anchor" id="dashboard">
        <div className="hero-main">
          <div className="hero-copy">
            <p className="eyebrow">
              Analisi comparabile · {rankedCities.length} capoluoghi · aggiornamento {payload.accessDate}
            </p>
            <h1>{payload.title}</h1>
            <p className="hero-lead">{payload.summary}</p>
            <div className="hero-highlights" aria-label="Punti chiave del metodo">
              <span>
                <ShieldCheck aria-hidden="true" />
                Punteggio 0-100 da metriche Lab24 su tutti i capoluoghi
              </span>
              <span>
                <SlidersHorizontal aria-hidden="true" />
                Pesi regolabili; uso bici e policy restano contestuali
              </span>
              <span>
                <Info aria-hidden="true" />
                {payload.nationalContext.sections.length} blocchi di contesto nazionale separati dal ranking
              </span>
            </div>
          </div>
          <aside className="hero-aside">
            <div className="hero-caveat" role="note" aria-label="Avviso contesto nazionale">
              <ShieldAlert aria-hidden="true" />
              <div>
                <strong>Contesto nazionale escluso dal punteggio</strong>
                <p>{payload.nationalContext.disclaimer}</p>
                <a href="#contesto">Apri sezione Contesto</a>
              </div>
            </div>
            <div className="hero-stats" aria-label="Indicatori sintetici">
              <MetricTile label="Città analizzate" value={rankedCities.length.toString()} icon={<Database />} />
              <MetricTile label="Punteggio medio" value={formatMetric(averageScore, 1)} icon={<BarChart3 />} />
              <MetricTile label="Confidenza >= 90" value={`${highConfidenceCount}/${rankedCities.length}`} icon={<ShieldCheck />} />
              <MetricTile label="Fonti tracciate" value={payload.sources.length.toString()} icon={<Info />} />
              <MetricTile label="Segnali FIAB/policy" value={`${manualPolicyCount}/${rankedCities.length}`} icon={<Bike />} />
              <MetricTile label="Metriche attive" value={payload.metricDefinitions.length.toString()} icon={<SlidersHorizontal />} />
            </div>
          </aside>
        </div>
      </section>

      <section className="leader-band" aria-labelledby="top-cities-title">
        <div className="section-heading">
          <p className="eyebrow">Dashboard</p>
          <h2 id="top-cities-title">Top ranking comparabile</h2>
        </div>
        <div className="city-card-grid">
          {topCities.map((city) => (
            <button
              className={
                city.city === selectedCity.city ? "city-card selected" : "city-card"
              }
              key={city.city}
              type="button"
              aria-label={`Seleziona ${city.city}, posizione ${city.adjustedRank}, punteggio ${formatMetric(city.adjustedScore, 1)}`}
              aria-pressed={city.city === selectedCity.city}
              onClick={() => selectCity(city.city)}
            >
              <span className="rank-pill">#{city.adjustedRank}</span>
              <strong>{city.city}</strong>
              <span className="score">{formatMetric(city.adjustedScore, 1)}</span>
              <span className="muted">
                {city.strengths.slice(0, 2).join(" + ") || "profilo misto"}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="analysis-grid" aria-label="Analisi sintetica">
        <div className="panel">
          <div className="panel-title">
            <BarChart3 aria-hidden="true" />
            <h2>Prime 12 per punteggio</h2>
          </div>
          <div className="chart-frame prime-12-chart" data-testid="prime-12-chart" aria-hidden="true">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={topTwelveCities} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} />
                <YAxis type="category" dataKey="city" width={96} />
                <Tooltip formatter={(value) => formatMetric(Number(value), 1)} />
                <Bar
                  data-testid="prime-12-bars"
                  dataKey="adjustedScore"
                  name="Punteggio"
                  radius={[0, 6, 6, 0]}
                  isAnimationActive={false}
                  cursor="pointer"
                  onClick={handlePrime12BarClick}
                >
                  {topTwelveCities.map((city) => (
                    <Cell key={city.city} fill={city.city === selectedCity.city ? "#d97706" : "#0f766e"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="sr-only prime-12-city-list" aria-label="Prime 12 per punteggio, seleziona città">
            {topTwelveCities.map((city) => (
              <li key={city.city}>
                <button
                  type="button"
                  className="prime-12-city-pick"
                  aria-pressed={city.city === selectedCity.city}
                  aria-label={`Seleziona ${city.city} dal grafico Prime 12, posizione ${city.adjustedRank}, punteggio ${formatMetric(city.adjustedScore, 1)}`}
                  onClick={() => selectCity(city.city)}
                >
                  {city.adjustedRank}. {city.city}, punteggio {formatMetric(city.adjustedScore, 1)}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel" aria-labelledby="weights-title">
          <div className="panel-title panel-title-with-action">
            <div className="panel-title-label">
              <SlidersHorizontal aria-hidden="true" />
              <h2 id="weights-title">Pesi regolabili</h2>
            </div>
            <button
              type="button"
              className="weight-reset-button"
              onClick={resetWeights}
              disabled={!usesCustomWeights}
            >
              Ripristina pesi default
            </button>
          </div>
          {usesCustomWeights ? (
            <div className="weight-custom-banner" role="status">
              <Info aria-hidden="true" />
              <p>
                Ranking ricalcolato con pesi personalizzati; i download restano sui pesi default.
              </p>
            </div>
          ) : null}
          <div className="weight-total-block">
            <p className="weight-total" aria-live="polite">
              Somma pesi: <strong>{weightTotal}</strong>
            </p>
            <p
              className="sr-only weight-ranking-announcement"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              aria-label="Aggiornamento ranking da pesi personalizzati"
            >
              {rankingWeightAnnouncement}
            </p>
            <p className="weight-total-hint" id="weight-total-hint">
              Contano solo i rapporti tra i pesi, non la somma a 100: il ranking si ricalcola comunque.{" "}
              <a href="#methodology">Vedi formula</a>
            </p>
          </div>
          <div className="weight-grid">
            {categoryOrder.map((category) => (
              <label className="weight-control" key={category}>
                <span>
                  <strong>{categoryLabels[category]}</strong>
                  <small>{categoryDescriptions[category]}</small>
                </span>
                <input
                  type="range"
                  min="0"
                  max="60"
                  value={weights[category]}
                  aria-label={categoryLabels[category]}
                  onChange={(event) => updateWeight(category, Number(event.target.value))}
                />
                <output>{weights[category]}</output>
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="ranking-section scroll-anchor" id="ranking" aria-labelledby="ranking-title">
        <div className="section-heading">
          <p className="eyebrow">Ranking operativo</p>
          <h2 id="ranking-title">Cerca, filtra, ordina</h2>
        </div>
        <div className="toolbar" aria-label="Filtri ranking">
          <label className="search-field" htmlFor={citySearchInputId}>
            <Search aria-hidden="true" />
            <span className="sr-only">Cerca città</span>
            <input
              id={citySearchInputId}
              value={query}
              list={citySearchListId}
              autoComplete="off"
              aria-autocomplete="list"
              aria-label="Cerca città"
              onChange={(event) => updateSearchQuery(event.target.value)}
              placeholder="Cerca una città"
            />
            <datalist id={citySearchListId}>
              {citySearchSuggestions.map((cityName) => (
                <option key={cityName} value={cityName} />
              ))}
            </datalist>
          </label>
          <label className="select-field">
            <Filter aria-hidden="true" />
            <span className="sr-only">Filtra per taglia</span>
            <select value={sizeFilter} onChange={(event) => setSizeFilter(event.target.value)}>
              <option value="all">Tutte le taglie</option>
              <option value="1">Grandi</option>
              <option value="2">Medie</option>
              <option value="3">Piccole</option>
              <option value="unknown">Non classificata</option>
            </select>
          </label>
          <label className="confidence-filter">
            <span>Confidenza minima</span>
            <input
              type="range"
              min="0"
              max="100"
              value={minConfidence}
              onChange={(event) => setMinConfidence(Number(event.target.value))}
            />
            <output>{minConfidence}</output>
          </label>
          <a className="download-link" href={withBase("data/ranking.csv")} download>
            <Download aria-hidden="true" />
            Scarica CSV
          </a>
          <p className="filter-result-count" aria-live="polite">
            {filteredCities.length} di {rankedCities.length} città
          </p>
        </div>

        {filtersActive ? (
          <div className="filter-summary" aria-label="Filtri attivi">
            <ul className="filter-chip-list">
              {query.trim().length > 0 ? (
                <li>
                  <span className="filter-chip">
                    <span className="filter-chip-label">Ricerca: {query.trim()}</span>
                    <button
                      type="button"
                      className="filter-chip-remove"
                      aria-label="Rimuovi filtro ricerca"
                      onClick={() => setQuery("")}
                    >
                      <X aria-hidden="true" size={16} strokeWidth={2.25} />
                    </button>
                  </span>
                </li>
              ) : null}
              {sizeFilter !== "all" ? (
                <li>
                  <span className="filter-chip">
                    <span className="filter-chip-label">
                      Taglia: {sizeFilterLabels[sizeFilter] ?? sizeFilter}
                    </span>
                    <button
                      type="button"
                      className="filter-chip-remove"
                      aria-label="Rimuovi filtro taglia"
                      onClick={() => setSizeFilter("all")}
                    >
                      <X aria-hidden="true" size={16} strokeWidth={2.25} />
                    </button>
                  </span>
                </li>
              ) : null}
              {minConfidence > 0 ? (
                <li>
                  <span className="filter-chip">
                    <span className="filter-chip-label">Confidenza ≥ {minConfidence}</span>
                    <button
                      type="button"
                      className="filter-chip-remove"
                      aria-label="Rimuovi filtro confidenza"
                      onClick={() => setMinConfidence(0)}
                    >
                      <X aria-hidden="true" size={16} strokeWidth={2.25} />
                    </button>
                  </span>
                </li>
              ) : null}
            </ul>
            <button type="button" className="filter-reset-button filter-summary-clear" onClick={clearFilters}>
              Azzera filtri
            </button>
          </div>
        ) : null}

        <ScoreReadingLegend />

        <div className="table-wrap">
          {filteredCities.length === 0 ? (
            <div className="filter-empty-panel" role="status">
              <p id="filter-empty-message">Nessun capoluogo corrisponde ai filtri selezionati.</p>
              {filtersActive ? (
                <button type="button" className="filter-reset-button" onClick={clearFilters}>
                  Azzera filtri
                </button>
              ) : null}
            </div>
          ) : isCompactRanking ? (
            <>
              <RankingMobileSort
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSortKeyChange={applyMobileSortKey}
                onToggleDirection={() =>
                  setSortDirection((current) => (current === "desc" ? "asc" : "desc"))
                }
              />
              <RankingMobileList
                cities={filteredCities}
                selectedCityName={selectedCity.city}
                onSelectCity={selectCity}
                weights={weights}
                contextualCategories={payload.coverageAudit.contextualCategories}
              />
            </>
          ) : (
            <table>
              <caption>
                Ranking interattivo dei capoluoghi. I valori 20* compaiono solo se la categoria ha
                peso maggiore di zero e manca un dato osservato (imputazione prudente nello score); n.d.
                indica assenza dati esclusa dal punteggio quando il peso è zero. Usa il pulsante info
                accanto a 20* per la spiegazione accessibile.
              </caption>
              <thead>
                <tr>
                  <SortableHeader label="#" sortKey="rank" current={sortKey} direction={sortDirection} onSort={chooseSort} />
                  <SortableHeader label="Città" sortKey="city" current={sortKey} direction={sortDirection} onSort={chooseSort} />
                  <SortableHeader label="Punteggio" sortKey="score" current={sortKey} direction={sortDirection} onSort={chooseSort} />
                  <SortableHeader label="Ciclabili (km)" sortKey="cycleNetworkEquivalent" current={sortKey} direction={sortDirection} onSort={chooseSort} />
                  <SortableHeader label="Infrastruttura" sortKey="infrastructure" current={sortKey} direction={sortDirection} onSort={chooseSort} />
                  <SortableHeader label="Sicurezza" sortKey="safety" current={sortKey} direction={sortDirection} onSort={chooseSort} />
                  <SortableHeader label="Connessioni" sortKey="connectivity" current={sortKey} direction={sortDirection} onSort={chooseSort} />
                  <SortableHeader label="Comfort" sortKey="comfort" current={sortKey} direction={sortDirection} onSort={chooseSort} />
                  <SortableHeader
                    label="Uso"
                    sortKey="usage"
                    current={sortKey}
                    direction={sortDirection}
                    onSort={chooseSort}
                    contextual={payload.coverageAudit.contextualCategories.includes("usage")}
                  />
                  <SortableHeader
                    label="Policy"
                    sortKey="policy"
                    current={sortKey}
                    direction={sortDirection}
                    onSort={chooseSort}
                    contextual={payload.coverageAudit.contextualCategories.includes("policy")}
                  />
                  <SortableHeader label="Conf." sortKey="confidence" current={sortKey} direction={sortDirection} onSort={chooseSort} />
                </tr>
              </thead>
              <tbody>
                {filteredCities.map((city) => (
                  <RankingTableRow
                    key={city.city}
                    city={city}
                    selected={city.city === selectedCity.city}
                    onSelectCity={selectCity}
                    weights={weights}
                    contextualCategories={payload.coverageAudit.contextualCategories}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <CityDetail
        city={selectedCity}
        allCities={rankedCities}
        weights={weights}
        metrics={payload.metricDefinitions}
        sources={payload.sources}
        onPick={selectCity}
        onOpenMap={() => openCityMap(selectedCity.city)}
        mapTriggerRef={mapTriggerRef}
        detailTitleRef={detailTitleRef}
        previous={rankedCities[selectedCity.adjustedRank - 2] ?? null}
        next={rankedCities[selectedCity.adjustedRank] ?? null}
        hiddenByFilters={selectedCityHidden}
        deepLinkWarning={deepLinkWarning}
        onRevealInTable={revealSelectedCityInTable}
        onClearFilters={clearFilters}
        usesCustomWeights={usesCustomWeights}
      />

      {mapPanelOpen ? (
        <CityMapPanel
          cityName={selectedCity.city}
          onClose={closeMapPanel}
          returnFocusRef={mapTriggerRef}
        />
      ) : null}

      <NationalContextSection context={payload.nationalContext} sources={payload.sources} />
      <Methodology payload={payload} weights={weights} />
      <CoverageAuditSection audit={payload.coverageAudit} />
      <DataExplorer payload={payload} />
      </main>
    </div>
  );
}

function sortValue(city: RankedCity, sortKey: SortKey): string | number {
  if (sortKey === "rank") return city.adjustedRank;
  if (sortKey === "city") return city.city;
  if (sortKey === "score") return city.adjustedScore;
  if (sortKey === "confidence") return city.dataConfidence;
  if (sortKey === "cycleNetworkEquivalent") return city.rawMetrics.cycleNetworkEquivalent ?? -1;
  return city.categoryScores[sortKey] ?? -1;
}

function MetricTile({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="metric-tile">
      <span className="tile-icon">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RankingTableRow({
  city,
  selected,
  onSelectCity,
  weights,
  contextualCategories
}: {
  city: RankedCity;
  selected: boolean;
  onSelectCity: (cityName: string) => void;
  weights: Weights;
  contextualCategories: ScoredCategoryKey[];
}) {
  return (
    <tr className={selected ? "selected-row" : undefined}>
      <td>#{city.adjustedRank}</td>
      <td>
        <button
          className="city-link"
          type="button"
          aria-current={selected ? "true" : undefined}
          onClick={() => onSelectCity(city.city)}
        >
          {city.city}
        </button>
        <span className="muted inline">
          {city.sizeClass ? sizeLabels[city.sizeClass] : "n.d."}
        </span>
      </td>
      <td>
        <strong>{formatMetric(city.adjustedScore, 1)}</strong>
      </td>
      <td>{formatMetric(city.rawMetrics.cycleNetworkEquivalent, 1)}</td>
      <td>
        <CategoryCell city={city} category="infrastructure" weights={weights} />
      </td>
      <td>
        <CategoryCell city={city} category="safety" weights={weights} />
      </td>
      <td>
        <CategoryCell city={city} category="connectivity" weights={weights} />
      </td>
      <td>
        <CategoryCell city={city} category="comfort" weights={weights} />
      </td>
      <td>
        <CategoryCell
          city={city}
          category="usage"
          weights={weights}
          contextual={contextualCategories.includes("usage")}
        />
      </td>
      <td>
        <CategoryCell
          city={city}
          category="policy"
          weights={weights}
          contextual={contextualCategories.includes("policy")}
        />
      </td>
      <td>{confidenceLabel(city.dataConfidence)}</td>
    </tr>
  );
}

function RankingMobileSort({
  sortKey,
  sortDirection,
  onSortKeyChange,
  onToggleDirection
}: {
  sortKey: SortKey;
  sortDirection: "asc" | "desc";
  onSortKeyChange: (sortKey: SortKey) => void;
  onToggleDirection: () => void;
}) {
  return (
    <div className="ranking-mobile-sort" aria-label="Ordina ranking">
      <label className="ranking-mobile-sort-field">
        <span>Ordina per</span>
        <select value={sortKey} onChange={(event) => onSortKeyChange(event.target.value as SortKey)}>
          {mobileSortOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="ranking-mobile-sort-direction" onClick={onToggleDirection}>
        {sortDirection === "asc" ? "Crescente" : "Decrescente"}
        <span className="sr-only">, ordine {sortDirection === "asc" ? "crescente" : "decrescente"}</span>
      </button>
    </div>
  );
}

function RankingMobileList({
  cities,
  selectedCityName,
  onSelectCity,
  weights,
  contextualCategories
}: {
  cities: RankedCity[];
  selectedCityName: string;
  onSelectCity: (cityName: string) => void;
  weights: Weights;
  contextualCategories: ScoredCategoryKey[];
}) {
  return (
    <ol className="ranking-mobile-list" aria-label="Ranking capoluoghi">
      {cities.map((city) => (
        <RankingMobileCard
          key={city.city}
          city={city}
          selected={city.city === selectedCityName}
          onSelectCity={onSelectCity}
          weights={weights}
          contextualCategories={contextualCategories}
        />
      ))}
    </ol>
  );
}

function RankingMobileCard({
  city,
  selected,
  onSelectCity,
  weights,
  contextualCategories
}: {
  city: RankedCity;
  selected: boolean;
  onSelectCity: (cityName: string) => void;
  weights: Weights;
  contextualCategories: ScoredCategoryKey[];
}) {
  return (
    <li className={selected ? "ranking-mobile-card selected" : "ranking-mobile-card"}>
      <div className="ranking-mobile-card-head">
        <span className="ranking-mobile-rank">#{city.adjustedRank}</span>
        <div className="ranking-mobile-city-block">
          <button
            className="city-link ranking-mobile-city"
            type="button"
            aria-current={selected ? "true" : undefined}
            onClick={() => onSelectCity(city.city)}
          >
            {city.city}
          </button>
          <span className="muted">
            {city.sizeClass ? sizeLabels[city.sizeClass] : "n.d."}
          </span>
        </div>
        <strong className="ranking-mobile-score">{formatMetric(city.adjustedScore, 1)}</strong>
      </div>
      <dl className="ranking-mobile-metrics">
        <div>
          <dt>Ciclabili (km)</dt>
          <dd>{formatMetric(city.rawMetrics.cycleNetworkEquivalent, 1)}</dd>
        </div>
        {mobileRankingCategories.map((category) => (
          <div key={category}>
            <dt>{categoryLabels[category]}</dt>
            <dd>
              <CategoryCell city={city} category={category} weights={weights} />
            </dd>
          </div>
        ))}
        {contextualCategories.map((category) => (
          <div key={category}>
            <dt className="ranking-mobile-metric-label">
              {contextualCategoryTableLabels[category] ?? categoryLabels[category]}
              <ContextCategoryBadge />
            </dt>
            <dd>
              <CategoryCell city={city} category={category} weights={weights} />
            </dd>
          </div>
        ))}
      </dl>
      <p className="ranking-mobile-foot muted">
        Confidenza: {confidenceLabel(city.dataConfidence)}
      </p>
    </li>
  );
}

function ContextCategoryBadge() {
  return (
    <span className="context-category-badge">
      <span aria-hidden="true">contestuale</span>
      <span className="sr-only">, {CONTEXTUAL_CATEGORY_SR_HINT}</span>
    </span>
  );
}

function SortableHeader({
  label,
  sortKey,
  current,
  direction,
  onSort,
  contextual = false
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  direction: "asc" | "desc";
  onSort: (sortKey: SortKey) => void;
  contextual?: boolean;
}) {
  const active = current === sortKey;
  const ariaSort = active ? (direction === "asc" ? "ascending" : "descending") : "none";
  return (
    <th scope="col" aria-sort={ariaSort}>
      <button className={active ? "sort active" : "sort"} type="button" onClick={() => onSort(sortKey)}>
        {label}
        {contextual ? <ContextCategoryBadge /> : null}
        <ArrowDownUp aria-hidden="true" />
        <span className="sr-only">
          ordina per {sortLabels[sortKey]} {active ? direction : ""}
        </span>
      </button>
    </th>
  );
}

const IMPUTATION_EXPLAINER =
  "Valore prudente (20) usato nello score per categoria senza dati osservati.";

function ScoreReadingLegend() {
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = () => setExpanded((value) => !value);

  return (
    <div className="score-reading-legend">
      <button
        type="button"
        className="score-reading-legend-toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={toggleExpanded}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          toggleExpanded();
        }}
      >
        Come si legge il punteggio
      </button>
      <div
        id={panelId}
        className="score-reading-legend-panel"
        hidden={!expanded}
        role="region"
        aria-label="Come si legge il punteggio"
      >
        <ul className="score-reading-legend-list">
          <li>
            <strong>Punteggio (0–100):</strong> media ponderata delle categorie con peso maggiore di
            zero; si aggiorna se modifichi i pesi.
          </li>
          <li>
            <strong>
              <span aria-hidden="true">20*</span>
              <span className="sr-only">20 asterisco</span>:
            </strong>{" "}
            imputazione prudente (20) quando manca il dato ma la categoria conta nel punteggio.
          </li>
          <li>
            <strong>n.d.:</strong> dato assente; con peso zero la categoria non entra nel calcolo.
          </li>
          <li>
            <strong>contestuale:</strong> uso e policy hanno peso default 0 finché la copertura
            nazionale resta bassa; restano visibili a scopo informativo.
          </li>
          <li>
            <strong>Confidenza:</strong> sintesi della completezza dati (alta, media o bassa); il
            filtro sopra esclude città sotto la soglia scelta.
          </li>
        </ul>
        <p className="score-reading-legend-links muted">
          <a href="#methodology">Metodologia e formula</a>
          {" · "}
          <a href="#coverage">Copertura per categoria</a>
        </p>
      </div>
    </div>
  );
}

function ImputedCategoryValue() {
  const explainerId = useId();
  const [expanded, setExpanded] = useState(false);

  return (
    <span className="imputed">
      <span aria-hidden="true">20*</span>
      <button
        type="button"
        className="imputed-help"
        aria-label="Spiega imputazione prudente (20*)"
        aria-expanded={expanded}
        aria-controls={explainerId}
        aria-describedby={expanded ? undefined : explainerId}
        onClick={() => setExpanded((value) => !value)}
      >
        <Info aria-hidden="true" />
        <span className="sr-only">Imputazione prudente</span>
      </button>
      <span
        id={explainerId}
        className={expanded ? "imputed-explainer" : "sr-only"}
        role={expanded ? "region" : undefined}
        aria-label={expanded ? "Imputazione prudente" : undefined}
      >
        {IMPUTATION_EXPLAINER}
      </span>
    </span>
  );
}

function MissingCategoryValue({ contextual = false }: { contextual?: boolean }) {
  return (
    <span className="missing-category">
      <span>n.d.</span>
      {contextual ? <ContextCategoryBadge /> : null}
    </span>
  );
}

function CategoryCell({
  city,
  category,
  weights,
  contextual = false
}: {
  city: RankedCity;
  category: Exclude<CategoryKey, "dataConfidence">;
  weights: Weights;
  contextual?: boolean;
}) {
  const value = city.categoryScores[category];
  if (value !== null && value !== undefined) {
    return <>{formatMetric(value, 1)}</>;
  }
  if (weights[category] > 0) {
    return <ImputedCategoryValue />;
  }
  return <MissingCategoryValue contextual={contextual} />;
}

function CityShareLink({ cityName }: { cityName: string }) {
  const statusId = useId();
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const shareUrl = buildCityShareUrl(cityName);

  const handleCopy = async () => {
    const result = await copyTextToClipboard(shareUrl);
    setCopyStatus(result === "failed" ? "failed" : "copied");
    window.setTimeout(() => setCopyStatus("idle"), 4000);
  };

  return (
    <div className="detail-share">
      <button type="button" className="detail-map-action" onClick={() => void handleCopy()}>
        <Link2 aria-hidden="true" />
        Copia link
      </button>
      {copyStatus === "copied" ? (
        <p id={statusId} className="detail-share-status" role="status">
          Link copiato negli appunti.
        </p>
      ) : null}
      {copyStatus === "failed" ? (
        <p id={statusId} className="detail-share-status detail-share-status-failed" role="status">
          Copia automatica non disponibile. Seleziona e copia manualmente il link qui sotto.
        </p>
      ) : null}
      {copyStatus === "failed" ? (
        <label className="detail-share-fallback">
          <span className="sr-only">Link condivisibile per {cityName}</span>
          <input
            type="text"
            className="detail-share-url"
            readOnly
            value={shareUrl}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      ) : null}
    </div>
  );
}

function MetricSourceLink({
  source,
  metricLabel
}: {
  source: SourceEntry | undefined;
  metricLabel: string;
}) {
  if (!source?.url) {
    return <span className="metric-source-missing">Fonte non disponibile</span>;
  }

  const linkText = `Apri fonte: ${source.publisher}`;
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      aria-label={`${linkText} — ${metricLabel}`}
    >
      {linkText}
    </a>
  );
}

function CityDetail({
  city,
  allCities,
  weights,
  metrics,
  sources,
  previous,
  next,
  onPick,
  onOpenMap,
  mapTriggerRef,
  detailTitleRef,
  hiddenByFilters = false,
  deepLinkWarning = null,
  onRevealInTable,
  onClearFilters,
  usesCustomWeights = false
}: {
  city: RankedCity;
  allCities: RankedCity[];
  weights: Weights;
  metrics: MetricDefinition[];
  sources: SourceEntry[];
  previous: RankedCity | null;
  next: RankedCity | null;
  onPick: (city: string) => void;
  onOpenMap: () => void;
  mapTriggerRef?: RefObject<HTMLButtonElement | null>;
  detailTitleRef?: RefObject<HTMLHeadingElement | null>;
  hiddenByFilters?: boolean;
  deepLinkWarning?: string | null;
  onRevealInTable?: () => void;
  onClearFilters?: () => void;
  usesCustomWeights?: boolean;
}) {
  const compareSelectId = useId();
  const comparisonHeadingId = useId();
  const [compareCityName, setCompareCityName] = useState("");

  useEffect(() => {
    setCompareCityName("");
  }, [city.city]);

  const compareCity = useMemo(
    () => allCities.find((entry) => entry.city === compareCityName) ?? null,
    [allCities, compareCityName]
  );

  const comparison = useMemo(
    () => (compareCity ? buildCityComparison(city, compareCity, weights) : null),
    [city, compareCity, weights]
  );

  const compareOptions = useMemo(
    () =>
      allCities
        .filter((entry) => entry.city !== city.city)
        .map((entry) => entry.city)
        .sort((left, right) => left.localeCompare(right, "it")),
    [allCities, city.city]
  );

  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const profileData = categoryOrder
    .filter((category) => category !== "dataConfidence")
    .map((category) => ({
      category: categoryLabels[category],
      score: city.categoryScores[category] ?? 20,
      imputed: city.categoryScores[category] === null,
      fill: categoryColors[category]
    }));

  return (
    <section className="detail-section scroll-anchor" id="detail" aria-labelledby="detail-title">
      <p className="sr-only" id="detail-selection-status" role="status" aria-live="polite" aria-atomic="true">
        Scheda aggiornata: {city.city}, posizione {city.adjustedRank} nel ranking.
      </p>
      <div className="section-heading">
        <p className="eyebrow">Scheda città</p>
        <h2 id="detail-title" ref={detailTitleRef} tabIndex={-1}>
          {city.city}
        </h2>
      </div>
      {deepLinkWarning ? (
        <div className="detail-filter-banner detail-deeplink-banner" role="status">
          <Info aria-hidden="true" />
          <p>{deepLinkWarning}</p>
        </div>
      ) : null}
      {hiddenByFilters ? (
        <div className="detail-filter-banner" role="status">
          <Filter aria-hidden="true" />
          <div className="detail-filter-banner-copy">
            <p>{city.city} non è visibile con i filtri attuali.</p>
            <div className="detail-filter-banner-actions">
              <button type="button" className="detail-filter-reveal-button" onClick={onRevealInTable}>
                Mostra in tabella
              </button>
              <button type="button" className="detail-filter-reset-button" onClick={onClearFilters}>
                Azzera filtri
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="detail-layout">
        <aside className="detail-summary">
          <span className="rank-pill large">#{city.adjustedRank}</span>
          <strong>{formatMetric(city.adjustedScore, 1)}</strong>
          <span className="muted">punteggio attuale</span>
          <div className="city-compare-field">
            <label htmlFor={compareSelectId}>Confronta con…</label>
            <select
              id={compareSelectId}
              className="city-compare-select"
              value={compareCityName}
              onChange={(event) => setCompareCityName(event.target.value)}
            >
              <option value="">Nessun confronto</option>
              {compareOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          {comparison ? (
            <section
              className="city-comparison-panel"
              aria-labelledby={comparisonHeadingId}
              data-testid="city-comparison-panel"
            >
              <h3 id={comparisonHeadingId}>Confronto con {comparison.otherCity}</h3>
              {usesCustomWeights ? (
                <p className="city-comparison-note">Con i pesi personalizzati attuali.</p>
              ) : null}
              <dl className="city-comparison-metrics">
                <div>
                  <dt>Posizione</dt>
                  <dd>{formatRankDelta(comparison.rankDelta)}</dd>
                </div>
                <div>
                  <dt>Punteggio</dt>
                  <dd>{formatScoreDelta(comparison.scoreDelta)}</dd>
                </div>
              </dl>
              <p className="city-comparison-gaps-title">Maggiore distanza per categoria</p>
              <ul className="city-comparison-gaps">
                {comparison.topGaps.map((gap) => (
                  <li key={gap.category}>{categoryGapSummary(gap)}</li>
                ))}
              </ul>
              <button
                type="button"
                className="city-comparison-clear"
                onClick={() => setCompareCityName("")}
              >
                Rimuovi confronto
              </button>
            </section>
          ) : null}
          <div className="comparison-buttons">
            <button type="button" disabled={!previous} onClick={() => previous && onPick(previous.city)}>
              {previous ? `Prima: ${previous.city}` : "Prima: n.d."}
            </button>
            <button type="button" disabled={!next} onClick={() => next && onPick(next.city)}>
              {next ? `Dopo: ${next.city}` : "Dopo: n.d."}
            </button>
          </div>
          <div className="detail-actions">
            <button
              ref={mapTriggerRef}
              type="button"
              className="detail-map-action"
              onClick={onOpenMap}
            >
              <MapPin aria-hidden="true" />
              Apri mappa
            </button>
            <CityShareLink cityName={city.city} />
          </div>
          <div className="confidence-badge">
            <ShieldCheck aria-hidden="true" />
            Confidenza {confidenceLabel(city.dataConfidence)} ({formatMetric(city.dataConfidence, 0)})
          </div>
        </aside>

        <div className="panel detail-panel">
          <div className="panel-title">
            <Bike aria-hidden="true" />
            <h3>Profilo categorie</h3>
          </div>
          <div aria-hidden="true">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={profileData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="category" />
                <YAxis domain={[0, 100]} />
                <Tooltip formatter={(value) => formatMetric(Number(value), 1)} />
                <Bar dataKey="score" name="Punteggio" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                  {profileData.map((entry) => (
                    <Cell key={entry.category} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="sr-only">
            {profileData.map((entry) => (
              <li key={entry.category}>
                {entry.category}: {formatMetric(entry.score, 1)}
                {entry.imputed ? " imputato" : ""}
              </li>
            ))}
          </ul>
        </div>

        <div className="detail-notes">
          <div>
            <h3>Punti forti</h3>
            <ul>{city.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div>
            <h3>Debolezze</h3>
            <ul>{city.weaknesses.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div>
            <h3>Incertezza</h3>
            <p>{city.uncertainty}</p>
          </div>
          {city.policySignals?.length ? (
            <div>
              <h3>Segnali policy</h3>
              <p>{city.policySignals.join(", ")}</p>
            </div>
          ) : null}
          <div>
            <h3>Copertura categorie</h3>
            <div className="coverage-list">
              {categoryOrder
                .filter((category) => category !== "dataConfidence")
                .map((category) => (
                  <span key={category}>
                    {categoryLabels[category]} <strong>{formatMetric(city.categoryCoverage[category], 0)}%</strong>
                  </span>
                ))}
            </div>
          </div>
        </div>
      </div>

      <div className="metric-matrix">
        <table className="metric-matrix-table">
          <caption>
            Metriche comparabili per {city.city}: valori originali, normalizzazione 0–100 e fonti
            osservate.
          </caption>
          <thead>
            <tr>
              <th scope="col">Metrica</th>
              <th scope="col">Originale</th>
              <th scope="col">Normalizzato</th>
              <th scope="col">Fonte</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => {
              const source = sourceMap.get(city.metricSources[metric.id] ?? metric.sourceId);
              const rawDigits = metric.unit === "%" ? 0 : 1;
              return (
                <tr key={metric.id}>
                  <th scope="row" className="metric-matrix-metric">
                    <strong>{metric.label}</strong>
                    <span className="metric-matrix-unit">{metric.unit}</span>
                  </th>
                  <td data-label="Valore originale">
                    {formatMetric(city.rawMetrics[metric.id], rawDigits)}
                  </td>
                  <td data-label="Normalizzato 0–100">
                    {formatMetric(city.normalizedMetrics[metric.id], 1)}
                  </td>
                  <td data-label="Fonte">
                    <MetricSourceLink source={source} metricLabel={metric.label} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatContextValue(value: number | string, unit: string): string {
  if (typeof value === "number") {
    const digits = Math.abs(value) >= 1000 ? 0 : value % 1 === 0 ? 0 : 1;
    const formatted = new Intl.NumberFormat("it-IT", {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits
    }).format(value);
    return unit ? `${formatted} ${unit}` : formatted;
  }
  return unit ? `${value} ${unit}` : String(value);
}

function NationalContextSection({
  context,
  sources
}: {
  context: NationalContext;
  sources: SourceEntry[];
}) {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));

  return (
    <section className="context-section scroll-anchor" id="contesto" aria-labelledby="context-title">
      <div className="context-header">
        <div className="section-heading">
          <p className="eyebrow">Contesto nazionale</p>
          <h2 id="context-title">Panorama Italia per i ciclisti</h2>
          <p className="context-lead">{context.disclaimer}</p>
        </div>
        <img
          className="context-icons"
          src={withBase("assets/ciclismo-sicuro-context-icons.png")}
          alt=""
          width={220}
          height={220}
        />
      </div>

      <div className="context-banner" role="note">
        <ShieldAlert aria-hidden="true" />
        <p>
          <strong>Solo informativo.</strong> I dati qui sotto non alimentano pesi, score o ordinamento
          del ranking cittadino.
        </p>
      </div>

      {context.sections.map((section) => (
        <NationalContextTopic
          key={section.id}
          section={section}
          sourceMap={sourceMap}
          isEstimate={section.id === "bikeThefts"}
        />
      ))}
    </section>
  );
}

function NationalContextTopic({
  section,
  sourceMap,
  isEstimate
}: {
  section: NationalContextSection;
  sourceMap: Map<string, SourceEntry>;
  isEstimate: boolean;
}) {
  return (
    <div className="context-topic" aria-labelledby={`context-${section.id}-title`}>
      <div className="context-topic-heading">
        <span className="context-topic-icon">{contextSectionIcons[section.id] ?? <Info aria-hidden="true" />}</span>
        <div>
          <h3 id={`context-${section.id}-title`}>{section.title}</h3>
          <p>{section.description}</p>
          {isEstimate ? (
            <p className="context-estimate-label">
              <ShieldAlert aria-hidden="true" />
              Stima da indagine FIAB - non statistica ufficiale nazionale
            </p>
          ) : null}
        </div>
      </div>

      <div className="context-card-grid">
        {section.cards.map((card) => (
          <NationalContextCard
            key={card.id}
            card={card}
            source={sourceMap.get(card.sourceId)}
            isEstimate={isEstimate}
          />
        ))}
      </div>

      {section.timeline?.length ? (
        <div className="context-timeline" aria-labelledby={`context-${section.id}-timeline`}>
          <h4 id={`context-${section.id}-timeline`}>Serie e confronti</h4>
          <ol className="context-timeline-list">
            {section.timeline.map((point) => (
              <NationalContextTimelineRow
                key={`${section.id}-${point.id}-${point.period}`}
                point={point}
                source={sourceMap.get(point.sourceId)}
                isEstimate={isEstimate}
              />
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function NationalContextCard({
  card,
  source,
  isEstimate
}: {
  card: NationalContextItem;
  source: SourceEntry | undefined;
  isEstimate: boolean;
}) {
  return (
    <article className={`context-card${isEstimate ? " context-card-estimate" : ""}`}>
      <div className="context-card-head">
        <h4>{card.label}</h4>
        <ReliabilityBadge reliability={card.reliability} isEstimate={isEstimate} />
      </div>
      <p className="context-value">{formatContextValue(card.value, card.unit)}</p>
      <p className="context-period">{card.period}</p>
      {card.changeLabel ? (
        <ChangeIndicator value={card.changeVsPrevious ?? null} label={card.changeLabel} />
      ) : null}
      <p className="context-interpretation">{card.interpretation}</p>
      <p className="context-caveat">
        <Info aria-hidden="true" />
        {card.caveat}
      </p>
      <ContextSourceLink source={source} contextLabel={card.label} />
    </article>
  );
}

function NationalContextTimelineRow({
  point,
  source,
  isEstimate
}: {
  point: NationalContextTimelinePoint;
  source: SourceEntry | undefined;
  isEstimate: boolean;
}) {
  return (
    <li className={`context-timeline-row${isEstimate ? " context-timeline-estimate" : ""}`}>
      <div className="context-timeline-marker" aria-hidden="true" />
      <div className="context-timeline-body">
        <div className="context-timeline-top">
          <strong>{point.label}</strong>
          <span className="context-period">{point.period}</span>
        </div>
        <p className="context-value compact">{formatContextValue(point.value, point.unit)}</p>
        <p className="context-interpretation">{point.interpretation}</p>
        <p className="context-caveat">
          <Info aria-hidden="true" />
          {point.caveat}
        </p>
        <div className="context-timeline-meta">
          <ReliabilityBadge reliability={point.reliability} isEstimate={isEstimate} />
          <ContextSourceLink source={source} contextLabel={point.label} compact />
        </div>
      </div>
    </li>
  );
}

function ReliabilityBadge({
  reliability,
  isEstimate
}: {
  reliability: NationalContextReliability;
  isEstimate: boolean;
}) {
  return (
    <span className={`reliability-badge reliability-${reliability}${isEstimate ? " estimate" : ""}`}>
      {isEstimate ? "Stima FIAB" : reliabilityLabels[reliability]}
    </span>
  );
}

function ChangeIndicator({ value, label }: { value: number | null; label: string }) {
  if (value === null || value === undefined) {
    return <span className="context-change neutral">{label}</span>;
  }
  const positive = value > 0;
  const negative = value < 0;
  const Icon = positive ? TrendingUp : negative ? TrendingDown : Info;
  const tone = positive ? "up" : negative ? "down" : "neutral";
  return (
    <span className={`context-change ${tone}`}>
      <Icon aria-hidden="true" />
      {positive ? "+" : ""}
      {formatMetric(value, 1)}% · {label}
    </span>
  );
}

function ContextSourceLink({
  source,
  contextLabel,
  compact = false
}: {
  source: SourceEntry | undefined;
  contextLabel: string;
  compact?: boolean;
}) {
  if (!source) {
    return <span className="context-source missing">Fonte non registrata</span>;
  }
  const accessibleName = `Apri fonte: ${source.publisher} — ${contextLabel}`;
  return (
    <a
      className={compact ? "context-source compact" : "context-source"}
      href={source.url}
      target="_blank"
      rel="noreferrer"
      aria-label={accessibleName}
    >
      <ExternalLink aria-hidden="true" />
      {compact ? source.publisher : `${source.title} · ${source.publisher}`}
    </a>
  );
}

function Methodology({ payload, weights }: { payload: RankingPayload; weights: Weights }) {
  return (
    <section className="method-section scroll-anchor" id="methodology" aria-labelledby="method-title">
      <div className="section-heading">
        <p className="eyebrow">Metodo</p>
        <h2 id="method-title">Formula e tradeoff</h2>
      </div>
      <div className="method-grid">
        <div className="panel">
          <h3>Formula</h3>
          <p>
            Ogni metrica comparabile viene normalizzata su scala 0-100. Le metriche dove valori
            bassi sono migliori, come vittime stradali, motorizzazione e inquinanti, sono
            invertite. Il ranking default è la media pesata delle categorie con copertura ampia;
            se una categoria attiva manca per una città viene assegnato un valore prudente pari a
            20 invece di rimuoverne il peso.
          </p>
          <p>
            Dentro ogni categoria si applica anche una penalità di copertura: se sono disponibili
            solo alcune metriche della categoria, il valore medio viene ridotto in proporzione.
          </p>
          <div className="formula">
            score = somma(categoria normalizzata * peso) / somma(pesi)
          </div>
        </div>
        <div className="panel">
          <h3>Pesi correnti</h3>
          <div className="weight-list">
            {categoryOrder.map((category) => (
              <span key={category}>
                {categoryLabels[category]} <strong>{weights[category]}</strong>
              </span>
            ))}
          </div>
        </div>
        <div className="panel">
          <h3>Missing data policy</h3>
          <p>
            Le lacune non vengono riempite con stime arbitrarie. Uso bici e policy hanno peso 0
            nel ranking default perché i segnali FIAB, quota modale e Copenhagenize coprono solo
            poche città: restano in scheda città e nei pesi opzionali. Protected lanes, sharing,
            parcheggi bici, PNRR e pendenze sono elencati come gap finché non esiste una raccolta
            comparabile e auditabile per tutti i capoluoghi.
          </p>
        </div>
      </div>
      <div className="metric-definitions">
        {payload.metricDefinitions.map((metric) => (
          <article key={metric.id}>
            <strong>{metric.label}</strong>
            <span>{categoryLabels[metric.category]} | {metric.direction === "higher" ? "alto e meglio" : "basso e meglio"}</span>
            <p>{metric.transform}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

type CoverageMetricFilter = "all" | "sparse" | "manual";
type CoverageMetricSortKey = "label" | "category" | "coverage";

const coverageMetricFilterLabels: Record<CoverageMetricFilter, string> = {
  all: "Tutte le metriche",
  sparse: "Solo copertura bassa",
  manual: "Solo inserimento manuale"
};

function coverageMetricSortValue(entry: MetricCoverageEntry, key: CoverageMetricSortKey): string | number {
  if (key === "label") return entry.label.toLocaleLowerCase("it");
  if (key === "category") return categoryLabels[entry.category].toLocaleLowerCase("it");
  return entry.coveragePercent;
}

function CoverageMetricsTable({
  metrics,
  cityCount
}: {
  metrics: MetricCoverageEntry[];
  cityCount: number;
}) {
  const [sortKey, setSortKey] = useState<CoverageMetricSortKey>("coverage");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [filter, setFilter] = useState<CoverageMetricFilter>("all");

  const filteredMetrics = useMemo(() => {
    const subset =
      filter === "sparse"
        ? metrics.filter((entry) => entry.sparse)
        : filter === "manual"
          ? metrics.filter((entry) => entry.manual)
          : metrics;
    const direction = sortDirection === "desc" ? -1 : 1;
    return [...subset].sort((left, right) => {
      const leftValue = coverageMetricSortValue(left, sortKey);
      const rightValue = coverageMetricSortValue(right, sortKey);
      if (leftValue < rightValue) return -1 * direction;
      if (leftValue > rightValue) return direction;
      return left.label.localeCompare(right.label, "it");
    });
  }, [filter, metrics, sortDirection, sortKey]);

  const chooseMetricSort = (next: CoverageMetricSortKey) => {
    if (next === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(next);
    setSortDirection(next === "coverage" ? "asc" : "asc");
  };

  const metricSortLabels: Record<CoverageMetricSortKey, string> = {
    label: "nome metrica",
    category: "categoria",
    coverage: "percentuale di copertura"
  };

  return (
    <div className="coverage-metrics-panel">
      <div className="coverage-metrics-toolbar">
        <label className="coverage-metrics-filter" htmlFor="coverage-metric-filter">
          Filtra metriche
        </label>
        <select
          id="coverage-metric-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value as CoverageMetricFilter)}
        >
          {(Object.keys(coverageMetricFilterLabels) as CoverageMetricFilter[]).map((key) => (
            <option key={key} value={key}>
              {coverageMetricFilterLabels[key]}
            </option>
          ))}
        </select>
        <p className="coverage-metrics-count" aria-live="polite">
          {filteredMetrics.length} di {metrics.length} metriche
        </p>
      </div>

      <div className="coverage-table-wrap">
        <table className="coverage-table coverage-metrics-table">
          <caption>
            Copertura per metrica su {cityCount} capoluoghi
          </caption>
          <thead>
            <tr>
              <CoverageMetricSortHeader
                label="Metrica"
                sortKey="label"
                current={sortKey}
                direction={sortDirection}
                onSort={chooseMetricSort}
                sortLabels={metricSortLabels}
              />
              <CoverageMetricSortHeader
                label="Categoria"
                sortKey="category"
                current={sortKey}
                direction={sortDirection}
                onSort={chooseMetricSort}
                sortLabels={metricSortLabels}
              />
              <CoverageMetricSortHeader
                label="Copertura"
                sortKey="coverage"
                current={sortKey}
                direction={sortDirection}
                onSort={chooseMetricSort}
                sortLabels={metricSortLabels}
              />
              <th scope="col">Tipo segnale</th>
            </tr>
          </thead>
          <tbody>
            {filteredMetrics.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <p className="coverage-metrics-empty" role="status">
                    Nessuna metrica corrisponde al filtro selezionato.
                  </p>
                </td>
              </tr>
            ) : (
              filteredMetrics.map((entry) => (
                <tr
                  key={entry.id}
                  className={
                    entry.sparse || entry.manual
                      ? "coverage-metric-row coverage-metric-row--sparse"
                      : "coverage-metric-row"
                  }
                >
                  <th scope="row">{entry.label}</th>
                  <td>{categoryLabels[entry.category]}</td>
                  <td>
                    {formatMetric(entry.coveragePercent, 1)}%
                    <span className="coverage-metric-cities">
                      {" "}
                      ({entry.citiesWithValue}/{cityCount} città)
                    </span>
                  </td>
                  <td>
                    <div className="coverage-metric-signal-badges">
                      {entry.sparse ? (
                        <span className="coverage-metric-badge coverage-metric-badge--sparse">
                          Copertura bassa
                        </span>
                      ) : null}
                      {entry.manual ? (
                        <span className="coverage-metric-badge coverage-metric-badge--manual">Manuale</span>
                      ) : null}
                      {!entry.sparse && !entry.manual ? (
                        <span className="coverage-metric-badge coverage-metric-badge--lab">Lab24 comparabile</span>
                      ) : null}
                    </div>
                    {entry.sparse ? (
                      <a className="coverage-metric-gap-link" href="#data">
                        Vedi gap fonti
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CoverageMetricSortHeader({
  label,
  sortKey,
  current,
  direction,
  onSort,
  sortLabels
}: {
  label: string;
  sortKey: CoverageMetricSortKey;
  current: CoverageMetricSortKey;
  direction: "asc" | "desc";
  onSort: (sortKey: CoverageMetricSortKey) => void;
  sortLabels: Record<CoverageMetricSortKey, string>;
}) {
  const active = current === sortKey;
  const ariaSort = active ? (direction === "asc" ? "ascending" : "descending") : "none";
  return (
    <th scope="col" aria-sort={ariaSort}>
      <button className={active ? "sort active" : "sort"} type="button" onClick={() => onSort(sortKey)}>
        {label}
        <ArrowDownUp aria-hidden="true" />
        <span className="sr-only">
          ordina per {sortLabels[sortKey]} {active ? direction : ""}
        </span>
      </button>
    </th>
  );
}

function CoverageAuditSection({ audit }: { audit: CoverageAudit }) {
  return (
    <section className="coverage-audit-section scroll-anchor" id="coverage" aria-labelledby="coverage-title">
      <div className="section-heading">
        <p className="eyebrow">Audit copertura</p>
        <h2 id="coverage-title">Perché uso e policy non entrano nel ranking default</h2>
      </div>
      <p className="data-note">
        Qui trovi la copertura per categoria e per singola metrica su tutti i capoluoghi confrontabili.
        Le metriche con copertura bassa o raccolta manuale restano visibili in scheda città ma non
        alimentano il punteggio default finché non raggiungono la soglia nazionale (
        {formatMetric(audit.highCoverageThresholdPercent, 0)}%).
      </p>
      <div className="coverage-audit-grid">
        <div className="panel">
          <h3>Categorie nel ranking default</h3>
          <p>
            Solo metriche Lab24 con copertura ampia su {audit.cityCount} capoluoghi (soglia{" "}
            {formatMetric(audit.highCoverageThresholdPercent, 0)}%).
          </p>
          <ul className="coverage-category-list">
            {audit.defaultScoreCategories.map((category) => {
              const entry = audit.categories.find((item) => item.category === category);
              return (
                <li key={category}>
                  <strong>{categoryLabels[category]}</strong>
                  <span>
                    peso default {entry?.defaultWeight ?? 0} | copertura{" "}
                    {formatMetric(entry?.coveragePercent ?? 0, 1)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="panel">
          <h3>Categorie contestuali</h3>
          <p>
            Visibili in scheda città e attivabili con gli slider, ma escluse dal punteggio default
            per evitare confronti parziali.
          </p>
          <ul className="coverage-category-list contextual">
            {audit.contextualCategories.map((category) => {
              const entry = audit.categories.find((item) => item.category === category);
              return (
                <li key={category}>
                  <strong>{categoryLabels[category]}</strong>
                  <span>
                    peso default 0 | copertura {formatMetric(entry?.coveragePercent ?? 0, 1)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="panel">
          <h3>Segnali sparsi</h3>
          <p>Metriche manuali o storiche con copertura troppo bassa per il ranking comparabile.</p>
          <ul className="sparse-signal-list">
            {audit.sparseSignals.map((signal) => (
              <li key={signal}>{signal}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="coverage-table-wrap">
        <table className="coverage-table">
          <caption>Copertura per categoria su {audit.cityCount} capoluoghi</caption>
          <thead>
            <tr>
              <th scope="col">Categoria</th>
              <th scope="col">Peso default</th>
              <th scope="col">Copertura</th>
              <th scope="col">Nel ranking default</th>
            </tr>
          </thead>
          <tbody>
            {audit.categories.map((entry) => (
              <tr key={entry.category}>
                <td>{categoryLabels[entry.category]}</td>
                <td>{entry.defaultWeight}</td>
                <td>{formatMetric(entry.coveragePercent, 1)}%</td>
                <td>{entry.includedInDefaultScore ? "Sì" : "No (contestuale)"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CoverageMetricsTable metrics={audit.metrics} cityCount={audit.cityCount} />

      <ul className="coverage-notes">
        {audit.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}

function DataExplorer({ payload }: { payload: RankingPayload }) {
  return (
    <section className="data-section scroll-anchor" id="data" aria-labelledby="data-title">
      <div className="section-heading">
        <p className="eyebrow">Data explorer</p>
        <h2 id="data-title">Download, fonti, gap</h2>
      </div>
      <p className="data-note">
        I download riflettono i pesi default della pipeline, non le modifiche temporanee degli slider.
        I valori grezzi estratti dalle tabelle Lab24 non sono offerti come download pubblico per
        rispettare i termini di pubblicazione delle fonti; restano disponibili ranking e dati
        normalizzati con attribuzione.
      </p>
      <div className="download-grid">
        <a href={withBase("data/ranking.json")} download>
          <Download aria-hidden="true" />
          Ranking JSON
        </a>
        <a href={withBase("data/ranking.csv")} download>
          <Download aria-hidden="true" />
          Scarica ranking CSV
        </a>
        <a href={withBase("data/normalized-indicators.json")} download>
          <Download aria-hidden="true" />
          Dati normalizzati
        </a>
      </div>

      <div className="gap-list">
        {payload.sourceGaps.map((gap) => (
          <p key={gap}>
            <AlertTriangle aria-hidden="true" />
            {gap}
          </p>
        ))}
      </div>

      <div className="source-table">
        {payload.sources.map((source) => (
          <article key={source.id}>
            <div>
              <strong>{source.title}</strong>
              <span>{source.publisher} | {source.reliability} | accesso {source.accessDate}</span>
            </div>
            <p>{source.notes}</p>
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Apri fonte: ${source.publisher} — ${source.title}`}
            >
              Apri fonte: {source.publisher}
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}

export default App;
