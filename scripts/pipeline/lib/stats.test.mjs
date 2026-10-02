import { describe, expect, it } from "vitest";
import {
  empiricalBayesRatio,
  estimateGammaPrior,
  gammaP,
  gammaQuantile,
  invertMatrix,
  logGamma,
  poissonRegression,
  quantile,
  ranks,
  sampleDirichlet,
  seededRandom,
  spearman
} from "./stats.mjs";

describe("stats toolkit", () => {
  it("computes interpolated quantiles", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([10, NaN, 0], 1)).toBe(10);
  });

  it("assigns average ranks to ties", () => {
    expect(ranks([10, 20, 20, 5])).toEqual([2, 3.5, 3.5, 1]);
  });

  it("computes spearman correlation on finite pairs only", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
    expect(spearman([1, 2, NaN, 4, 5], [1, 2, 3, NaN, 5])).toBeCloseTo(1);
  });

  it("inverts a matrix", () => {
    const inverse = invertMatrix([
      [4, 7],
      [2, 6]
    ]);
    expect(inverse[0][0]).toBeCloseTo(0.6);
    expect(inverse[0][1]).toBeCloseTo(-0.7);
    expect(inverse[1][0]).toBeCloseTo(-0.2);
    expect(inverse[1][1]).toBeCloseTo(0.4);
  });

  it("matches known log-gamma and incomplete gamma values", () => {
    expect(logGamma(5)).toBeCloseTo(Math.log(24), 10);
    expect(logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 10);
    // P(1, x) = 1 - e^-x
    expect(gammaP(1, 2)).toBeCloseTo(1 - Math.exp(-2), 10);
    expect(gammaP(3, 50)).toBeCloseTo(1, 10);
    expect(gammaQuantile(0.5, 1, 1)).toBeCloseTo(Math.log(2), 6);
  });

  it("recovers the coefficients of a noiseless Poisson model", () => {
    const xs = [0.5, 1, 2, 4, 8, 16];
    const exposure = [100, 200, 150, 300, 250, 120];
    const y = xs.map((x, i) => exposure[i] * Math.exp(-3) * x ** 0.6);
    const fit = poissonRegression(
      xs.map((x) => [1, Math.log(x)]),
      y,
      exposure.map(Math.log)
    );
    expect(fit.coefficients[0]).toBeCloseTo(-3, 6);
    expect(fit.coefficients[1]).toBeCloseTo(0.6, 6);
  });

  it("uses city-level HC1 uncertainty when count variance differs between groups", () => {
    const fit = poissonRegression(
      [[1, 0], [1, 0], [1, 0], [1, 1], [1, 1], [1, 1]],
      [2, 4, 6, 4, 10, 16],
      [0, 0, 0, 0, 0, 0]
    );
    // Saturated two-group fit: mean counts 4 and 10. The log-mean difference
    // has HC1 variance (n/(n-2)) * (sum residual² / sum counts²) in each group.
    const robustVariance = (6 / 4) * (8 / 12 ** 2 + 72 / 30 ** 2);
    expect(fit.coefficients[0]).toBeCloseTo(Math.log(4), 10);
    expect(fit.coefficients[1]).toBeCloseTo(Math.log(2.5), 10);
    expect(fit.standardErrors[1]).toBeCloseTo(Math.sqrt(robustVariance), 10);
    expect(fit.standardErrors[1]).not.toBeCloseTo(fit.quasiStandardErrors[1], 3);
  });

  it("rejects invalid or unconverged regression instead of publishing numerical artifacts", () => {
    expect(() => poissonRegression([], [], [])).toThrow(/nonempty/);
    expect(() => poissonRegression([[1], [1]], [0, 0], [0, 0])).toThrow(/positive/);
    expect(() => poissonRegression([[1], [1]], [1, 2], [NaN, 0])).toThrow(/Invalid/);
    expect(() => poissonRegression([[1], [1]], [1, 2], [0, 0], { iterations: 0 })).toThrow(/converge/);
  });

  it("shrinks small-count ratios toward 1", () => {
    const small = empiricalBayesRatio(0, 2, 5);
    const large = empiricalBayesRatio(0, 200, 5);
    expect(small.ratio).toBeGreaterThan(large.ratio);
    expect(small.ratio).toBeCloseTo(5 / 7);
    expect(small.low).toBeLessThan(small.ratio);
    expect(small.high).toBeGreaterThan(small.ratio);
  });

  it("keeps a zero-count posterior positive and rejects invented zero exposure", () => {
    const estimate = empiricalBayesRatio(0, 2, 1);
    expect(estimate.ratio).toBeGreaterThan(0);
    expect(estimate.low).toBeGreaterThan(0);
    expect(() => empiricalBayesRatio(1, 0, 1)).toThrow(/Invalid/);
    expect(() => empiricalBayesRatio(1, 2, 0)).toThrow(/Invalid/);
  });

  it("estimates a larger prior alpha when counts follow the model closely", () => {
    const expected = [10, 20, 30, 40, 50, 60, 70, 80];
    const tight = estimateGammaPrior([10, 21, 29, 41, 50, 59, 71, 80], expected);
    const loose = estimateGammaPrior([2, 45, 10, 90, 15, 120, 30, 200], expected);
    expect(tight).toBeGreaterThan(loose);
  });

  it("draws deterministic Dirichlet weights that sum to one", () => {
    const first = sampleDirichlet([40, 25, 20, 15], 30, seededRandom(7));
    const second = sampleDirichlet([40, 25, 20, 15], 30, seededRandom(7));
    expect(first).toEqual(second);
    expect(first.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });
});
