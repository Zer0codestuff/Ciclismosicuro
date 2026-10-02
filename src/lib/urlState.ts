import type { City, Weights } from "../types";
import { PILLAR_ORDER } from "./scoring";

const COMBINING_MARKS = /\p{M}/gu;

export function searchKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/[’']/g, "'")
    .toLocaleLowerCase("it")
    .trim();
}

export function cityMatchesQuery(city: Pick<City, "name" | "region">, query: string): boolean {
  const needle = searchKey(query);
  if (!needle) return true;
  return searchKey(city.name).includes(needle) || searchKey(city.region).includes(needle);
}

/** Resolve `?city=` by id, or by (accent-insensitive) name for links made before ids existed. */
export function resolveCityParam(cities: City[], param: string | null): City | null {
  if (!param) return null;
  const key = searchKey(param);
  return cities.find((city) => city.id === param) ?? cities.find((city) => searchKey(city.name) === key) ?? null;
}

export function encodeWeights(weights: Weights): string {
  return PILLAR_ORDER.map((pillar) => weights[pillar] ?? 0).join("-");
}

export function decodeWeights(value: string | null, max: number): Weights | null {
  if (!value) return null;
  const tokens = value.split("-");
  if (tokens.some((token) => !/^\d+$/.test(token))) return null;
  const parts = tokens.map(Number);
  if (parts.length !== PILLAR_ORDER.length || parts.some((part) => !Number.isFinite(part) || part < 0 || part > max)) {
    return null;
  }
  if (parts.every((part) => part === 0)) return null;
  return Object.fromEntries(PILLAR_ORDER.map((pillar, index) => [pillar, parts[index]])) as Weights;
}

export function readUrlState(): { city: string | null; weights: string | null } {
  const params = new URLSearchParams(window.location.search);
  return { city: params.get("city"), weights: params.get("pesi") };
}

export function writeUrlState(
  { city, weights }: { city: string | null; weights: string | null },
  mode: "replace" | "push" = "replace"
): void {
  const url = new URL(window.location.href);
  if (city) url.searchParams.set("city", city);
  else url.searchParams.delete("city");
  if (weights) url.searchParams.set("pesi", weights);
  else url.searchParams.delete("pesi");
  if (url.href === window.location.href) return;
  if (mode === "push") window.history.pushState(window.history.state, "", url);
  else window.history.replaceState(window.history.state, "", url);
}

export function shareUrl(city: string | null, weights: string | null): string {
  const url = new URL(window.location.href);
  url.hash = city ? "citta" : "";
  url.search = "";
  if (city) url.searchParams.set("city", city);
  if (weights) url.searchParams.set("pesi", weights);
  return url.toString();
}
