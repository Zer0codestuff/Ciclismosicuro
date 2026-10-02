import { ArrowDown, ArrowUp, ArrowUpDown, Download, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { withBase } from "../lib/assets";
import { formatNumber } from "../lib/format";
import { CORE_PILLARS, PILLAR_COLORS } from "../lib/scoring";
import { cityMatchesQuery } from "../lib/urlState";
import type { PillarId, RankedCity, RankingPayload, Weights } from "../types";
import { WeightsPanel } from "./WeightsPanel";

type SortKey = "rank" | "name" | "risk" | PillarId;

function sortValue(city: RankedCity, key: SortKey): number | string | null {
  if (key === "rank") return city.liveRank;
  if (key === "name") return city.name;
  if (key === "risk") return city.safety.ratio;
  return city.pillarScores[key];
}

/** Ascending makes sense first for rank, name and risk; descending for scores. */
function defaultDirection(key: SortKey): "asc" | "desc" {
  return key === "rank" || key === "name" || key === "risk" ? "asc" : "desc";
}

export function ScoreBar({ value, color, label }: { value: number | null; color: string; label?: string }) {
  return (
    <span className="score-bar" title={label}>
      <span className="score-bar-track" aria-hidden="true">
        <span className="score-bar-fill" style={{ width: `${value ?? 0}%`, background: color }} />
      </span>
      <span className="score-bar-value">{formatNumber(value, 0)}</span>
    </span>
  );
}

function SortHeader({
  label,
  sortKey,
  current,
  direction,
  onSort,
  className
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  direction: "asc" | "desc";
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = current === sortKey;
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      className={className}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button type="button" className={active ? "sort is-active" : "sort"} onClick={() => onSort(sortKey)}>
        {label}
        <Icon aria-hidden="true" />
      </button>
    </th>
  );
}

export function RankingSection({
  payload,
  cities,
  weights,
  onWeightsChange,
  customWeights,
  selectedId,
  onSelectCity
}: {
  payload: RankingPayload;
  cities: RankedCity[];
  weights: Weights;
  onWeightsChange: (weights: Weights) => void;
  customWeights: boolean;
  selectedId: string;
  onSelectCity: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("all");
  const [size, setSize] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const pageSize = 20;
  const pillarById = new Map(payload.pillars.map((pillar) => [pillar.id, pillar]));

  const visible = useMemo(() => {
    const filtered = cities.filter(
      (city) =>
        cityMatchesQuery(city, query) &&
        (area === "all" || city.macroArea === area) &&
        (size === "all" || city.sizeClass === size)
    );
    const factor = direction === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      const left = sortValue(a, sortKey);
      const right = sortValue(b, sortKey);
      if (left === null || right === null) return left === right ? a.name.localeCompare(b.name, "it") : left === null ? 1 : -1;
      if (typeof left === "string" && typeof right === "string") return left.localeCompare(right, "it") * factor;
      return ((left as number) - (right as number)) * factor || (a.liveRank ?? Infinity) - (b.liveRank ?? Infinity) || a.name.localeCompare(b.name, "it");
    });
  }, [cities, query, area, size, sortKey, direction]);

  function sortBy(key: SortKey) {
    setPage(0);
    if (key === sortKey) setDirection((value) => (value === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDirection(defaultDirection(key));
    }
  }

  const filtersActive = query.trim() !== "" || area !== "all" || size !== "all";
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageCities = showAll ? visible : visible.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  return (
    <section className="section ranking-section" id="classifica" aria-labelledby="ranking-title">
      <div className="section-heading">
        <p className="eyebrow">La classifica</p>
        <h2 id="ranking-title">Indice Ciclismo Sicuro {customWeights ? "(pesi personalizzati)" : ""}</h2>
        <p className="section-lead">
          Un indice esplorativo 0–100 con pesi editoriali regolabili. “Posizione con altri pesi” descrive la
          sensibilità a pesi attorno allo standard; non è un intervallo di confidenza e non cambia con i tuoi cursori.
        </p>
      </div>

      <div className="ranking-layout">
        <WeightsPanel
          pillars={payload.pillars}
          weights={weights}
          defaultWeights={payload.defaultWeights}
          onChange={onWeightsChange}
        />

        <div className="ranking-main">
          <div className="toolbar" role="search" aria-label="Filtra la classifica">
            <label className="field field-search">
              <Search aria-hidden="true" />
              <span className="sr-only">Cerca città o regione</span>
              <input
                value={query}
                placeholder="Cerca città o regione"
                onChange={(event) => { setQuery(event.target.value); setPage(0); }}
              />
            </label>
            <label className="field">
              <span className="sr-only">Area geografica</span>
              <select value={area} onChange={(event) => { setArea(event.target.value); setPage(0); }}>
                <option value="all">Tutta Italia</option>
                <option value="Nord">Nord</option>
                <option value="Centro">Centro</option>
                <option value="Mezzogiorno">Mezzogiorno</option>
              </select>
            </label>
            <label className="field">
              <span className="sr-only">Dimensione</span>
              <select value={size} onChange={(event) => { setSize(event.target.value); setPage(0); }}>
                <option value="all">Tutte le dimensioni</option>
                <option value="grande">Grandi (≥ 200 mila ab.)</option>
                <option value="media">Medie (80–200 mila)</option>
                <option value="piccola">Piccole (&lt; 80 mila)</option>
              </select>
            </label>
            <label className="field">
              <span className="sr-only">Ordina classifica</span>
              <select value={`${sortKey}:${direction}`} onChange={(event) => {
                const [key, order] = event.target.value.split(":");
                setSortKey(key as SortKey);
                setDirection(order as "asc" | "desc");
                setPage(0);
              }}>
                <option value="rank:asc">Indice più alto</option>
                <option value="rank:desc">Indice più basso</option>
                <option value="name:asc">Città A–Z</option>
                <option value="name:desc">Città Z–A</option>
                <option value="risk:asc">Rapporto più basso</option>
                <option value="risk:desc">Rapporto più alto</option>
                {CORE_PILLARS.flatMap((pillar) => [
                  <option key={`${pillar}:desc`} value={`${pillar}:desc`}>{pillarById.get(pillar)?.shortLabel}: alto → basso</option>,
                  <option key={`${pillar}:asc`} value={`${pillar}:asc`}>{pillarById.get(pillar)?.shortLabel}: basso → alto</option>
                ])}
              </select>
            </label>
            <a className="button button-ghost" href={withBase("data/ranking.csv")} download>
              <Download aria-hidden="true" />
              CSV (pesi standard)
            </a>
          </div>
          <p className="result-count" aria-live="polite">
            {visible.length} di {cities.length} capoluoghi
            {filtersActive ? (
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setQuery("");
                  setArea("all");
                  setSize("all");
                  setPage(0);
                }}
              >
                Azzera filtri
              </button>
            ) : null}
          </p>

          <div className="table-wrap">
            <table className="ranking-table">
              <caption className="sr-only">
                Classifica dei capoluoghi per indice Ciclismo Sicuro con punteggi dei pilastri da 0 a 100 e rischio
                relativo per i ciclisti.
              </caption>
              <thead>
                <tr>
                  <SortHeader label="#" sortKey="rank" current={sortKey} direction={direction} onSort={sortBy} className="col-rank" />
                  <SortHeader label="Città" sortKey="name" current={sortKey} direction={direction} onSort={sortBy} />
                  <th scope="col" className="col-range">
                    Posizione con altri pesi
                  </th>
                  {CORE_PILLARS.map((pillar) => (
                    <SortHeader
                      key={pillar}
                      label={pillarById.get(pillar)?.shortLabel ?? pillar}
                      sortKey={pillar}
                      current={sortKey}
                      direction={direction}
                      onSort={sortBy}
                      className="col-pillar"
                    />
                  ))}
                  <SortHeader label="Morti e feriti / attesi" sortKey="risk" current={sortKey} direction={direction} onSort={sortBy} className="col-risk" />
                  <th scope="col" className="col-score">
                    Indice
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageCities.map((city) => {
                  const shift = city.liveRank === null ? 0 : city.rank - city.liveRank;
                  return (
                    <tr key={city.id} className={city.id === selectedId ? "is-selected" : undefined}>
                      <td className="col-rank" data-label="Posizione">
                        <span className="rank-number">{city.liveRank ?? "—"}</span>
                        {customWeights && shift !== 0 ? (
                          <span className={shift > 0 ? "rank-shift up" : "rank-shift down"}>
                            {shift > 0 ? `▲${shift}` : `▼${-shift}`}
                            <span className="sr-only"> posizioni rispetto ai pesi standard</span>
                          </span>
                        ) : null}
                      </td>
                      <td className="col-city">
                        <button type="button" className="city-link" onClick={() => onSelectCity(city.id)}>
                          {city.name}
                        </button>
                        <span className="muted">
                          {city.region} · {formatNumber(city.population / 1000, 0)} mila ab.
                        </span>
                      </td>
                      <td className="col-range" data-label="Posizione con altri pesi">
                        {city.rankRange[0]}–{city.rankRange[1]}
                      </td>
                      {CORE_PILLARS.map((pillar) => (
                        <td key={pillar} className="col-pillar" data-label={pillarById.get(pillar)?.shortLabel}>
                          <ScoreBar value={city.pillarScores[pillar]} color={PILLAR_COLORS[pillar]} />
                        </td>
                      ))}
                      <td className="col-risk" data-label="Morti e feriti / attesi">
                        <span className={city.safety.ratio < 0.85 ? "risk-pill low" : city.safety.ratio > 1.15 ? "risk-pill high" : "risk-pill"}>
                          {formatNumber(city.safety.ratio, 2)}×
                        </span>
                      </td>
                      <td className="col-score" data-label="Indice">
                        <strong>{formatNumber(city.liveScore, 1)}</strong>
                        {city.dataCoverage?.defaultWeightedCoverage !== null && city.dataCoverage?.defaultWeightedCoverage !== undefined && city.dataCoverage.defaultWeightedCoverage < 0.999 ? (
                          <small className="coverage-note" title="Copertura dei pesi standard: alcuni indicatori sono mancanti e i pesi interni rinormalizzati">
                            {Math.round(city.dataCoverage.defaultWeightedCoverage * 100)}% dati standard
                          </small>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visible.length === 0 ? <p className="empty-row">Nessun capoluogo corrisponde ai filtri.</p> : null}
          </div>
          {visible.length > 0 ? (
            <nav className="ranking-pagination" aria-label="Pagine della classifica">
              <span role="status">
                {showAll ? `Tutti i ${visible.length} risultati` : `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, visible.length)} di ${visible.length}`}
              </span>
              <div>
                {!showAll ? <>
                  <button className="button button-ghost" type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Precedenti</button>
                  <button className="button button-ghost" type="button" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>Successivi</button>
                </> : null}
                <button className="button button-ghost" type="button" onClick={() => { setShowAll(!showAll); setPage(0); }}>{showAll ? "20 per pagina" : "Mostra tutte"}</button>
              </div>
            </nav>
          ) : null}
          <p className="table-note">
            Rapporto: morti e feriti 2022–2024 rispetto all'atteso per popolazione e quota di pendolari in bici 2011
            (1× = in linea). “Posizione con altri pesi”: 90% delle posizioni ottenute con{" "}
            {formatNumber(payload.model.sensitivity.draws)} combinazioni casuali di pesi attorno a quelli standard.
          </p>
        </div>
      </div>
    </section>
  );
}
