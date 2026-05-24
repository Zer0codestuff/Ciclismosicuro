import { describe, expect, it } from "vitest";
import {
  buildCityShareUrl,
  canonicalCityKey,
  cityMatchesQuery,
  resolveCityFromParam,
  resolveExactCityFromQuery
} from "./cityKeys";

describe("canonicalCityKey", () => {
  it("normalizes typographic apostrophe and whitespace", () => {
    expect(canonicalCityKey("L\u2019Aquila")).toBe(canonicalCityKey("L'Aquila"));
    expect(canonicalCityKey("  Reggio   Emilia  ")).toBe("Reggio Emilia");
  });
});

describe("cityMatchesQuery", () => {
  it("matches city names when the query omits accents or casing", () => {
    expect(cityMatchesQuery("Forlì", "forli")).toBe(true);
    expect(cityMatchesQuery("Forlì", "FORLI")).toBe(true);
    expect(cityMatchesQuery("Forlì", "  forlì  ")).toBe(true);
  });

  it("keeps case-insensitive substring search for ASCII names", () => {
    expect(cityMatchesQuery("Alpha", "alp")).toBe(true);
    expect(cityMatchesQuery("Alpha", "ALPHA")).toBe(true);
  });

  it("treats an empty query as matching every city", () => {
    expect(cityMatchesQuery("Forlì", "")).toBe(true);
    expect(cityMatchesQuery("Forlì", "   ")).toBe(true);
  });

  it("does not match unrelated cities", () => {
    expect(cityMatchesQuery("Alpha", "forli")).toBe(false);
    expect(cityMatchesQuery("Bologna", "forli")).toBe(false);
  });
});

describe("resolveExactCityFromQuery", () => {
  const cities = [{ city: "Forlì" }, { city: "Foggia" }, { city: "Alpha" }];

  it("returns the display name for an accent-insensitive exact match", () => {
    expect(resolveExactCityFromQuery(cities, "forli")).toBe("Forlì");
    expect(resolveExactCityFromQuery(cities, "FORLÌ")).toBe("Forlì");
    expect(resolveExactCityFromQuery(cities, "  Alpha  ")).toBe("Alpha");
  });

  it("returns null for partial queries and empty input", () => {
    expect(resolveExactCityFromQuery(cities, "for")).toBeNull();
    expect(resolveExactCityFromQuery(cities, "")).toBeNull();
    expect(resolveExactCityFromQuery(cities, "   ")).toBeNull();
  });

  it("returns null when no city matches", () => {
    expect(resolveExactCityFromQuery(cities, "zzz")).toBeNull();
  });
});

describe("resolveCityFromParam", () => {
  const cities = [{ city: "Alpha" }, { city: "Beta" }, { city: "L'Aquila" }];

  it("matches display names and apostrophe variants", () => {
    expect(resolveCityFromParam(cities, "Beta").city).toBe("Beta");
    expect(resolveCityFromParam(cities, "L\u2019Aquila").city).toBe("L'Aquila");
  });

  it("returns null city for unknown params with requested label preserved", () => {
    const result = resolveCityFromParam(cities, "Gamma");
    expect(result.city).toBeNull();
    expect(result.requestedLabel).toBe("Gamma");
  });

  it("treats empty param as no deep link", () => {
    expect(resolveCityFromParam(cities, "  ")).toEqual({ city: null, requestedLabel: null });
  });
});

describe("buildCityShareUrl", () => {
  it("sets the city query param on the current page URL", () => {
    expect(buildCityShareUrl("Beta", "https://example.org/app/?city=Alpha&foo=1")).toBe(
      "https://example.org/app/?city=Beta&foo=1"
    );
  });

  it("adds the city param when none is present", () => {
    expect(buildCityShareUrl("L'Aquila", "https://example.org/ciclismo/")).toBe(
      "https://example.org/ciclismo/?city=L%27Aquila"
    );
  });
});
