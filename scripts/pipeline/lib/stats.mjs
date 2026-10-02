/**
 * Small, dependency-free statistics toolkit used by the data pipeline.
 * Everything here is deterministic: random draws use a seeded generator.
 */

export function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

export function mean(values) {
  return values.length ? sum(values) / values.length : NaN;
}

/** Linear-interpolated quantile of an ascending-sorted array (p in [0, 1]). */
export function quantileSorted(sorted, p) {
  if (sorted.length === 0) return NaN;
  const position = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function quantile(values, p) {
  return quantileSorted(
    values.filter(Number.isFinite).sort((a, b) => a - b),
    p
  );
}

/** Average ranks (1-based), ties share the mean rank. */
export function ranks(values) {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = new Array(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].value === order[i].value) j += 1;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) result[order[k].index] = rank;
    i = j + 1;
  }
  return result;
}

export function pearson(xs, ys) {
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/** Spearman rank correlation over pairs where both values are finite. */
export function spearman(xs, ys) {
  const pairs = xs
    .map((x, index) => [x, ys[index]])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return NaN;
  return pearson(
    ranks(pairs.map(([x]) => x)),
    ranks(pairs.map(([, y]) => y))
  );
}

/** Solve a small dense linear system with Gaussian elimination (partial pivoting). */
export function solveLinear(matrix, vector) {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    [a[col], a[pivot]] = [a[pivot], a[col]];
    if (Math.abs(a[col][col]) < 1e-12) throw new Error("Singular matrix");
    for (let row = col + 1; row < n; row += 1) {
      const factor = a[row][col] / a[col][col];
      for (let k = col; k <= n; k += 1) a[row][k] -= factor * a[col][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let acc = a[row][n];
    for (let k = row + 1; k < n; k += 1) acc -= a[row][k] * x[k];
    x[row] = acc / a[row][row];
  }
  return x;
}

export function invertMatrix(matrix) {
  const columns = matrix.map((_, column) =>
    solveLinear(
      matrix,
      matrix.map((__, row) => (row === column ? 1 : 0))
    )
  );
  return matrix.map((_, row) => columns.map((column) => column[row]));
}

/**
 * Poisson GLM with log link and offset, fitted by IRLS.
 * Returns coefficients, city-level HC1 robust standard errors and fitted means.
 * Quasi-Poisson errors are retained as a diagnostic, not used for inference.
 * @param {number[][]} X design matrix (include a column of ones for the intercept)
 * @param {number[]} y observed counts
 * @param {number[]} offset log-exposure offset
 */
export function poissonRegression(X, y, offset, { iterations = 100, tolerance = 1e-10 } = {}) {
  if (!Array.isArray(X) || !X.length || !Array.isArray(X[0]) || !X[0].length) {
    throw new Error("Poisson regression requires a nonempty design matrix");
  }
  const p = X[0].length;
  if (X.length !== y.length || offset.length !== y.length || y.length <= p ||
      X.some((row) => row.length !== p || row.some((value) => !Number.isFinite(value))) ||
      y.some((value) => !Number.isFinite(value) || value < 0) ||
      offset.some((value) => !Number.isFinite(value))) {
    throw new Error("Invalid Poisson regression inputs or insufficient degrees of freedom");
  }
  const totalY = sum(y);
  const totalExposure = sum(offset.map(Math.exp));
  if (!(totalY > 0) || !(totalExposure > 0) || !Number.isFinite(totalExposure)) {
    throw new Error("Poisson regression requires positive finite total counts and exposure");
  }
  let beta = new Array(p).fill(0);
  beta[0] = Math.log(totalY / totalExposure);
  let converged = false;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const xtwx = Array.from({ length: p }, () => new Array(p).fill(0));
    const xtwz = new Array(p).fill(0);
    for (let i = 0; i < y.length; i += 1) {
      const eta = X[i].reduce((acc, value, k) => acc + value * beta[k], offset[i]);
      const mu = Math.exp(eta);
      if (!(mu > 0) || !Number.isFinite(mu)) throw new Error("Poisson regression diverged");
      const z = eta - offset[i] + (y[i] - mu) / mu;
      for (let r = 0; r < p; r += 1) {
        xtwz[r] += X[i][r] * mu * z;
        for (let c = 0; c < p; c += 1) xtwx[r][c] += X[i][r] * mu * X[i][c];
      }
    }
    const next = solveLinear(xtwx, xtwz);
    const delta = Math.max(...next.map((value, k) => Math.abs(value - beta[k])));
    beta = next;
    if (delta < tolerance) {
      converged = true;
      break;
    }
  }
  if (!converged) throw new Error("Poisson regression did not converge");
  const fitted = y.map((_, i) => Math.exp(X[i].reduce((acc, value, k) => acc + value * beta[k], offset[i])));
  const information = Array.from({ length: p }, (_, r) =>
    Array.from({ length: p }, (__, c) => sum(fitted.map((mu, i) => X[i][r] * mu * X[i][c])))
  );
  const pearsonChi2 = sum(y.map((value, i) => (value - fitted[i]) ** 2 / fitted[i]));
  const dispersion = Math.max(1, pearsonChi2 / (y.length - p));
  const bread = invertMatrix(information);
  // City-level HC1 sandwich: unlike a common quasi-Poisson dispersion multiplier,
  // this allows heterogeneous variance (including Poisson-Gamma's mu + mu²/alpha).
  const meat = Array.from({ length: p }, (_, r) =>
    Array.from({ length: p }, (__, c) => sum(y.map((value, i) => X[i][r] * X[i][c] * (value - fitted[i]) ** 2)))
  );
  const finiteSample = y.length / (y.length - p);
  const covariance = Array.from({ length: p }, (_, r) =>
    Array.from({ length: p }, (__, c) =>
      finiteSample * sum(Array.from({ length: p }, (___, j) =>
        sum(Array.from({ length: p }, (____, k) => bread[r][j] * meat[j][k] * bread[k][c]))
      ))
    )
  );
  const standardErrors = covariance.map((row, k) => Math.sqrt(Math.max(0, row[k])));
  const quasiStandardErrors = bread.map((row, k) => Math.sqrt(row[k] * dispersion));
  return { coefficients: beta, standardErrors, quasiStandardErrors, covariance, fitted, dispersion, converged };
}

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
];

