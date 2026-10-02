import { describe, expect, it } from "vitest";
import published from "../../public/data/ranking.json";
import type { City, PillarId, Weights } from "../types";
import { compositeScore, PILLAR_ORDER, rankCities, totalWeight, weightShares } from "./scoring";
import { parseRankingPayload } from "./payload";

const only = (pillar: PillarId, weight = 40): Weights => Object.fromEntries(PILLAR_ORDER.map((id) => [id, id === pillar ? weight : 0])) as Weights;
const scores = (values: Partial<Record<PillarId, number | null>>) => ({ safety: null, infrastructure: null, traffic: null, usage: null, transit: null, environment: null, ...values });

describe("weighted ranking", () => {
  it("renormalizes over available weighted pillars and preserves observed zero", () => {
    const weights = { ...only("safety", 40), infrastructure: 60 };
    expect(compositeScore(scores({ safety: 0 }), weights)).toBe(0);
    expect(compositeScore(scores({ safety: 20, infrastructure: 80 }), weights)).toBe(56);
    expect(compositeScore(scores({ safety: 20, infrastructure: null }), weights)).toBe(20);
  });

  it("does not fabricate scores or ranks when all selected data are absent", () => {
    const payload = parseRankingPayload(published);
    const missing = { ...payload.cities[0], id: "missing", name: "Assente", pillarScores: scores({ environment: null }) };
    const observedZero = { ...payload.cities[0], id: "zero", name: "Zero", pillarScores: scores({ environment: 0 }) };
    const ranking = rankCities([missing, observedZero], only("environment"));
    expect(ranking.map((city) => [city.id, city.liveScore, city.liveRank])).toEqual([["zero", 0, 1], ["missing", null, null]]);
    expect(rankCities([observedZero], only("environment", 0))[0]).toMatchObject({ liveScore: null, liveRank: null });
  });

  it("ignores invalid and negative weights instead of returning NaN", () => {
    const weights = { ...only("safety", 10), infrastructure: Number.NaN, traffic: Infinity, usage: -20 };
    expect(compositeScore(scores({ safety: 30, infrastructure: 80, traffic: 70, usage: 90 }), weights)).toBe(30);
    expect(totalWeight(weights)).toBe(10);
    expect(weightShares(weights)).toEqual(only("safety", 1));
  });

  it("matches every published default rank and score", () => {
    const payload = parseRankingPayload(published);
    const ranking = rankCities(payload.cities, payload.defaultWeights);
    for (const city of ranking) {
      expect(city.liveRank, city.name).toBe(city.rank);
      expect(city.liveScore, city.name).toBeCloseTo(city.score, 5);
    }
    const doubled = Object.fromEntries(PILLAR_ORDER.map((id) => [id, payload.defaultWeights[id] * 2])) as Weights;
    expect(rankCities(payload.cities, doubled).map((city) => city.liveRank)).toEqual(ranking.map((city) => city.liveRank));
  });

  it("orders equal custom scores deterministically without mutating cities", () => {
    const payload = parseRankingPayload(published);
    const cities: City[] = ["Zurigo", "Àquila"].map((name) => ({ ...payload.cities[0], name, id: name, pillarScores: scores({ safety: 50 }) }));
    expect(rankCities(cities, only("safety")).map((city) => city.name)).toEqual(["Àquila", "Zurigo"]);
    expect(cities.map((city) => city.name)).toEqual(["Zurigo", "Àquila"]);
  });
});
