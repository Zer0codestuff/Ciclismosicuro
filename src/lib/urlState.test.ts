import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Weights } from "../types";
import { cityMatchesQuery, decodeWeights, encodeWeights, readUrlState, resolveCityParam, searchKey, shareUrl, writeUrlState } from "./urlState";
import published from "../../public/data/ranking.json";
import { parseRankingPayload } from "./payload";

const weights: Weights = { safety: 40, infrastructure: 25, traffic: 20, usage: 15, transit: 0, environment: 0 };

beforeEach(() => window.history.replaceState(null, "", "/?campaign=source#classifica"));

describe("shareable dashboard state", () => {
  it("round-trips all six weights", () => {
    expect(decodeWeights(encodeWeights(weights), 60)).toEqual(weights);
  });

  it.each([null, "", "0-0-0-0-0-0", "0.1-0-0-0-0-0", "40--20-15-0-0", "40-25-20-15-0", "61-25-20-15-0-0", "NaN-25-20-15-0-0", "1e1-25-20-15-0-0", " 40-25-20-15-0-0", "-40-25-20-15-0-0"])("rejects malformed weights %s", (value) => {
    expect(decodeWeights(value, 60)).toBeNull();
  });

  it("resolves legacy accent-insensitive city names and searches regions", () => {
    const cities = parseRankingPayload(published).cities;
    expect(resolveCityParam(cities, "forli")?.name).toBe("Forlì");
    expect(resolveCityParam(cities, "unknown")).toBeNull();
    expect(cityMatchesQuery({ name: "Forlì", region: "Emilia-Romagna" }, " FORLI ")).toBe(true);
    expect(cityMatchesQuery({ name: "Aosta", region: "Valle d’Aosta" }, "d'aosta")).toBe(true);
    expect(searchKey(" L’Àquila ")).toBe("l'aquila");
  });

  it("preserves unrelated URL parameters and anchor while replacing weights", () => {
    writeUrlState({ city: "forli", weights: encodeWeights(weights) });
    expect(readUrlState()).toEqual({ city: "forli", weights: "40-25-20-15-0-0" });
    expect(new URLSearchParams(window.location.search).get("campaign")).toBe("source");
    expect(window.location.hash).toBe("#classifica");
    writeUrlState({ city: null, weights: null });
    expect(window.location.search).toBe("?campaign=source");
  });

  it("creates history entries for explicit city navigation only when state changes", () => {
    const push = vi.spyOn(window.history, "pushState");
    writeUrlState({ city: "forli", weights: null }, "push");
    writeUrlState({ city: "forli", weights: null }, "push");
    expect(push).toHaveBeenCalledTimes(1);
    push.mockRestore();
  });

  it("copies a canonical URL with requested city and weights", () => {
    const url = new URL(shareUrl("forli", encodeWeights(weights)));
    expect(url.searchParams.get("campaign")).toBeNull();
    expect(url.searchParams.get("city")).toBe("forli");
    expect(url.hash).toBe("#citta");
    expect(new URL(shareUrl(null, null)).hash).toBe("");
  });
});
