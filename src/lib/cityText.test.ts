import { describe, expect, it } from "vitest";
import published from "../../public/data/ranking.json";
import type { RankedCity } from "../types";
import { citySummary, metricHighlights, riskSentence } from "./cityText";
import { parseRankingPayload } from "./payload";

const payload = parseRankingPayload(published);
const city: RankedCity = { ...payload.cities[0], liveRank: 1, liveScore: 80 };

describe("plain-language profile", () => {
  it("describes unavailable customized scores without inventing a position", () => {
    const summary = citySummary({ ...city, liveRank: null, liveScore: null }, payload.cityCount);
    expect(summary).toContain("non è classificabile");
    expect(summary).not.toContain("nullª");
  });

  it("ties the ratio interval to the historical exposure proxy", () => {
    const sentence = riskSentence(city);
    expect(sentence).toContain("2011");
    expect(sentence).toContain("condizionato alla proxy storica");
    expect(sentence).not.toContain("chiaramente");
  });

  it("excludes contextual zero-weight metrics from positive/negative highlights", () => {
    const metrics = payload.metrics.map((metric) => ({ ...metric, weight: metric.id === "cycleLanesPer10k" ? 1 : 0 }));
    const highlights = metricHighlights(city, metrics);
    expect(highlights.best.map((entry) => entry.metric.id)).toEqual(["cycleLanesPer10k"]);
    expect(highlights.worst.map((entry) => entry.metric.id)).toEqual(["cycleLanesPer10k"]);
  });
});
