import { describe, expect, it } from "vitest";
import {
  buildCityMapOverpassQuery,
  cityNameVariants,
  CITY_MAP_LAYER_META,
  escapeOverpassString,
  parseCityMapOverpassResponse,
  type OverpassResponse
} from "./cityMapData";

describe("cityNameVariants", () => {
  it("includes straight and typographic apostrophe forms", () => {
    const variants = cityNameVariants("L'Aquila");
    expect(variants).toContain("L'Aquila");
    expect(variants).toContain("L\u2019Aquila");
  });

  it("adds apostrophe-less variant for L-prefixed names", () => {
    const variants = cityNameVariants("L'Aquila");
    expect(variants).toContain("LAquila");
  });

  it("deduplicates identical variants", () => {
    const variants = cityNameVariants("Milano");
    expect(new Set(variants).size).toBe(variants.length);
    expect(variants).toEqual(["Milano"]);
  });

  it("adds known OSM aliases without fuzzy matching", () => {
    expect(cityNameVariants("Reggio Emilia")).toContain("Reggio nell'Emilia");
    expect(cityNameVariants("Roma")).toContain("Roma Capitale");
    expect(cityNameVariants("Bolzano")).toContain("Bolzano - Bozen");
    expect(cityNameVariants("Reggio Calabria")).not.toContain("Reggio nell'Emilia");
  });
});

describe("escapeOverpassString", () => {
  it("escapes quotes and backslashes", () => {
    expect(escapeOverpassString('Say "hello"')).toBe('Say \\"hello\\"');
    expect(escapeOverpassString("path\\to")).toBe("path\\\\to");
  });
});

