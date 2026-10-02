import { ArrowLeft, ArrowRight, Info, Link2, MapPinned, TriangleAlert } from "lucide-react";
import { lazy, Suspense, useId, useState, type RefObject } from "react";
import { citySummary, metricHighlights, riskSentence } from "../lib/cityText";
import { describeRatio, formatMetricValue, formatNumber, formatPercent, sizeLabel } from "../lib/format";
import { PILLAR_COLORS, PILLAR_ORDER } from "../lib/scoring";
import { encodeWeights, shareUrl } from "../lib/urlState";
import type { MetricDefinition, PillarId, RankedCity, RankingPayload, Weights } from "../types";
import { ScoreBar } from "./RankingSection";

const CrashSeriesChart = lazy(() => import("../charts/CityCharts").then((m) => ({ default: m.CrashSeriesChart })));
const CycleLaneChart = lazy(() => import("../charts/CityCharts").then((m) => ({ default: m.CycleLaneChart })));
const CrashProfileBars = lazy(() => import("../charts/CityCharts").then((m) => ({ default: m.CrashProfileBars })));

const LOG_MIN = Math.log(0.25);
const LOG_MAX = Math.log(4);
function ratioPosition(ratio: number): number {
  const clamped = Math.min(4, Math.max(0.25, ratio));
  return ((Math.log(clamped) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100;
}

/** Point estimate and 90% interval of a risk ratio on a log scale centred on 1. */
export function RiskInterval({ ratio, low, high, label }: { ratio: number; low: number; high: number; label: string }) {
  const tone = high < 1 ? "low" : low > 1 ? "high" : "neutral";
  return (
    <figure className={`risk-interval ${tone}`}>
      <figcaption className="sr-only">
        {label}: {formatNumber(ratio, 2)}, intervallo al 90% da {formatNumber(low, 2)} a {formatNumber(high, 2)}
      </figcaption>
      <div className="risk-scale" aria-hidden="true">
        <span className="risk-zone safer" />
        <span className="risk-zone riskier" />
        <span className="risk-one" style={{ left: `${ratioPosition(1)}%` }} />
        <span
          className="risk-band"
          style={{ left: `${ratioPosition(low)}%`, width: `${ratioPosition(high) - ratioPosition(low)}%` }}
        />
        <span className="risk-point" style={{ left: `${ratioPosition(ratio)}%` }} />
      </div>
      <div className="risk-ticks" aria-hidden="true">
        <span>0,25×</span>
        <span>0,5×</span>
        <span>1× atteso</span>
        <span>2×</span>
        <span>4×</span>
      </div>
    </figure>
  );
}

function ChartFallback({ height }: { height: number }) {
  return (
    <div className="chart-loading" style={{ minHeight: height }}>
      Caricamento grafico…
    </div>
  );
}

function MetricRow({
  metric,
  city,
  compare
}: {
  metric: MetricDefinition;
  city: RankedCity;
  compare: RankedCity | null;
}) {
  return (
    <li className="metric-row">
      <div className="metric-text">
        <span className="metric-label">{metric.label}</span>
        <span className="metric-meta">
          {metric.unit} · {metric.period}{metric.weight === 0 ? " · contesto, escluso dal punteggio" : ""}
        </span>
      </div>
      <div className="metric-values">
        <strong>{formatMetricValue(city.metrics[metric.id], metric.digits, metric.unit)}</strong>
        {compare ? (
          <span className="metric-compare">
            {compare.name}: {formatMetricValue(compare.metrics[metric.id], metric.digits, metric.unit)}
          </span>
        ) : null}
      </div>
      <span className="metric-score" title="Punteggio normalizzato 0–100">
        {formatNumber(city.metricScores[metric.id], 0)}
      </span>
    </li>
  );
}

export function CityProfile({
  payload,
  city,
  cities,
  compare,
  onCompareChange,
  onSelectCity,
  customWeights,
  weights,
  onOpenStreetMap,
  streetMapTriggerRef
}: {
  payload: RankingPayload;
  city: RankedCity;
  cities: RankedCity[];
  compare: RankedCity | null;
  onCompareChange: (id: string | null) => void;
  onSelectCity: (id: string, options?: { scroll?: boolean }) => void;
  customWeights: boolean;
  weights: Weights;
  onOpenStreetMap: () => void;
  streetMapTriggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const compareId = useId();
  const [copied, setCopied] = useState(false);
  const cityIndex = cities.findIndex((entry) => entry.id === city.id);
  const previous = cities[cityIndex - 1] ?? null;
  const next = cities[cityIndex + 1] ?? null;
  const pillarById = new Map(payload.pillars.map((pillar) => [pillar.id, pillar]));
  const metricsByPillar = (pillar: PillarId) => payload.metrics.filter((metric) => metric.pillar === pillar);
  const highlights = metricHighlights(city, payload.metrics);
  const alphabetical = [...cities].filter((entry) => entry.id !== city.id).sort((a, b) => a.name.localeCompare(b.name, "it"));
  const { safety } = city;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl(city.id, customWeights ? encodeWeights(weights) : null));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="section city-section" id="citta" aria-labelledby="city-title">
      <p className="sr-only" role="status" aria-live="polite">
        Scheda aggiornata: {city.name}, {city.liveRank === null ? "indice non calcolabile con questi pesi" : `${city.liveRank}ª posizione`}.
      </p>
      <div className="city-header">
        <div>
          <p className="eyebrow">Scheda città</p>
          <h2 id="city-title" tabIndex={-1}>
            {city.name}
          </h2>
          <p className="city-subtitle">
            {city.region} · {formatNumber(city.population)} abitanti ({city.populationYear}) · città{" "}
            {sizeLabel(city.sizeClass)}
            {city.metropolitanCapital ? " · capoluogo di città metropolitana" : ""}
          </p>
        </div>
        <div className="city-actions">
          <button type="button" className="button button-ghost" disabled={!previous} onClick={() => previous && onSelectCity(previous.id, { scroll: false })}>
            <ArrowLeft aria-hidden="true" />
            <span className="sr-only">Città precedente in classifica:</span>
            {previous ? previous.name : "—"}
          </button>
          <button type="button" className="button button-ghost" disabled={!next} onClick={() => next && onSelectCity(next.id, { scroll: false })}>
            <span className="sr-only">Città successiva in classifica:</span>
            {next ? next.name : "—"}
            <ArrowRight aria-hidden="true" />
          </button>
          <button type="button" ref={streetMapTriggerRef} className="button button-ghost" onClick={onOpenStreetMap}>
            <MapPinned aria-hidden="true" />
            Mappa della rete
          </button>
          <button type="button" className="button button-ghost" onClick={() => void copyLink()}>
            <Link2 aria-hidden="true" />
            {copied ? "Link copiato" : "Copia link"}
          </button>
        </div>
      </div>

      <div className="city-overview">
        <div className="city-score-card">
          <span className="city-score-label">Indice Ciclismo Sicuro</span>
          <strong className="city-score">{formatNumber(city.liveScore, 1)}</strong>
          <span className="city-rank">
            {city.liveRank === null ? "Dati insufficienti per questi pesi" : `${city.liveRank}ª su ${cities.length}`}
            {customWeights ? " con i tuoi pesi" : ""}
          </span>
          <span className="city-rank-range">
            Posizione con pesi attorno allo standard: {city.rankRange[0]}–{city.rankRange[1]}
          </span>
        </div>
        <div className="city-summary">
          <p>{citySummary(city, cities.length)}</p>
          <ul className="highlight-list">
            {highlights.best.map(({ metric }) => (
              <li key={metric.id} className="good">
                <span>Meglio di molti:</span> {metric.label.toLowerCase()} (
                {formatMetricValue(city.metrics[metric.id], metric.digits, metric.unit)}
                {metric.unit.startsWith("%") || metric.unit === "sì/no" || metric.unit === "rapporto" ? "" : ` ${metric.unit}`})
              </li>
            ))}
            {highlights.worst.map(({ metric }) => (
              <li key={metric.id} className="bad">
                <span>Da migliorare:</span> {metric.label.toLowerCase()} (
                {formatMetricValue(city.metrics[metric.id], metric.digits, metric.unit)}
                {metric.unit.startsWith("%") || metric.unit === "sì/no" || metric.unit === "rapporto" ? "" : ` ${metric.unit}`})
              </li>
            ))}
          </ul>
          <label className="compare-field" htmlFor={compareId}>
            Confronta con
            <select
              id={compareId}
              value={compare?.id ?? ""}
              onChange={(event) => onCompareChange(event.target.value || null)}
            >
              <option value="">nessuna città</option>
              {alphabetical.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {compare ? (
        <div className="compare-strip" aria-label={`Confronto con ${compare.name}`}>
          <h3>
            {city.name} vs {compare.name}
          </h3>
          <dl>
            <div>
              <dt>Indice</dt>
              <dd>
                {formatNumber(city.liveScore, 1)} vs {formatNumber(compare.liveScore, 1)}
              </dd>
            </div>
            {PILLAR_ORDER.slice(0, 4).map((pillar) => {
              const a = city.pillarScores[pillar];
              const b = compare.pillarScores[pillar];
              const diff = a !== null && b !== null ? a - b : null;
              return (
                <div key={pillar}>
                  <dt>{pillarById.get(pillar)?.shortLabel}</dt>
                  <dd>
                    {formatNumber(a, 0)} vs {formatNumber(b, 0)}
                    {diff !== null ? (
                      <span className={diff >= 0 ? "diff up" : "diff down"}>
                        {diff >= 0 ? "+" : "−"}
                        {formatNumber(Math.abs(diff), 0)}
                      </span>
                    ) : null}
                  </dd>
                </div>
              );
            })}
            <div>
              <dt>Morti e feriti / attesi</dt>
              <dd>
                {formatNumber(city.safety.ratio, 2)}× vs {formatNumber(compare.safety.ratio, 2)}×
              </dd>
            </div>
          </dl>
          <button type="button" className="link-button" onClick={() => onCompareChange(null)}>
            Rimuovi confronto
          </button>
        </div>
      ) : null}

      <div className="safety-panel">
        <div className="safety-text">
          <h3>L'incidentalità ciclistica registrata a {city.name}</h3>
          <p>{riskSentence(city)}</p>
          <RiskInterval ratio={safety.ratio} low={safety.ratioLow} high={safety.ratioHigh} label="Morti e feriti rispetto all'atteso del modello" />
          <dl className="safety-figures">
            <div>
              <dt>Morti e feriti rispetto all'atteso</dt>
              <dd>
                <strong>{formatNumber(safety.ratio, 2)}×</strong> {describeRatio(safety.ratio)}
              </dd>
            </div>
            <div>
              <dt>Ciclisti morti {safety.deathsPeriod}</dt>
              <dd>
                <strong>{formatNumber(safety.deaths)}</strong> contro {formatNumber(safety.expectedDeaths, 1)} attesi
                (stima {formatNumber(safety.fatalityRatio, 2)}×)
              </dd>
            </div>
            <div>
              <dt>Per 100.000 abitanti</dt>
              <dd>
                <strong>{formatNumber(safety.perResident100k, 1)}</strong> ciclisti morti o feriti l'anno
              </dd>
            </div>
            <div>
              <dt>Per 1.000 pendolari in bici (2011)</dt>
              <dd>
                <strong>{formatNumber(safety.perBikeCommuter1000, 1)}</strong> l'anno
              </dd>
            </div>
          </dl>
          <p className="fine-print">
            <Info aria-hidden="true" />
            Il modello usa la quota di pendolari in bici del 2011, non viaggi o chilometri attuali. Gli incidenti
            avvengono nel comune e possono coinvolgere non residenti. L'intervallo al 90% è condizionato al modello:
            non comprende gli errori nel proxy storico né la sottonotifica dei feriti.
          </p>
        </div>
        <div className="safety-charts">
          <h4>Ciclisti morti e feriti per anno</h4>
          <Suspense fallback={<ChartFallback height={240} />}>
            <CrashSeriesChart series={city.crashSeries} />
          </Suspense>
          <table className="sr-only">
            <caption>Ciclisti morti e feriti per anno a {city.name}</caption>
            <thead>
              <tr>
                <th scope="col">Anno</th>
                <th scope="col">Morti</th>
                <th scope="col">Feriti</th>
                <th scope="col">Di cui su e-bike</th>
              </tr>
            </thead>
            <tbody>
              {city.crashSeries.map((entry) => (
                <tr key={entry.year}>
                  <th scope="row">{entry.year}</th>
                  <td>{entry.killed}</td>
                  <td>{entry.injured}</td>
                  <td>{entry.ebike}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="chart-note">
            Le e-bike sono codificate separatamente da maggio 2020; gli anni precedenti non sono comparabili per tipo di bici. Morti nel periodo:{" "}
            {city.crashSeries.map((entry) => entry.killed).reduce((a, b) => a + b, 0)}.
          </p>
        </div>
      </div>

      {safety.exposureScenarios ? (
        <details className="exposure-details panel">
          <summary>Quanto cambia il confronto se il proxy storico è diverso?</summary>
          <p>
            Dimezziamo o raddoppiamo soltanto il proxy di questa città, mantenendo fissi i casi registrati, il modello
            e gli altri capoluoghi. Sono scenari illustrativi con pesi standard, non previsioni o intervalli di confidenza.
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th scope="col">Proxy rispetto al 2011</th><th scope="col">Morti e feriti / attesi</th><th scope="col">Indice standard</th><th scope="col">Posizione</th></tr></thead>
              <tbody>
                <tr><th scope="row">Come nel modello</th><td>{formatNumber(safety.ratio, 2)}×</td><td>{formatNumber(city.score, 1)}</td><td>{city.rank}</td></tr>
                {safety.exposureScenarios.map((scenario) => (
                  <tr key={scenario.multiplier}><th scope="row">{scenario.multiplier < 1 ? "Dimezzato" : "Raddoppiato"}</th><td>{formatNumber(scenario.ratio, 2)}×</td><td>{formatNumber(scenario.score, 1)}</td><td>{scenario.rank}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      <div className="profile-panel">
        <div>
          <h3>Come avvengono gli incidenti</h3>
          <p className="muted">
            {formatNumber(city.crashProfile.casualties)} ciclisti morti o feriti nel {city.crashProfile.period}
            {city.crashProfile.ebikeShare !== null
              ? `; il ${formatPercent(city.crashProfile.ebikeShare)} su e-bike (2021–2024)`
              : ""}
            .
          </p>
          <Suspense fallback={<ChartFallback height={220} />}>
            <CrashProfileBars profile={city.crashProfile} national={payload.findings.profile} />
          </Suspense>
        </div>
        <div>
          <h3>Piste ciclabili dichiarate dal Comune (km)</h3>
          <Suspense fallback={<ChartFallback height={200} />}>
            <CycleLaneChart series={city.cycleLaneSeries} />
          </Suspense>
          {city.context.osm ? (
            <p className="muted">
              Snapshot OSM: {formatNumber(city.context.osm.separatedKm, 1)} km con tag cycleway/track e{" "}
              {formatNumber(city.context.osm.paintedLaneKm, 1)} km di strade con tag lane, su{" "}
              {formatNumber(city.context.osm.roadKm, 0)} km di rete stradale selezionata. Le geometrie non sono ritagliate
              al confine; i tag non certificano la protezione. Dato contestuale del{" "}
              {city.context.osm.timestamp ? new Date(city.context.osm.timestamp).toLocaleDateString("it-IT") : "periodo non disponibile"}.
            </p>
          ) : null}
        </div>
      </div>

      <div className="pillar-grid">
        {PILLAR_ORDER.map((pillarId) => {
          const pillar = pillarById.get(pillarId);
          if (!pillar) return null;
          const contextual = payload.defaultWeights[pillarId] === 0;
          return (
            <article className={contextual ? "pillar-card contextual" : "pillar-card"} key={pillarId}>
              <header>
                <span className="pillar-dot" style={{ background: PILLAR_COLORS[pillarId] }} aria-hidden="true" />
              <h3>{pillar.label}</h3>
                {contextual ? <span className="tag">contesto</span> : null}
              </header>
              <ScoreBar value={city.pillarScores[pillarId]} color={PILLAR_COLORS[pillarId]} label="Punteggio 0–100" />
              {city.dataCoverage?.pillarCoverage[pillarId] !== null && city.dataCoverage?.pillarCoverage[pillarId] !== undefined ? (
                <p className="chart-note">Copertura dei pesi interni: {formatPercent(city.dataCoverage.pillarCoverage[pillarId])}.</p>
              ) : null}
              <ul className="metric-list">
                {metricsByPillar(pillarId).map((metric) => (
                  <MetricRow key={metric.id} metric={metric} city={city} compare={compare} />
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      {city.flags.length ? (
        <div className="flag-box" role="note">
          <TriangleAlert aria-hidden="true" />
          <div>
            <h3>Da sapere sui dati di {city.name}</h3>
            <ul>
              {city.flags.map((flag) => (
                <li key={flag}>{flag}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}
