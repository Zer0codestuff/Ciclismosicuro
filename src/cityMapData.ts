export const OVERPASS_API_URL = "https://overpass.private.coffee/api/interpreter";
const OVERPASS_API_FALLBACK_URL = "https://overpass-api.de/api/interpreter";
const OVERPASS_REQUEST_URLS = import.meta.env.DEV
  ? ["/api/overpass", OVERPASS_API_URL, OVERPASS_API_FALLBACK_URL]
  : [OVERPASS_API_URL, OVERPASS_API_FALLBACK_URL];
export const OVERPASS_FETCH_TIMEOUT_MS = 45_000;

export type CityMapLayerId =
  | "boundary"
  | "cycleLanes"
  | "bikeRoutes"
  | "ztl"
  | "pedestrian"
  | "bikeParking"
  | "bikeSharing"
  | "drinkingWater";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface CityMapFeature {
  id: string;
  layerId: CityMapLayerId;
  geometryType: "point" | "line" | "polygon";
  coordinates: LatLng[] | LatLng[][];
  label?: string;
}

export interface CityMapLayerMeta {
  id: Exclude<CityMapLayerId, "boundary">;
  label: string;
  description: string;
  color: string;
  geometryType: "point" | "line" | "polygon";
  defaultVisible: boolean;
}

export interface CityMapLayerResult {
  id: CityMapLayerId;
  label: string;
  count: number;
  features: CityMapFeature[];
  available: boolean;
}

export interface CityMapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface CityMapData {
  cityName: string;
  matchedName?: string;
  boundary: LatLng[];
  bounds: CityMapBounds;
  layers: Record<CityMapLayerId, CityMapLayerResult>;
  fetchedAt: number;
}

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  geometry?: Array<{ lat: number; lon: number }>;
  members?: Array<{
    type: "node" | "way" | "relation";
    ref: number;
    role?: string;
    geometry?: Array<{ lat: number; lon: number }>;
  }>;
}

export interface OverpassResponse {
  elements: OverpassElement[];
}

const TYPOGRAPHIC_APOSTROPHE = "\u2019";
let jsonpRequestId = 0;

/** Known OSM admin names that differ from dataset labels (exact keys only). */
const CITY_NAME_ALIASES: Record<string, readonly string[]> = {
  "Reggio Emilia": ["Reggio nell'Emilia"],
  Roma: ["Roma Capitale"],
  Bolzano: ["Bolzano - Bozen"]
};

export const CITY_MAP_LAYER_META: CityMapLayerMeta[] = [
  {
    id: "cycleLanes",
    label: "Piste ciclabili",
    description: "highway=cycleway e tratti con tag cycleway",
    color: "#0f766e",
    geometryType: "line",
    defaultVisible: true
  },
  {
    id: "bikeRoutes",
    label: "Itinerari ciclabili",
    description: "relazioni route=bicycle e varianti percorribili in bici",
    color: "#2563eb",
    geometryType: "line",
    defaultVisible: true
  },
  {
    id: "ztl",
    label: "ZTL / traffico limitato",
    description: "zone a traffico limitato e low emission zone dove mappate",
    color: "#d97706",
    geometryType: "polygon",
    defaultVisible: false
  },
  {
    id: "pedestrian",
    label: "Aree pedonali",
    description: "highway=pedestrian e aree pedonali",
    color: "#7c3aed",
    geometryType: "polygon",
    defaultVisible: false
  },
  {
    id: "bikeParking",
    label: "Parcheggi bici",
    description: "amenity=bicycle_parking",
    color: "#15803d",
    geometryType: "point",
    defaultVisible: true
  },
  {
    id: "bikeSharing",
    label: "Sharing / noleggio bici",
    description: "amenity=bicycle_rental e bicycle_sharing",
    color: "#0891b2",
    geometryType: "point",
    defaultVisible: true
  },
  {
    id: "drinkingWater",
    label: "Acqua potabile",
    description: "amenity=drinking_water, water_point e man_made=water_tap",
    color: "#0369a1",
    geometryType: "point",
    defaultVisible: false
  }
];

const LAYER_LABELS: Record<CityMapLayerId, string> = {
  boundary: "Confine comunale",
  cycleLanes: "Piste ciclabili",
  bikeRoutes: "Itinerari ciclabili",
  ztl: "ZTL / traffico limitato",
  pedestrian: "Aree pedonali",
  bikeParking: "Parcheggi bici",
  bikeSharing: "Sharing / noleggio bici",
  drinkingWater: "Acqua potabile"
};