export function logGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const z = x - 1;
  let a = 0.99999999999980993;
  const t = z + 7.5;
  for (let i = 0; i < LANCZOS.length; i += 1) a += LANCZOS[i] / (z + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularized lower incomplete gamma P(a, x). */
export function gammaP(a, x) {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let term = 1 / a;
    let total = term;
    for (let n = 1; n < 500; n += 1) {
      term *= x / (a + n);
      total += term;
      if (Math.abs(term) < Math.abs(total) * 1e-14) break;
    }
    return total * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  // Continued fraction for Q(a, x), Lentz's method.
  let b = x + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-14) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** Quantile of a Gamma(shape, rate) distribution via bisection on P. */
export function gammaQuantile(p, shape, rate) {
  let low = 0;
  let high = Math.max(1, (shape / rate) * 10);
  while (gammaP(shape, high * rate) < p) high *= 2;
  for (let i = 0; i < 200; i += 1) {
    const middle = (low + high) / 2;
    if (gammaP(shape, middle * rate) < p) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/**
 * Negative-binomial marginal log-likelihood for a Poisson-Gamma model where
 * the city effect has prior Gamma(alpha, alpha) (mean 1, variance 1/alpha).
 */
export function negativeBinomialLogLikelihood(alpha, observed, expected) {
  let total = 0;
  for (let i = 0; i < observed.length; i += 1) {
    const y = observed[i];
    const m = expected[i];
    total +=
      logGamma(alpha + y) -
      logGamma(alpha) -
      logGamma(y + 1) +
      alpha * Math.log(alpha / (alpha + m)) +
      y * Math.log(m / (alpha + m));
  }
  return total;
}

/** Maximum-likelihood alpha for the Gamma prior via golden-section search on log(alpha). */
export function estimateGammaPrior(observed, expected, { min = 0.05, max = 1000 } = {}) {
  const f = (logAlpha) => negativeBinomialLogLikelihood(Math.exp(logAlpha), observed, expected);
  let a = Math.log(min);
  let b = Math.log(max);
  const ratio = (Math.sqrt(5) - 1) / 2;
  let c = b - ratio * (b - a);
  let d = a + ratio * (b - a);
  for (let i = 0; i < 200; i += 1) {
    if (f(c) > f(d)) b = d;
    else a = c;
    c = b - ratio * (b - a);
    d = a + ratio * (b - a);
  }
  return Math.exp((a + b) / 2);
}

/**
 * Empirical-Bayes relative risk: posterior Gamma(alpha + observed, alpha + expected).
 * Returns posterior mean and a central credible interval.
 */
export function empiricalBayesRatio(observed, expected, alpha, level = 0.9) {
  if (!Number.isFinite(observed) || observed < 0 || !Number.isFinite(expected) || expected <= 0 ||
      !Number.isFinite(alpha) || alpha <= 0 || !Number.isFinite(level) || level <= 0 || level >= 1) {
    throw new Error("Invalid Poisson-Gamma posterior inputs");
  }
  const shape = alpha + observed;
  const rate = alpha + expected;
  const tail = (1 - level) / 2;
  return {
    ratio: shape / rate,
    low: gammaQuantile(tail, shape, rate),
    high: gammaQuantile(1 - tail, shape, rate),
    raw: expected > 0 ? observed / expected : NaN
  };
}

/** Mulberry32 seeded PRNG. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Marsaglia–Tsang gamma sampler (rate 1). */
export function sampleGamma(shape, random) {
  if (shape < 1) {
    return sampleGamma(shape + 1, random) * random() ** (1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x;
    let v;
    do {
      // Box–Muller normal draw.
      const u1 = random() || 1e-12;
      const u2 = random();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v ** 3;
    const u = random();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Dirichlet draw centred on `weights` (normalized) with total concentration `concentration`. */
export function sampleDirichlet(weights, concentration, random) {
  const total = sum(weights);
  const draws = weights.map((weight) => sampleGamma(Math.max(1e-3, (weight / total) * concentration), random));
  const drawTotal = sum(draws);
  return draws.map((value) => value / drawTotal);
}

export function round(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
