const TYPOGRAPHIC_APOSTROPHE = "\u2019";

/** Stable lookup key for Italian city names (apostrophe + whitespace normalization). */
export function canonicalCityKey(name: string): string {
  return name
    .trim()
    .replace(new RegExp(TYPOGRAPHIC_APOSTROPHE, "g"), "'")
    .replace(/\s+/g, " ");
}

const COMBINING_MARKS = /\p{M}/gu;

/** Lowercase search key with apostrophe normalization and accents removed. */
export function accentInsensitiveCityKey(name: string): string {
  return canonicalCityKey(name)
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLocaleLowerCase("it");
}

/** Exact ranked-city match for search autocomplete (accent-insensitive). */
export function resolveExactCityFromQuery(
  cities: readonly { city: string }[],
  rawQuery: string
): string | null {
  const query = rawQuery.trim();
  if (query.length === 0) {
    return null;
  }

  const needle = accentInsensitiveCityKey(query);
  const matched = cities.filter((entry) => accentInsensitiveCityKey(entry.city) === needle);
  return matched.length === 1 ? matched[0].city : null;
}

/** Toolbar / filter substring match aligned with accent-insensitive deep-link resolution. */
export function cityMatchesQuery(cityName: string, rawQuery: string): boolean {
  const query = rawQuery.trim();
  if (query.length === 0) {
    return true;
  }
  const haystack = accentInsensitiveCityKey(cityName);
  const needle = accentInsensitiveCityKey(query);
  return haystack.includes(needle);
}

export type CityLinkResolution = {
  /** Canonical display name from the dataset, or null if no match. */
  city: string | null;
  /** Raw value from the URL when present. */
  requestedLabel: string | null;
};

/** Resolve `?city=` against ranked cities using canonical keys and Italian locale. */
export function resolveCityFromParam(
  cities: readonly { city: string }[],
  param: string | null | undefined
): CityLinkResolution {
  const raw = param?.trim();
  if (!raw) {
    return { city: null, requestedLabel: null };
  }

  const requestedLabel = raw;
  const key = canonicalCityKey(requestedLabel);
  const byKey = cities.find((entry) => canonicalCityKey(entry.city) === key);
  if (byKey) {
    return { city: byKey.city, requestedLabel };
  }

  const byLocale = cities.find(
    (entry) => entry.city.localeCompare(requestedLabel, "it", { sensitivity: "accent" }) === 0
  );
  if (byLocale) {
    return { city: byLocale.city, requestedLabel };
  }

  return { city: null, requestedLabel };
}

export function readCitySearchParam(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("city");
}

export function syncCitySearchParam(cityName: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  const current = url.searchParams.get("city");
  if (current === cityName) {
    return;
  }
  url.searchParams.set("city", cityName);
  window.history.replaceState(null, "", url);
}

/** Full shareable URL for a city deep link (`?city=` on the current page). */
export function buildCityShareUrl(cityName: string, baseHref?: string): string {
  const href =
    baseHref ?? (typeof window !== "undefined" ? window.location.href : "http://localhost/");
  const url = new URL(href);
  url.searchParams.set("city", cityName);
  return url.toString();
}

export type ClipboardCopyResult = "clipboard" | "legacy" | "failed";

/** Copy text via Clipboard API with a legacy `execCommand` fallback. */
export async function copyTextToClipboard(text: string): Promise<ClipboardCopyResult> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return "clipboard";
    } catch {
      // fall through to legacy copy
    }
  }

  if (typeof document === "undefined") {
    return "failed";
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok ? "legacy" : "failed";
  } catch {
    return "failed";
  }
}