describe("buildCityMapOverpassQuery", () => {
  it("includes admin boundary lookup and bike-relevant layers", () => {
    const query = buildCityMapOverpassQuery("Milano");
    expect(query).toContain('relation["boundary"="administrative"]["admin_level"="8"]["name"="Milano"]');
    expect(query).toContain('relation["boundary"="administrative"]["admin_level"="8"]["name:it"="Milano"]');
    expect(query).toContain('way["highway"="cycleway"](area.cityArea);');
    expect(query).toContain('way["cycleway:right"~"^(lane|opposite_lane|opposite_track|track)$"](area.cityArea);');
    expect(query).toContain('way["bicycle"="designated"]["highway"~"^(footway|path)$"](area.cityArea);');
    expect(query).toContain('relation["route"="bicycle"](area.cityArea);');
    expect(query).toContain('node["amenity"="bicycle_parking"](area.cityArea);');
    expect(query).toContain('node["amenity"="drinking_water"](area.cityArea);');
    expect(query).toContain("out body geom;");
  });

  it("does not query broad cycleway or bicycle-designated road tags as cycle lanes", () => {
    const query = buildCityMapOverpassQuery("Milano");
    expect(query).not.toContain('way["cycleway"](area.cityArea);');
    expect(query).not.toContain("shared_lane");
    expect(query).not.toContain('way["bicycle"="designated"]["highway"~"^(path|footway|track|service');
    expect(query).not.toContain("residential");
  });

  it("uses separate relation statements for OR matching instead of AND tag chains", () => {
    const query = buildCityMapOverpassQuery("Milano");
    expect(query).not.toMatch(/\["name"="[^"]+"\]\["name:it"=/);
    const nameMatches = query.match(
      /relation\["boundary"="administrative"\]\["admin_level"="8"\]\["name"="Milano"\]/g
    );
    const nameItMatches = query.match(
      /relation\["boundary"="administrative"\]\["admin_level"="8"\]\["name:it"="Milano"\]/g
    );
    expect(nameMatches?.length).toBe(1);
    expect(nameItMatches?.length).toBe(1);
  });

  it("matches typographic apostrophe names for L'Aquila", () => {
    const query = buildCityMapOverpassQuery("L'Aquila");
    expect(query).toContain('["name"="L\'Aquila"]');
    expect(query).toContain('["name:it"="L\u2019Aquila"]');
    expect(query).toContain('["name"="LAquila"]');
  });

  it("includes OSM alias names as separate boundary relation statements", () => {
    const reggioQuery = buildCityMapOverpassQuery("Reggio Emilia");
    expect(reggioQuery).toContain('["name"="Reggio Emilia"]');
    expect(reggioQuery).toContain('["name"="Reggio nell\'Emilia"]');
    expect(reggioQuery).not.toContain('["name"="Reggio Calabria"]');

    const romaQuery = buildCityMapOverpassQuery("Roma");
    expect(romaQuery).toContain('["name"="Roma Capitale"]');

    const bolzanoQuery = buildCityMapOverpassQuery("Bolzano");
    expect(bolzanoQuery).toContain('["name"="Bolzano - Bozen"]');
  });

  it("queries explicit ZTL tags only", () => {
    const query = buildCityMapOverpassQuery("Milano");
    expect(query).toContain('relation["boundary"="limited_traffic_zone"](area.cityArea);');
    expect(query).toContain('relation["boundary"="low_emission_zone"](area.cityArea);');
    expect(query).toContain('relation["zone:traffic"="ZTL"](area.cityArea);');
    expect(query).toContain('relation["zone:traffic"~"^(ZTL|limited_traffic|limited traffic)$",i]');
    expect(query).not.toContain("motor_vehicle");
    expect(query).not.toContain('access"="private"');
  });
});

describe("CITY_MAP_LAYER_META", () => {
  it("defines unique layer ids with labels and colors", () => {
    const ids = CITY_MAP_LAYER_META.map((layer) => layer.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const layer of CITY_MAP_LAYER_META) {
      expect(layer.label.length).toBeGreaterThan(0);
      expect(layer.color.startsWith("#")).toBe(true);
    }
  });
});

describe("parseCityMapOverpassResponse", () => {
  it("groups elements into layers and computes bounds from boundary", () => {
    const response: OverpassResponse = {
      elements: [
        {
          type: "relation",
          id: 1,
          tags: {
            boundary: "administrative",
            admin_level: "8",
            name: "Milano"
          },
          geometry: [
            { lat: 45.4, lon: 9.1 },
            { lat: 45.5, lon: 9.2 },
            { lat: 45.45, lon: 9.15 }
          ]
        },
        {
          type: "way",
          id: 2,
          tags: { highway: "cycleway", name: "Ciclabile Test" },
          geometry: [
            { lat: 45.42, lon: 9.12 },
            { lat: 45.43, lon: 9.13 }
          ]
        },
        {
          type: "node",
          id: 3,
          tags: { amenity: "bicycle_parking" },
          lat: 45.44,
          lon: 9.14
        }
      ]
    };

    const parsed = parseCityMapOverpassResponse("Milano", response);
    expect(parsed.matchedName).toBe("Milano");
    expect(parsed.layers.boundary.available).toBe(true);
    expect(parsed.layers.cycleLanes.count).toBe(1);
    expect(parsed.layers.bikeParking.count).toBe(1);
    expect(parsed.layers.ztl.available).toBe(false);
    expect(parsed.bounds.south).toBeCloseTo(45.4);
    expect(parsed.bounds.north).toBeCloseTo(45.5);
  });

  it("classifies explicit ZTL tags and ignores private access roads", () => {
    const response: OverpassResponse = {
      elements: [
        {
          type: "relation",
          id: 1,
          tags: {
            boundary: "administrative",
            admin_level: "8",
            name: "Milano"
          },
          geometry: [
            { lat: 45.4, lon: 9.1 },
            { lat: 45.5, lon: 9.2 },
            { lat: 45.45, lon: 9.15 }
          ]
        },
        {
          type: "way",
          id: 2,
          tags: { boundary: "limited_traffic_zone", name: "ZTL centro" },
          geometry: [
            { lat: 45.42, lon: 9.12 },
            { lat: 45.43, lon: 9.13 },
            { lat: 45.44, lon: 9.14 }
          ]
        },
        {
          type: "way",
          id: 3,
          tags: { motor_vehicle: "private", access: "private", highway: "residential" },
          geometry: [
            { lat: 45.41, lon: 9.11 },
            { lat: 45.42, lon: 9.12 }
          ]
        }
      ]
    };

    const parsed = parseCityMapOverpassResponse("Milano", response);
    expect(parsed.layers.ztl.count).toBe(1);
    expect(parsed.layers.ztl.features[0]?.label).toBe("ZTL centro");
  });

  it("keeps only explicit cycle infrastructure in the cycle lanes layer", () => {
    const response: OverpassResponse = {
      elements: [
        {
          type: "relation",
          id: 1,
          tags: {
            boundary: "administrative",
            admin_level: "8",
            name: "Milano"
          },
          geometry: [
            { lat: 45.4, lon: 9.1 },
            { lat: 45.5, lon: 9.2 },
            { lat: 45.45, lon: 9.15 }
          ]
        },
        {
          type: "way",
          id: 2,
          tags: { highway: "residential", cycleway: "no", name: "No ciclabile" },
          geometry: [
            { lat: 45.41, lon: 9.11 },
            { lat: 45.42, lon: 9.12 }
          ]
        },
        {
          type: "way",
          id: 3,
          tags: { highway: "residential", cycleway: "shared_lane", name: "Corsia condivisa" },
          geometry: [
            { lat: 45.42, lon: 9.12 },
            { lat: 45.43, lon: 9.13 }
          ]
        },
        {
          type: "way",
          id: 4,
          tags: { highway: "residential", bicycle: "designated", name: "Strada consentita alle bici" },
          geometry: [
            { lat: 45.43, lon: 9.13 },
            { lat: 45.44, lon: 9.14 }
          ]
        },
        {
          type: "way",
          id: 5,
          tags: { highway: "secondary", "cycleway:right": "lane", name: "Corsia ciclabile" },
          geometry: [
            { lat: 45.44, lon: 9.14 },
            { lat: 45.45, lon: 9.15 }
          ]
        },
        {
          type: "way",
          id: 6,
          tags: { highway: "path", bicycle: "designated", name: "Ciclopedonale" },
          geometry: [
            { lat: 45.45, lon: 9.15 },
            { lat: 45.46, lon: 9.16 }
          ]
        }
      ]
    };

    const parsed = parseCityMapOverpassResponse("Milano", response);
    expect(parsed.layers.cycleLanes.features.map((feature) => feature.label)).toEqual([
      "Corsia ciclabile",
      "Ciclopedonale"
    ]);
  });

  it("throws when no geometry is available", () => {
    expect(() => parseCityMapOverpassResponse("Unknown", { elements: [] })).toThrow(
      /Nessun confine comunale/
    );
  });
});
