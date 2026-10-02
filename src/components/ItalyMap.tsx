import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { formatNumber } from "../lib/format";
import { riskColor, scoreColor } from "../lib/scoring";
import type { RankedCity } from "../types";

export type MapMode = "score" | "risk";

const ITALY_BOUNDS = L.latLngBounds([36.4, 6.6], [47.1, 18.6]);

function radiusFor(population: number): number {
  return Math.max(5, Math.min(17, 3 + Math.sqrt(population / 1000) * 0.55));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export default function ItalyMap({
  cities,
  mode,
  selectedId,
  onSelectCity
}: {
  cities: RankedCity[];
  mode: MapMode;
  selectedId: string;
  onSelectCity: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelectCity);
  onSelectRef.current = onSelectCity;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: true,
      minZoom: 5,
      maxZoom: 11
    });
    map.fitBounds(ITALY_BOUNDS, { padding: [8, 8] });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      className: "muted-tiles"
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    // Draw small cities last so they stay clickable on top of large circles.
    const ordered = [...cities].sort((a, b) => b.population - a.population);
    for (const city of ordered) {
      const selected = city.id === selectedId;
      const fill = mode === "score" ? (city.liveScore === null ? "#84958e" : scoreColor(city.liveScore)) : riskColor(city.safety.ratio);
      const marker = L.circleMarker([city.lat, city.lon], {
        radius: radiusFor(city.population),
        color: selected ? "#d97706" : mode === "risk" ? "#64756c" : "#ffffff",
        weight: selected ? 3 : 1.5,
        fillColor: fill,
        fillOpacity: 0.92
      });
      const value =
        mode === "score"
          ? city.liveRank === null
            ? "Indice non calcolabile con questi pesi"
            : `Indice ${formatNumber(city.liveScore, 1)} · ${city.liveRank}° su ${cities.length}`
          : `Morti e feriti ${formatNumber(city.safety.ratio, 2)} × l'atteso del modello`;
      marker.bindTooltip(`<strong>${escapeHtml(city.name)}</strong><br>${escapeHtml(value)}`, {
        direction: "top",
        offset: [0, -4],
        className: "map-tooltip"
      });
      marker.on("click", () => onSelectRef.current(city.id));
      marker.addTo(layer);
      if (selected) marker.bringToFront();
    }
  }, [cities, mode, selectedId]);

  return <div ref={containerRef} className="italy-map" role="region" aria-label="Mappa dei capoluoghi; le stesse città sono disponibili nella classifica" />;
}
