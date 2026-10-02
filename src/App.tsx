/// <reference types="vite/client" />
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnalysisSection } from "./components/AnalysisSection";
import { CityProfile } from "./components/CityProfile";
import { Hero } from "./components/Hero";
import { MapSection } from "./components/MapSection";
import { MethodSection } from "./components/MethodSection";
import { RankingSection } from "./components/RankingSection";
import { SiteFooter, SiteHeader } from "./components/SiteChrome";
import { useRankingData } from "./lib/useRankingData";
import { MAX_WEIGHT, rankCities, weightsEqual } from "./lib/scoring";
import {
  decodeWeights,
  encodeWeights,
  readUrlState,
  resolveCityParam,
  writeUrlState
} from "./lib/urlState";
import type { RankingPayload, Weights } from "./types";

const CityMapPanel = lazy(() => import("./CityMapPanel").then((module) => ({ default: module.CityMapPanel })));

export const DEFAULT_TITLE = "Ciclismo Sicuro · Quanto è sicuro pedalare nei capoluoghi italiani";

function App() {
  const [state, retry] = useRankingData();
  if (state.status === "loading") {
    return (
      <div className="app-shell">
        <main className="empty-state" role="status" aria-live="polite">
          <LoaderCircle className="spin" aria-hidden="true" />
          <h1>Caricamento dati…</h1>
          <p>Sto leggendo incidenti, infrastruttura e indicatori dei capoluoghi.</p>
        </main>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="app-shell">
        <main className="empty-state empty-state-error" role="alert">
          <AlertTriangle aria-hidden="true" />
          <h1>Dataset non caricato</h1>
          <p>Errore: {state.message}</p>
          <button type="button" className="button button-primary" onClick={retry}>
            Riprova
          </button>
          <p className="muted">Puoi riprovare il caricamento tra poco.</p>
        </main>
      </div>
    );
  }
  return <Dashboard payload={state.payload} />;
}

export function Dashboard({ payload }: { payload: RankingPayload }) {
  const initialUrl = useRef(readUrlState());
  const [weights, setWeights] = useState<Weights>(
    () => decodeWeights(initialUrl.current.weights, MAX_WEIGHT) ?? payload.defaultWeights
  );
  const [selectedId, setSelectedId] = useState<string>(
    () => resolveCityParam(payload.cities, initialUrl.current.city)?.id ?? payload.cities[0].id
  );
  const [compareId, setCompareId] = useState<string | null>(null);
  const [streetMapOpen, setStreetMapOpen] = useState(false);
  const mapTriggerRef = useRef<HTMLButtonElement | null>(null);

  const customWeights = !weightsEqual(weights, payload.defaultWeights);
  const ranked = useMemo(() => rankCities(payload.cities, weights), [payload.cities, weights]);
  const selected = ranked.find((city) => city.id === selectedId) ?? ranked[0];
  const compare = compareId ? ranked.find((city) => city.id === compareId) ?? null : null;

  useEffect(() => {
    writeUrlState({ city: selected.id, weights: customWeights ? encodeWeights(weights) : null });
    document.title = `${selected.name} · ${DEFAULT_TITLE}`;
  }, [selected.id, selected.name, weights, customWeights]);

  useEffect(() => {
    const restoreUrlState = () => {
      const url = readUrlState();
      setWeights(decodeWeights(url.weights, MAX_WEIGHT) ?? payload.defaultWeights);
      const restored = resolveCityParam(payload.cities, url.city) ?? payload.cities[0];
      setSelectedId(restored.id);
      setCompareId((current) => current === restored.id ? null : current);
      setStreetMapOpen(false);
    };
    window.addEventListener("popstate", restoreUrlState);
    return () => window.removeEventListener("popstate", restoreUrlState);
  }, [payload.cities, payload.defaultWeights]);

  useEffect(() => {
    if (initialUrl.current.city && resolveCityParam(payload.cities, initialUrl.current.city)) {
      requestAnimationFrame(() => document.getElementById("citta")?.scrollIntoView());
    }
  }, [payload.cities]);

  const selectCity = useCallback((id: string, { scroll = true }: { scroll?: boolean } = {}) => {
    if (!payload.cities.some((city) => city.id === id)) return;
    writeUrlState({ city: id, weights: customWeights ? encodeWeights(weights) : null }, "push");
    setSelectedId(id);
    setCompareId((current) => (current === id ? null : current));
    if (scroll) {
      requestAnimationFrame(() => {
        const target = document.getElementById("citta");
        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        target?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        document.getElementById("city-title")?.focus({ preventScroll: true });
      });
    }
  }, [payload.cities, weights, customWeights]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenuto">
        Salta al contenuto
      </a>
      <SiteHeader />
      <main id="contenuto" tabIndex={-1}>
        <Hero payload={payload} cities={ranked} onSelectCity={selectCity} />
        <MapSection cities={ranked} selectedId={selected.id} onSelectCity={selectCity} customWeights={customWeights} />
        <RankingSection
          payload={payload}
          cities={ranked}
          weights={weights}
          onWeightsChange={setWeights}
          customWeights={customWeights}
          selectedId={selected.id}
          onSelectCity={selectCity}
        />
        <CityProfile
          payload={payload}
          city={selected}
          cities={ranked}
          compare={compare}
          onCompareChange={setCompareId}
          onSelectCity={selectCity}
          customWeights={customWeights}
          weights={weights}
          onOpenStreetMap={() => setStreetMapOpen(true)}
          streetMapTriggerRef={mapTriggerRef}
        />
        <AnalysisSection payload={payload} cities={ranked} selectedId={selected.id} onSelectCity={selectCity} />
        <MethodSection payload={payload} />
      </main>
      <SiteFooter payload={payload} />
      {streetMapOpen ? (
        <Suspense fallback={null}>
          <CityMapPanel
            cityName={selected.name}
            istatCode={selected.istatCode}
            onClose={() => setStreetMapOpen(false)}
            returnFocusRef={mapTriggerRef}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

export default App;
