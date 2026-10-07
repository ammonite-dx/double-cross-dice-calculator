const MAX_CONTINUED_FRACTION_ITERATIONS = 100_000
const ITERATION_BUDGET_SAFETY_FACTOR = 4
const ITERATION_BUDGET_FIXED_MARGIN = 32
const OPERATION_WORK_PER_ITERATION = 16
const OPERATION_WORK_FIXED = 64
const CONTINUED_FRACTION_TOLERANCE = 2e-14
const MIN_CONTINUED_FRACTION_VALUE = 1e-300
const STIRLING_SERIES_MIN_ARGUMENT = 8
const LOG_SQRT_TWO_PI = 0.9189385332046727
const LOG_TWO_PI = 1.8378770664093453
const PROBABILITY_TOLERANCE = 1e-12

/**
 * Bound the continued-fraction work using the reduced beta shape. The
 * continued fraction converges in O(sqrt(min(a,b))) iterations near its
 * central region; the fixed global cap remains a fail-closed backstop.
 */
export function getBinomialSurvivalIterationBudget(
  dice: number,
  required: number,
): number {
  const reducedShape = Math.min(required, dice - required + 1)
  return Math.min(
    MAX_CONTINUED_FRACTION_ITERATIONS,
    Math.ceil(
      ITERATION_BUDGET_SAFETY_FACTOR * Math.sqrt(reducedShape)
        + ITERATION_BUDGET_FIXED_MARGIN
    ),
  )
}

/** Conservative work units for one beta-tail evaluation, including setup. */
export function getBinomialSurvivalOperationEstimate(
  dice: number,
  required: number,
): number {
  return OPERATION_WORK_FIXED
    + getBinomialSurvivalIterationBudget(dice, required)
      * OPERATION_WORK_PER_ITERATION
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    throw new RangeError('binomial survival probability calculation produced NaN or infinity')
  }
  if (value < -PROBABILITY_TOLERANCE || value > 1 + PROBABILITY_TOLERANCE) {
    throw new RangeError('binomial survival probability calculation produced an invalid value')
  }
  return Math.min(1, Math.max(0, value))
}

function logGammaForSmallInteger(value: number): number {
  let result = 0
  for (let factor = 2; factor < value; factor += 1) {
    result += Math.log(factor)
  }
  return result
}

/** Stirling correction: log Γ(x) minus its leading asymptotic expression. */
function stirlingCorrection(value: number): number {
  if (value < STIRLING_SERIES_MIN_ARGUMENT) {
    return logGammaForSmallInteger(value)
      - ((value - 0.5) * Math.log(value) - value + LOG_SQRT_TWO_PI)
  }

  const inverse = 1 / value
  const square = inverse * inverse
  return inverse * (
    1 / 12 + square * (
      -1 / 360 + square * (
        1 / 1260 + square * (
          -1 / 1680 + square * (
            1 / 1188 + square * (
              -691 / 360360 + square * (
                1 / 156 - square * 3617 / 122400
              )
            )
          )
        )
      )
    )
  )
}

function stableLogRatio(
  value: number,
  reference: number,
  difference: number,
): number {
  if (value === 0) {
    return -Infinity
  }
  const relativeDifference = difference / reference
  if (relativeDifference > -0.5 && relativeDifference < 0.5) {
    return Math.log1p(relativeDifference)
  }
  return Math.log(value) - Math.log(reference)
}

/**
 * Log of x^a (1-x)^b / B(a,b), evaluated without subtracting two O(n)
 * logarithms near the beta mean. The integer parameters let us use a stable
 * Stirling correction instead of subtracting three large log-gamma values.
 */
function logBetaFront(
  a: number,
  b: number,
  x: number,
  oneMinusX: number,
): number {
  const total = a + b
  const meanA = a / total
  const meanB = b / total
  // Form the difference from the smaller complementary probability. Directly
  // subtracting values near one loses several digits for large n.
  const differenceA = meanA <= 0.5
    ? x - meanA
    : meanB - oneMinusX
  const differenceB = -differenceA
  const logRatios = a * stableLogRatio(x, meanA, differenceA)
    + b * stableLogRatio(oneMinusX, meanB, differenceB)
  const logScale = 0.5 * (
    LOG_TWO_PI + Math.log(total) - Math.log(a) - Math.log(b)
  )
  const correction = stirlingCorrection(a)
    + stirlingCorrection(b)
    - stirlingCorrection(total)
  return logRatios - logScale - correction
}

