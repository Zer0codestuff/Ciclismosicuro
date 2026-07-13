import { describe, expect, it } from "vitest";
import { normalizeValues, quantile } from "./normalization.mjs";

describe("robust normalization", () => {
  it("computes interpolated quantiles", () => {
    expect(quantile([0, 10, 20, 30, 40], 0.25)).toBe(10);
    expect(quantile([0, 10, 20, 30], 0.5)).toBe(15);
  });

  it("caps outliers instead of letting them flatten the whole distribution", () => {
    const normalized = normalizeValues([0, 10, 20, 30, 1000], {
      lowerPercentile: 0.1,
      upperPercentile: 0.9
    });
    expect(normalized[4]).toBe(100);
    expect(normalized[2]).toBeGreaterThan(1);
  });

  it("preserves missing values and supports inverse metrics", () => {
    const normalized = normalizeValues([10, null, 30], {
      direction: "lower",
      lowerPercentile: 0,
      upperPercentile: 1
    });
    expect(normalized).toEqual([100, null, 0]);
  });

  it("uses fixed domains for sparse manual metrics", () => {
    expect(
      normalizeValues([1, 3, 5], { domainMin: 1, domainMax: 5 })
    ).toEqual([0, 50, 100]);
  });
});