const cache = new Map<string, CityMapData>();

function addApostropheVariants(variants: Set<string>, name: string): void {
  variants.add(name);

  const straight = name.replace(new RegExp(TYPOGRAPHIC_APOSTROPHE, "g"), "'");
  const typographic = name.replace(/'/g, TYPOGRAPHIC_APOSTROPHE);
  variants.add(straight);
  variants.add(typographic);

  if (straight.startsWith("L'")) {
    variants.add(`L${straight.slice(2)}`);
  }
  if (typographic.startsWith(`L${TYPOGRAPHIC_APOSTROPHE}`)) {
    variants.add(`L${typographic.slice(2)}`);
  }
}

/** Normalize apostrophes and return unique name variants for Overpass matching. */
export function cityNameVariants(cityName: string): string[] {
  const trimmed = cityName.trim();
  const variants = new Set<string>();
  addApostropheVariants(variants, trimmed);

  for (const alias of CITY_NAME_ALIASES[trimmed] ?? []) {
    addApostropheVariants(variants, alias);
  }

  return [...variants].filter(Boolean);
}

/** Escape a literal string for Overpass QL double-quoted values. */
export function escapeOverpassString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function boundaryRelationStatements(variants: string[]): string {
  const statements: string[] = [];
  for (const variant of variants) {
    const escaped = escapeOverpassString(variant);
    statements.push(
      `  relation["boundary"="administrative"]["admin_level"="8"]["name"="${escaped}"](area.italy);`
    );
    statements.push(
      `  relation["boundary"="administrative"]["admin_level"="8"]["name:it"="${escaped}"](area.italy);`
    );
  }
  return statements.join("\n");
}

/** Build the Overpass QL query for a named Italian comune (admin_level=8). */
export function buildCityMapOverpassQuery(cityName: string): string {
  const variants = cityNameVariants(cityName);
  const boundaryStatements = boundaryRelationStatements(variants);

  return `[out:json][timeout:45];
area["ISO3166-1"="IT"]["admin_level"="2"]->.italy;
(
${boundaryStatements}
)->.cityBoundary;
.cityBoundary map_to_area->.cityArea;
(
  way["highway"="cycleway"](area.cityArea);
  way["cycleway"](area.cityArea);
  way["bicycle"="designated"]["highway"~"^(path|footway|track|service|unclassified|tertiary|secondary|primary|residential)$"](area.cityArea);
)->.cycleLanes;
(
  relation["route"="bicycle"](area.cityArea);
  relation["type"="route"]["route"~"^(bicycle|mtb)$"](area.cityArea);
)->.bikeRoutes;
(
  relation["boundary"="limited_traffic_zone"](area.cityArea);
  way["boundary"="limited_traffic_zone"](area.cityArea);
  relation["boundary"="low_emission_zone"](area.cityArea);
  way["boundary"="low_emission_zone"](area.cityArea);
  relation["zone:traffic"="ZTL"](area.cityArea);
  way["zone:traffic"="ZTL"](area.cityArea);
  relation["zone:traffic"~"^(ZTL|limited_traffic|limited traffic)$",i](area.cityArea);
  way["zone:traffic"~"^(ZTL|limited_traffic|limited traffic)$",i](area.cityArea);
)->.ztl;
(
  way["highway"="pedestrian"](area.cityArea);
  way["highway"="pedestrian_area"](area.cityArea);
  relation["highway"="pedestrian"](area.cityArea);
)->.pedestrian;
(
  node["amenity"="bicycle_parking"](area.cityArea);
  way["amenity"="bicycle_parking"](area.cityArea);
)->.bikeParking;
(
  node["amenity"="bicycle_rental"](area.cityArea);
  node["amenity"="bicycle_sharing"](area.cityArea);
)->.bikeSharing;
(
  node["amenity"="drinking_water"](area.cityArea);
  node["amenity"="water_point"](area.cityArea);
  node["man_made"="water_tap"](area.cityArea);
)->.drinkingWater;
(
  .cityBoundary;
  .cycleLanes;
  .bikeRoutes;
  .ztl;
  .pedestrian;
  .bikeParking;
  .bikeSharing;
  .drinkingWater;
);
out body geom;`;
}

function featureLabel(tags: Record<string, string> | undefined): string | undefined {
  if (!tags) return undefined;
  return tags.name ?? tags["name:it"] ?? tags.ref ?? tags.operator ?? tags.network;
}

function geometryFromElement(element: OverpassElement): LatLng[] | LatLng[][] | null {
  if (element.type === "node" && typeof element.lat === "number" && typeof element.lon === "number") {
    return [{ lat: element.lat, lng: element.lon }];
  }

  if (element.geometry?.length) {
    const ring = element.geometry.map((point) => ({ lat: point.lat, lng: point.lon }));
    if (element.type === "relation") {
      return [ring];
    }
    return ring;
  }

  if (element.type === "relation" && element.members?.length) {
    const rings: LatLng[][] = [];
    for (const member of element.members) {
      if (!member.geometry?.length) continue;
      rings.push(member.geometry.map((point) => ({ lat: point.lat, lng: point.lon })));
    }
    return rings.length ? rings : null;
  }

  return null;
}

function classifyElement(element: OverpassElement): CityMapLayerId | null {
  const tags = element.tags ?? {};

  if (element.type === "relation" && tags.boundary === "administrative" && tags.admin_level === "8") {
    return "boundary";
  }

  if (
    tags.highway === "cycleway" ||
    tags.cycleway ||
    (tags.bicycle === "designated" && tags.highway)
  ) {
    return "cycleLanes";
  }

  if (tags.route === "bicycle" || (tags.type === "route" && /^(bicycle|mtb)$/.test(tags.route ?? ""))) {
    return "bikeRoutes";
  }

  if (
    tags.boundary === "limited_traffic_zone" ||
    tags.boundary === "low_emission_zone" ||
    tags["zone:traffic"] === "ZTL" ||
    /^(ZTL|limited_traffic|limited traffic)$/i.test(tags["zone:traffic"] ?? "")
  ) {
    return "ztl";
  }

  if (tags.highway === "pedestrian" || tags.highway === "pedestrian_area") {
    return "pedestrian";
  }

  if (tags.amenity === "bicycle_parking") {
    return "bikeParking";
  }

  if (tags.amenity === "bicycle_rental" || tags.amenity === "bicycle_sharing") {
    return "bikeSharing";
  }

  if (tags.amenity === "drinking_water" || tags.amenity === "water_point" || tags.man_made === "water_tap") {
    return "drinkingWater";
  }

  return null;
}

function geometryTypeForLayer(layerId: CityMapLayerId, coordinates: LatLng[] | LatLng[][]): CityMapFeature["geometryType"] {
  if (layerId === "boundary" || layerId === "ztl" || layerId === "pedestrian") {
    return "polygon";
  }
  if (Array.isArray(coordinates[0])) {
    const firstRing = coordinates[0] as LatLng[];
    return firstRing.length === 1 ? "point" : firstRing.length >= 2 ? "line" : "polygon";
  }
  const points = coordinates as LatLng[];
  if (points.length === 1) return "point";
  return "line";
}

function flattenCoordinates(coordinates: LatLng[] | LatLng[][]): LatLng[] {
  if (!coordinates.length) return [];
  if (Array.isArray(coordinates[0])) {
    return (coordinates as LatLng[][]).flat();
  }
  return coordinates as LatLng[];
}

function computeBounds(allPoints: LatLng[]): CityMapBounds | null {
  if (!allPoints.length) return null;
  let south = allPoints[0].lat;
  let north = allPoints[0].lat;
  let west = allPoints[0].lng;
  let east = allPoints[0].lng;

  for (const point of allPoints) {
    south = Math.min(south, point.lat);
    north = Math.max(north, point.lat);
    west = Math.min(west, point.lng);
    east = Math.max(east, point.lng);
  }

  return { south, west, north, east };
}

/** Parse an Overpass JSON payload into structured city map layers. */
export function parseCityMapOverpassResponse(cityName: string, response: OverpassResponse): CityMapData {
  const layerBuckets: Record<CityMapLayerId, CityMapFeature[]> = {
    boundary: [],
    cycleLanes: [],
    bikeRoutes: [],
    ztl: [],
    pedestrian: [],
    bikeParking: [],
    bikeSharing: [],
    drinkingWater: []
  };

  let matchedName: string | undefined;

  for (const element of response.elements) {
    const layerId = classifyElement(element);
    if (!layerId) continue;

    const coordinates = geometryFromElement(element);
    if (!coordinates) continue;

    if (layerId === "boundary" && element.tags) {
      matchedName = element.tags.name ?? element.tags["name:it"] ?? matchedName;
    }

    const geometryType = geometryTypeForLayer(layerId, coordinates);
    layerBuckets[layerId].push({
      id: `${element.type}/${element.id}`,
      layerId,
      geometryType,
      coordinates,
      label: featureLabel(element.tags)
    });
  }

  const boundaryFeatures = layerBuckets.boundary;
  const boundaryRing =
    boundaryFeatures.find((feature) => feature.geometryType === "polygon")?.coordinates ??
    boundaryFeatures[0]?.coordinates ??
    [];
  const boundaryPoints = flattenCoordinates(boundaryRing as LatLng[] | LatLng[][]);

  const allPoints = (Object.values(layerBuckets) as CityMapFeature[][]).flat().flatMap((feature) =>
    flattenCoordinates(feature.coordinates)
  );
  const bounds = computeBounds(boundaryPoints.length ? boundaryPoints : allPoints);

  if (!bounds) {
    throw new Error(`Nessun confine comunale trovato su OpenStreetMap per ${cityName}.`);
  }

  const layers = Object.keys(layerBuckets).reduce(
    (accumulator, key) => {
      const id = key as CityMapLayerId;
      const features = layerBuckets[id];
      accumulator[id] = {
        id,
        label: LAYER_LABELS[id],
        count: features.length,
        features,
        available: features.length > 0
      };
      return accumulator;
    },
    {} as Record<CityMapLayerId, CityMapLayerResult>
  );

  return {
    cityName,
    matchedName,
    boundary: boundaryPoints,
    bounds,
    layers,
    fetchedAt: Date.now()
  };
}

export function getCachedCityMapData(cityName: string): CityMapData | undefined {
  return cache.get(cityName.trim());
}

export function clearCityMapCache(cityName?: string): void {
  if (cityName) {
    cache.delete(cityName.trim());
    return;
  }
  cache.clear();
}

function fetchOverpassJsonp(
  endpoint: string,
  query: string,
  signal: AbortSignal
): Promise<OverpassResponse> {
  return new Promise((resolve, reject) => {
    const callbackName = `__ciclismoOverpass${Date.now()}_${jsonpRequestId}`;
    jsonpRequestId += 1;

    const callbacks = window as unknown as Window &
      Record<string, ((payload: OverpassResponse) => void) | undefined>;
    const script = document.createElement("script");

    function cleanup() {
      delete callbacks[callbackName];
      script.remove();
      signal.removeEventListener("abort", onAbort);
    }

    function onAbort() {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    }

    callbacks[callbackName] = (payload: OverpassResponse) => {
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Overpass JSONP non disponibile."));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    script.src = `${endpoint}?data=${encodeURIComponent(query)}&jsonp=${encodeURIComponent(callbackName)}`;
    document.head.appendChild(script);
  });
}

export async function fetchCityMapData(
  cityName: string,
  options?: { signal?: AbortSignal; force?: boolean }
): Promise<CityMapData> {
  const key = cityName.trim();
  if (!key) {
    throw new Error("Nome città mancante.");
  }

  if (options?.force) {
    cache.delete(key);
  } else {
    const cached = cache.get(key);
    if (cached) return cached;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), OVERPASS_FETCH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options?.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const query = buildCityMapOverpassQuery(key);
    let lastError: Error | null = null;

    for (const endpoint of OVERPASS_REQUEST_URLS) {
      try {
        let payload: OverpassResponse;

        try {
          const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
            method: "GET",
            signal: controller.signal
          });

          if (!response.ok) {
            throw new Error(`Overpass API HTTP ${response.status}`);
          }

          payload = (await response.json()) as OverpassResponse;
        } catch (fetchError) {
          if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
            throw fetchError;
          }
          payload = await fetchOverpassJsonp(endpoint, query, controller.signal);
        }

        if (!payload.elements?.length) {
          throw new Error(`Nessun dato Overpass restituito per ${key}.`);
        }

        const parsed = parseCityMapOverpassResponse(key, payload);
        cache.set(key, parsed);
        return parsed;
      } catch (endpointError) {
        if (endpointError instanceof DOMException && endpointError.name === "AbortError") {
          throw endpointError;
        }
        lastError = endpointError instanceof Error ? endpointError : new Error(String(endpointError));
      }
    }

    throw lastError ?? new Error("Nessun endpoint Overpass disponibile.");
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Richiesta mappa annullata o scaduta. Riprova.");
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Errore imprevisto durante il caricamento della mappa.");
  } finally {
    window.clearTimeout(timeoutId);
    options?.signal?.removeEventListener("abort", onAbort);
  }
}

export function openStreetMapSearchUrl(cityName: string): string {
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(cityName)}`;
}