function nonzero(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError('incomplete beta continued fraction produced a non-finite value')
  }
  if (Math.abs(value) >= MIN_CONTINUED_FRACTION_VALUE) {
    return value
  }
  return value < 0
    ? -MIN_CONTINUED_FRACTION_VALUE
    : MIN_CONTINUED_FRACTION_VALUE
}

/** Evaluate the two-argument continued fraction without reconstructing 1-x. */
function betaContinuedFraction(
  a: number,
  b: number,
  x: number,
  oneMinusX: number,
  iterationBudget: number,
): number {
  const firstDenominator = a + 1
  const firstNumerator = a * oneMinusX - b * x + 1
  let fraction = nonzero(a * firstNumerator / firstDenominator)
  let c = fraction
  let d = 0
  let lastDelta = Number.NaN

  for (let iteration = 1; iteration <= iterationBudget; iteration += 1) {
    const denominator = a + 2 * iteration - 1
    const numerator = (iteration * (a + iteration - 1) / denominator)
      * ((a + b + iteration - 1) / denominator)
      * (b - iteration)
      * x
      * x
    const partialDenominator = iteration
      + iteration * (b - iteration) * x / denominator
      + (a + iteration)
        * (
          a * oneMinusX
          - b * x
          + 1
          + iteration * (2 - x)
        )
        / (a + 2 * iteration + 1)

    d = partialDenominator + numerator * d
    d = 1 / nonzero(d)
    c = nonzero(partialDenominator + numerator / c)
    const delta = c * d
    fraction *= delta
    lastDelta = delta

    if (!Number.isFinite(fraction) || !Number.isFinite(delta)) {
      throw new RangeError('incomplete beta continued fraction produced a non-finite value')
    }
    if (Math.abs(delta - 1) <= CONTINUED_FRACTION_TOLERANCE) {
      if (fraction <= 0) {
        throw new RangeError('incomplete beta continued fraction produced a non-positive value')
      }
      return fraction
    }
  }

  throw new RangeError(
    `incomplete beta continued fraction did not converge in ${iterationBudget} iterations (a=${a}, b=${b}, x=${x}, delta=${lastDelta})`
  )
}

function lowerRegularizedIncompleteBeta(
  a: number,
  b: number,
  x: number,
  oneMinusX: number,
  iterationBudget: number,
): number {
  const fraction = betaContinuedFraction(
    a,
    b,
    x,
    oneMinusX,
    iterationBudget,
  )
  const logProbability = logBetaFront(a, b, x, oneMinusX)
    - Math.log(fraction)
  if (logProbability === -Infinity) {
    return 0
  }
  if (!Number.isFinite(logProbability)) {
    throw new RangeError('incomplete beta probability calculation produced a non-finite value')
  }
  return clampProbability(Math.exp(logProbability))
}

/** Regularized incomplete beta I_x(a,b), using symmetry to avoid cancellation. */
function regularizedIncompleteBeta(
  a: number,
  b: number,
  x: number,
  oneMinusX: number,
  iterationBudget: number,
): number {
  if (x <= 0) {
    return 0
  }
  if (x >= 1) {
    return 1
  }

  const threshold = (a + 1) / (a + b + 2)
  if (x < threshold) {
    return lowerRegularizedIncompleteBeta(a, b, x, oneMinusX, iterationBudget)
  }
  const complement = lowerRegularizedIncompleteBeta(
    b,
    a,
    oneMinusX,
    x,
    iterationBudget,
  )
  return clampProbability(1 - complement)
}

/**
 * Return P(K >= required) for K ~ Binomial(dice, probability).
 * The regularized incomplete beta evaluates the tail without a sum whose
 * number of terms grows with the order-statistic rank.
 */
export function binomialSurvivalProbability(
  dice: number,
  required: number,
  probability: number,
): number {
  if (!Number.isSafeInteger(dice) || dice < 0) {
    throw new RangeError('dice must be a non-negative safe integer')
  }
  if (!Number.isSafeInteger(required) || required < 0) {
    throw new RangeError('required must be a non-negative safe integer')
  }
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError('binomial probability must be between 0 and 1')
  }
  if (required <= 0) {
    return 1
  }
  if (required > dice) {
    return 0
  }
  if (probability === 0) {
    return 0
  }
  if (probability === 1) {
    return 1
  }

  return regularizedIncompleteBeta(
    required,
    dice - required + 1,
    probability,
    1 - probability,
    getBinomialSurvivalIterationBudget(dice, required),
  )
}
