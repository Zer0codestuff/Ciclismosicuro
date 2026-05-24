import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { AlertTriangle, ExternalLink, Layers, MapPin, RefreshCw, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from "react";
import { createPortal } from "react-dom";
import {
  CITY_MAP_LAYER_META,
  fetchCityMapData,
  openStreetMapSearchUrl,
  OVERPASS_API_URL,
  type CityMapData,
  type CityMapFeature,
  type CityMapLayerId,
  type CityMapLayerMeta,
  type LatLng
} from "./cityMapData";

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

type LayerVisibility = Record<Exclude<CityMapLayerId, "boundary">, boolean>;

function defaultLayerVisibility(): LayerVisibility {
  return CITY_MAP_LAYER_META.reduce(
    (accumulator, layer) => {
      accumulator[layer.id] = layer.defaultVisible;
      return accumulator;
    },
    {} as LayerVisibility
  );
}

function latLngsFromFeature(feature: CityMapFeature): L.LatLngExpression[] | L.LatLngExpression[][] {
  if (Array.isArray(feature.coordinates[0])) {
    return (feature.coordinates as LatLng[][]).map((ring) =>
      ring.map((point): L.LatLngTuple => [point.lat, point.lng])
    );
  }
  return (feature.coordinates as LatLng[]).map((point): L.LatLngTuple => [point.lat, point.lng]);
}

function styleForLayer(meta: CityMapLayerMeta | undefined, layerId: CityMapLayerId): L.PathOptions {
  const color = meta?.color ?? (layerId === "boundary" ? "#063c38" : "#475569");
  if (layerId === "boundary") {
    return {
      color,
      weight: 2,
      opacity: 0.9,
      fillOpacity: 0.03,
      dashArray: "4 4"
    };
  }
  if (meta?.geometryType === "polygon") {
    return {
      color,
      weight: 1.5,
      opacity: 0.85,
      fillColor: color,
      fillOpacity: 0.18
    };
  }
  if (meta?.geometryType === "point") {
    return {
      color: "#ffffff",
      weight: 1.5,
      fillColor: color,
      fillOpacity: 0.95
    };
  }
  return {
    color,
    weight: 3,
    opacity: 0.85
  };
}

function popupNode(label: string): HTMLElement {
  const strong = document.createElement("strong");
  strong.textContent = label;
  return strong;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableElementsIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      !element.closest("[hidden]") &&
      !element.closest("[inert]")
  );
}

function lockAppShellWhileModalOpen(): () => void {
  const shell = document.querySelector(".app-shell");
  const inerted: HTMLElement[] = [];

  if (shell) {
    for (const child of Array.from(shell.children)) {
      if (!(child instanceof HTMLElement)) continue;
      child.setAttribute("inert", "");
      inerted.push(child);
    }
  }

  document.body.classList.add("city-map-modal-open");

  return () => {
    document.body.classList.remove("city-map-modal-open");
    for (const element of inerted) {
      element.removeAttribute("inert");
    }
  };
}

function addFeatureToMap(
  group: L.LayerGroup,
  feature: CityMapFeature,
  meta: CityMapLayerMeta | undefined
): L.Layer {
  const style = styleForLayer(meta, feature.layerId);
  const popup = feature.label ? popupNode(feature.label) : undefined;

  if (feature.geometryType === "point") {
    const [point] = feature.coordinates as LatLng[];
    const marker = L.circleMarker([point.lat, point.lng], {
      radius: 6,
      ...style
    });
    if (popup) marker.bindPopup(popup);
    marker.addTo(group);
    return marker;
  }

  if (feature.geometryType === "polygon") {
    const rings = latLngsFromFeature(feature) as L.LatLngExpression[][];
    const polygon = L.polygon(rings.length === 1 ? rings[0] : rings, style);
    if (popup) polygon.bindPopup(popup);
    polygon.addTo(group);
    return polygon;
  }

  const latLngs = latLngsFromFeature(feature) as L.LatLngExpression[];
  const polyline = L.polyline(latLngs, style);
  if (popup) polyline.bindPopup(popup);
  polyline.addTo(group);
  return polyline;
}

