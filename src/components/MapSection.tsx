import { lazy, Suspense, useState } from "react";
import { formatNumber } from "../lib/format";
import { withBase } from "../lib/assets";
import { riskColor, SCORE_CLASS_LABELS, SCORE_RAMP } from "../lib/scoring";
import type { RankedCity } from "../types";
import type { MapMode } from "./ItalyMap";

const ItalyMap = lazy(() => import("./ItalyMap"));

const RISK_LEGEND = [
  { label: "≤ 0,6", ratio: 0.5 },
  { label: "0,6–0,85", ratio: 0.7 },
  { label: "0,85–1,15", ratio: 1 },
  { label: "1,15–1,5", ratio: 1.3 },
  { label: "> 1,5", ratio: 2 }
];

function CityButtonList({
  title,
  cities,
  onSelectCity,
  selectedId,
  value,
  rank
}: {
  title: string;
  cities: RankedCity[];
  onSelectCity: (id: string) => void;
  selectedId: string;
  value: (city: RankedCity) => string;
  rank: (city: RankedCity) => number | null;
}) {
  return (
    <div className="map-list">
      <h3>{title}</h3>
      <ol>
        {cities.map((city) => (
          <li key={city.id}>
            <button
              type="button"
              className={city.id === selectedId ? "map-list-item is-selected" : "map-list-item"}
              onClick={() => onSelectCity(city.id)}
            >
              <span className="map-list-rank">{rank(city) ?? "—"}</span>
              <span className="map-list-name">{city.name}</span>
              <span className="map-list-value">{value(city)}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function MapSection({
  cities,
  selectedId,
  onSelectCity,
  customWeights
}: {
  cities: RankedCity[];
  selectedId: string;
  onSelectCity: (id: string) => void;
  customWeights: boolean;
}) {
  const [mode, setMode] = useState<MapMode>("score");
  const byRisk = [...cities].sort((a, b) => a.safety.ratio - b.safety.ratio);
  const scored = cities.filter((city) => city.liveScore !== null);
  const top = mode === "score" ? scored.slice(0, 5) : byRisk.slice(0, 5);
  const bottom = mode === "score" ? scored.slice(-5).reverse() : byRisk.slice(-5).reverse();
  const rank = (city: RankedCity) => (mode === "score" ? city.liveRank : byRisk.indexOf(city) + 1);
  const value = (city: RankedCity) =>
    mode === "score" ? formatNumber(city.liveScore, 1) : `${formatNumber(city.safety.ratio, 2)}×`;

  return (
    <section className="section map-section" id="mappa" aria-labelledby="map-title">
      <div className="illustrated-section-heading">
        <div className="section-heading">
          <p className="eyebrow">La mappa</p>
          <h2 id="map-title">Le differenze tra città, sulla mappa</h2>
          <p className="section-lead">
            Ogni cerchio è un capoluogo; la dimensione cresce con la popolazione. Clicca per aprire la scheda.
            {customWeights ? " L'indice riflette i pesi personalizzati che hai scelto." : null}
          </p>
        </div>
        <picture className="map-heading-illustration">
          <source srcSet={withBase("assets/cycling-map-detail.webp")} type="image/webp" />
          <img src={withBase("assets/cycling-map-detail.png")}
            alt="" width={1448} height={1086} loading="lazy" decoding="async" />
        </picture>
      </div>
      <div className="map-layout">
        <div className="map-frame">
          <div className="segmented" role="radiogroup" aria-label="Colore dei cerchi">
            <button type="button" role="radio" aria-checked={mode === "score"} onClick={() => setMode("score")}>
              Indice complessivo
            </button>
            <button type="button" role="radio" aria-checked={mode === "risk"} onClick={() => setMode("risk")}>
              Morti e feriti / attesi
            </button>
          </div>
          <Suspense fallback={<div className="italy-map map-loading">Caricamento mappa…</div>}>
            <ItalyMap cities={cities} mode={mode} selectedId={selectedId} onSelectCity={onSelectCity} />
          </Suspense>
          <div className="map-legend" aria-label="Legenda">
            {mode === "score" ? (
              <>
                <span className="map-legend-title">Indice 0–100</span>
                {SCORE_RAMP.map((color, index) => (
                  <span key={color} className="legend-item">
                    <span className="legend-swatch" style={{ background: color }} />
                    {SCORE_CLASS_LABELS[index]}
                  </span>
                ))}
              </>
            ) : (
              <>
                <span className="map-legend-title">Ciclisti morti e feriti rispetto all'atteso</span>
                {RISK_LEGEND.map((entry) => (
                  <span key={entry.label} className="legend-item">
                    <span className="legend-swatch" style={{ background: riskColor(entry.ratio) }} />
                    {entry.label}
                  </span>
                ))}
              </>
            )}
          </div>
        </div>
        <aside className="map-aside">
          {mode === "risk" ? (
            <p className="map-aside-note">
              Il rapporto confronta i morti e feriti 2022–2024 con l'atteso del modello, usando popolazione e quota
              di pendolari in bici del 2011. 1 = in linea con l'atteso. Non è il rischio individuale attuale.
            </p>
          ) : null}
          <CityButtonList
            title={mode === "score" ? "Indice più alto" : "Rapporto più basso"}
            cities={top}
            onSelectCity={onSelectCity}
            selectedId={selectedId}
            value={value}
            rank={rank}
          />
          <CityButtonList
            title={mode === "score" ? "Indice più basso" : "Rapporto più alto"}
            cities={bottom}
            onSelectCity={onSelectCity}
            selectedId={selectedId}
            value={value}
            rank={rank}
          />
        </aside>
      </div>
    </section>
  );
}
