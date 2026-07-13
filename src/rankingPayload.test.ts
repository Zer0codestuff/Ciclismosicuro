import { describe, expect, it } from "vitest";
import { minimalRankingPayload } from "./fixtures/minimal-ranking";
import { parseRankingPayload } from "./rankingPayload";

describe("parseRankingPayload", () => {
  it("accepts a valid ranking payload", () => {
    expect(parseRankingPayload(minimalRankingPayload)).toBe(minimalRankingPayload);
  });

  it("rejects an empty city list", () => {
    expect(() => parseRankingPayload({ ...minimalRankingPayload, cities: [] })).toThrow(
      /elenco città vuoto/i
    );
  });

  it("rejects a city with malformed scoring records", () => {
    const malformed = {
      ...minimalRankingPayload,
      cities: [{ ...minimalRankingPayload.cities[0], categoryScores: null }]
    };
    expect(() => parseRankingPayload(malformed)).toThrow(/dati città non validi/i);
  });

  it("rejects non-finite default weights", () => {
    const malformed = {
      ...minimalRankingPayload,
      defaultWeights: { ...minimalRankingPayload.defaultWeights, safety: Number.NaN }
    };
    expect(() => parseRankingPayload(malformed)).toThrow(/pesi predefiniti non validi/i);
  });

  it("rejects all-zero default weights", () => {
    const malformed = {
      ...minimalRankingPayload,
      defaultWeights: Object.fromEntries(
        Object.keys(minimalRankingPayload.defaultWeights).map((key) => [key, 0])
      )
    };
    expect(() => parseRankingPayload(malformed)).toThrow(/pesi predefiniti non validi/i);
  });

  it("rejects malformed national context before rendering", () => {
    const malformed = {
      ...minimalRankingPayload,
      nationalContext: { ...minimalRankingPayload.nationalContext, sections: null }
    };
    expect(() => parseRankingPayload(malformed)).toThrow(/contesto nazionale/i);
  });
});
