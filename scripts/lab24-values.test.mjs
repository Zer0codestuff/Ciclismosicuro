import { describe, expect, it } from "vitest";
import {
  assertLab24Indicator,
  publishedMetricValue,
  publishedSourceRank
} from "./lab24-values.mjs";

describe("Lab24 row semantics", () => {
  it("treats ndSN placeholder zeroes as missing", () => {
    const row = { ndSN: "1", punti: "0", posiz: "96" };
    expect(publishedMetricValue(row)).toBeNull();
    expect(publishedSourceRank(row)).toBeNull();
  });

  it("preserves an observed zero", () => {
    const row = { ndSN: "0", punti: "0", posiz: "106" };
    expect(publishedMetricValue(row)).toBe(0);
    expect(publishedSourceRank(row)).toBe(106);
  });

  it("rejects malformed numeric values", () => {
    expect(publishedMetricValue({ ndSN: "0", punti: "n.d." })).toBeNull();
  });
});

describe("Lab24 indicator identity", () => {
  it("accepts the expected indicator", () => {
    expect(() =>
      assertLab24Indicator({ indicatore: { ID: "100", nome: "PM 2,5" } }, "100", "PM 2,5")
    ).not.toThrow();
  });

  it("rejects a fallback page containing a different indicator", () => {
    expect(() =>
      assertLab24Indicator(
        { indicatore: { ID: "202", nome: "Classifica finale" } },
        "100",
        "PM 2,5"
      )
    ).toThrow(/Indicatore Lab24 errato.*Classifica finale/i);
  });
});