export function CityMapPanel({
  cityName,
  onClose,
  returnFocusRef
}: {
  cityName: string;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupsRef = useRef<Partial<Record<CityMapLayerId, L.LayerGroup>>>({});
  const boundaryLayerRef = useRef<L.LayerGroup | null>(null);

  const [data, setData] = useState<CityMapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>(() => defaultLayerVisibility());

  const handleClose = useCallback(() => {
    onClose();
    requestAnimationFrame(() => returnFocusRef?.current?.focus());
  }, [onClose, returnFocusRef]);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, [cityName]);

  useEffect(() => lockAppShellWhileModalOpen(), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const dialogRoot = dialogRef.current;
      if (!dialogRoot) return;

      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableElementsIn(dialogRoot);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!dialogRoot.contains(active)) {
        event.preventDefault();
        first.focus();
        return;
      }

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handleClose]);

  const metaById = useMemo(
    () => new Map(CITY_MAP_LAYER_META.map((layer) => [layer.id, layer])),
    []
  );

  const loadData = useCallback(
    async (signal: AbortSignal, force = false) => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchCityMapData(cityName, { signal, force });
        if (signal.aborted) return;
        setData(result);
      } catch (loadError) {
        if (signal.aborted) return;
        setData(null);
        setError(loadError instanceof Error ? loadError.message : "Errore di caricamento mappa.");
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [cityName]
  );

  useEffect(() => {
    setLayerVisibility(defaultLayerVisibility());
  }, [cityName]);

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal, reloadToken > 0);
    return () => controller.abort();
  }, [cityName, loadData, reloadToken]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: true
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: OSM_ATTRIBUTION
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupsRef.current = {};
      boundaryLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;

    Object.values(layerGroupsRef.current).forEach((group) => group?.remove());
    layerGroupsRef.current = {};
    boundaryLayerRef.current?.remove();
    boundaryLayerRef.current = L.layerGroup().addTo(map);

    for (const layerId of CITY_MAP_LAYER_META.map((layer) => layer.id)) {
      layerGroupsRef.current[layerId] = L.layerGroup();
    }

    for (const layer of Object.values(data.layers)) {
      if (layer.id === "boundary") {
        for (const feature of layer.features) {
          addFeatureToMap(boundaryLayerRef.current, feature, undefined);
        }
        continue;
      }

      const group = layerGroupsRef.current[layer.id];
      const meta = metaById.get(layer.id);
      if (!group || !meta) continue;

      for (const feature of layer.features) {
        addFeatureToMap(group, feature, meta);
      }
    }

    for (const meta of CITY_MAP_LAYER_META) {
      const group = layerGroupsRef.current[meta.id];
      if (!group) continue;
      if (layerVisibility[meta.id]) {
        group.addTo(map);
      }
    }

    const { south, west, north, east } = data.bounds;
    map.fitBounds(
      L.latLngBounds([south, west], [north, east]),
      { padding: [24, 24], maxZoom: 14 }
    );
  }, [data, layerVisibility, metaById]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const meta of CITY_MAP_LAYER_META) {
      const group = layerGroupsRef.current[meta.id];
      if (!group) continue;
      if (layerVisibility[meta.id]) {
        if (!map.hasLayer(group)) group.addTo(map);
      } else if (map.hasLayer(group)) {
        map.removeLayer(group);
      }
    }
  }, [layerVisibility]);

  function toggleLayer(layerId: Exclude<CityMapLayerId, "boundary">) {
    setLayerVisibility((current) => ({ ...current, [layerId]: !current[layerId] }));
  }

  function retry() {
    setReloadToken((current) => current + 1);
  }

  const layerStatuses = CITY_MAP_LAYER_META.map((meta) => {
    const layer = data?.layers[meta.id];
    return {
      meta,
      count: layer?.count ?? 0,
      available: layer?.available ?? false
    };
  });

  const modal = (
    <div className="city-map-modal-root">
      <div
        className="city-map-backdrop"
        aria-hidden="true"
        onClick={handleClose}
      />
      <section
        ref={dialogRef}
        className="city-map-section scroll-anchor"
        id="city-map"
        role="dialog"
        aria-modal="true"
        aria-labelledby="city-map-title"
      >
      <div className="section-heading city-map-heading">
        <div className="city-map-heading-copy">
          <p className="eyebrow">Mappa città</p>
          <h2 id="city-map-title">Infrastruttura ciclabile · {cityName}</h2>
          <p className="city-map-lead">
            Dati live da OpenStreetMap via Overpass API. Copertura e tag dipendono dal contributo
            della community: un layer vuoto indica assenza di oggetti mappati, non assenza fisica.
          </p>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          className="city-map-close"
          onClick={handleClose}
          aria-label={`Chiudi mappa di ${cityName}`}
        >
          <X aria-hidden="true" />
          Chiudi
        </button>
      </div>

      <div className="city-map-layout">
        <aside className="city-map-sidebar panel" aria-label="Controlli mappa">
          <div className="panel-title">
            <Layers aria-hidden="true" />
            <h3>Layer</h3>
          </div>
          <ul className="city-map-layer-list">
            {layerStatuses.map(({ meta, count, available }) => {
              const checked = layerVisibility[meta.id];
              const statusLabel = loading
                ? "in caricamento"
                : available
                  ? `${count} oggetti`
                  : "non disponibile / vuoto";
              return (
                <li key={meta.id} className={available ? undefined : "layer-empty"}>
                  <label className="city-map-layer-toggle">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!available || loading}
                      onChange={() => toggleLayer(meta.id)}
                    />
                    <span className="layer-swatch" style={{ backgroundColor: meta.color }} aria-hidden="true" />
                    <span className="layer-copy">
                      <strong>{meta.label}</strong>
                      <small>{meta.description}</small>
                      <span className="layer-status">{statusLabel}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="city-map-legend" aria-label="Legenda mappa">
            <h4>Legenda</h4>
            <ul>
              {CITY_MAP_LAYER_META.map((meta) => (
                <li key={meta.id}>
                  <span className="layer-swatch" style={{ backgroundColor: meta.color }} aria-hidden="true" />
                  {meta.label}
                </li>
              ))}
              <li>
                <span className="layer-swatch boundary" aria-hidden="true" />
                Confine comunale OSM
              </li>
            </ul>
          </div>

          <div className="city-map-actions">
            <button type="button" className="city-map-retry" onClick={retry} disabled={loading}>
              <RefreshCw aria-hidden="true" />
              {loading ? "Caricamento..." : "Ricarica dati"}
            </button>
            <a
              className="city-map-osm-link"
              href={openStreetMapSearchUrl(cityName)}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink aria-hidden="true" />
              Apri su OpenStreetMap
            </a>
          </div>

          <p className="city-map-source">
            <MapPin aria-hidden="true" />
            Tile © OpenStreetMap · dati layer via{" "}
            <a href={OVERPASS_API_URL} target="_blank" rel="noreferrer">
              Overpass API
            </a>
            {data?.matchedName ? ` · confine: ${data.matchedName}` : null}
          </p>
        </aside>

        <div className="city-map-main panel">
          {error ? (
            <div className="city-map-state city-map-error" role="alert">
              <AlertTriangle aria-hidden="true" />
              <div>
                <strong>Impossibile caricare la mappa</strong>
                <p>{error}</p>
                <button type="button" onClick={retry}>
                  Riprova
                </button>
              </div>
            </div>
          ) : null}

          {loading && !data ? (
            <div className="city-map-state city-map-loading" aria-live="polite">
              <RefreshCw aria-hidden="true" className="spin" />
              <p>Interrogo Overpass per il confine e i layer ciclabili di {cityName}…</p>
            </div>
          ) : null}

          <div
            ref={mapContainerRef}
            className="city-map-canvas"
            role="region"
            aria-label={`Mappa OpenStreetMap di ${cityName}`}
            hidden={Boolean(error && !data)}
          />

          {loading && data ? (
            <p className="city-map-loading-badge" aria-live="polite">
              Aggiornamento layer in corso…
            </p>
          ) : null}
        </div>
      </div>
      </section>
    </div>
  );

  return createPortal(modal, document.body);
}
