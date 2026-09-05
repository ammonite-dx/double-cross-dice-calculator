import {
  assertCriticalValue,
  assertNonNegativeSafeInteger,
  assertSafeInteger,
} from '../domain/InputDomain'

/**
 * Shared numerical model for the unbounded DX tail.
 *
 * This module deliberately has no planner, runtime, UI, or resource
 * dependencies. `DxCalculator` uses the low-level helpers when it builds a
 * distribution, while `RangePlanner` and `ScoreCalculator` use the public
 * certificates to choose and describe a finite working range.
 */

function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`)
  }
  return value
}

function nonNegativeInteger(value, name) {
  return assertNonNegativeSafeInteger(value, name)
}

function positiveInteger(value, name) {
  assertSafeInteger(value, name)
  if (value <= 0) {
    throw new RangeError(`${name} must be positive`)
  }
  return value
}

function probability(value, name) {
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    throw new RangeError(`${name} must be between 0 and 1`)
  }
  return value
}

function clampProbability(value) {
  // NaN means the certificate calculation failed; endpoint infinities are
  // explicit probability limits rather than errors.
  if (Number.isNaN(value)) {
    throw new RangeError('probability calculation produced NaN')
  }
  if (value === Infinity) {
    return 1
  }
  if (value === -Infinity) {
    return 0
  }
  if (!Number.isFinite(value)) {
    throw new RangeError('probability calculation produced a non-finite value')
  }
  return Math.max(0, Math.min(1, value))
}

function geometricSum(probabilityValue, terms) {
  if (terms <= 0) {
    return 0
  }
  if (probabilityValue === 1) {
    return terms
  }
  return (1 - probabilityValue ** terms) / (1 - probabilityValue)
}

/** Cumulative probability for one DX die at an integer score boundary. */
export function oneDieCumulative(value, critical) {
  if (value <= 0) {
    return 0
  }
  assertCriticalValue(critical)

  const criticalProbability = (11 - critical) / 10
  let result = 0
  for (let face = 1; face < critical && face <= value; face += 1) {
    const terms = Math.floor((value - face) / 10) + 1
    result += 0.1 * geometricSum(criticalProbability, terms)
  }
  return Math.min(1, result)
}

/** Strict tail probability for one DX die at an integer score boundary. */
export function oneDieTail(value, critical) {
  if (value < 0) {
    return 1
  }
  assertCriticalValue(critical)

  const criticalProbability = (11 - critical) / 10
  let result = 0
  for (let face = 1; face < critical; face += 1) {
    const firstExcludedRepeat =
      value < face ? 0 : Math.floor((value - face) / 10) + 1
    if (criticalProbability === 0) {
      if (firstExcludedRepeat === 0) {
        result += 0.1
      }
      continue
    }
    result +=
      0.1 *
      criticalProbability ** firstExcludedRepeat /
      (1 - criticalProbability)
  }
  return Math.max(0, Math.min(1, result))
}

/** Tail of the maximum of `dice` independent critical chains. */
export function maxTailBound(value, dice, critical) {
  nonNegativeInteger(dice, 'dice')
  assertCriticalValue(critical)
  if (Number.isNaN(value)) {
    throw new RangeError('score.value must not be NaN')
  }
  if (dice === 0) {
    return 0
  }
  const tailOfOneDie = oneDieTail(Math.floor(value), critical)
  if (tailOfOneDie === 1) {
    return 1
  }
  return clampProbability(
    -Math.expm1(dice * Math.log1p(-tailOfOneDie))
  )
}

/**
 * Upper-bound the first-moment contribution strictly above an integer cutoff
 * for the maximum of `dice` independent DX rolls.
 *
 * The union bound is grouped by residue modulo ten, so the infinite
 * geometric tail is evaluated without allocating an unbounded array.
 */
export function maxTailFirstMomentUpperBound(cutoff, dice, critical) {
  nonNegativeInteger(cutoff, 'cutoff')
  nonNegativeInteger(dice, 'dice')
  assertCriticalValue(critical)
  if (dice === 0) {
    return 0
  }

  const criticalProbability = (11 - critical) / 10
  const firstValue = cutoff + 1
  let result = 0

  for (let residue = 0; residue < 10; residue += 1) {
    const distance = (residue - (firstValue % 10) + 10) % 10
    const first = firstValue + distance
    const firstTail = oneDieTail(first, critical)
    if (firstTail === 0) {
      continue
    }
    result += dice * firstTail / (1 - criticalProbability)
  }

  if (!Number.isFinite(result) || result < 0) {
    throw new RangeError('DX tail first-moment bound is not finite')
  }
  return result
}

export function maxGeometricTail(maxCriticalCount, dice, criticalProbability) {
  if (maxCriticalCount < 0) {
    return 1
  }
  if (dice === 0 || criticalProbability === 0) {
    return 0
  }

  const tailOfOneDie = criticalProbability ** (maxCriticalCount + 1)
  return clampProbability(
    -Math.expm1(dice * Math.log1p(-tailOfOneDie))
  )
}

function negativeBinomialLogStep(logPmf, sum, yousei, criticalProbability) {
  return logPmf +
    Math.log(criticalProbability) +
    Math.log(sum + yousei) -
    Math.log(sum + 1)
}

function negativeBinomialTailFrom(
  logPmf,
  sum,
  yousei,
  criticalProbability,
) {
  let result = 0
  let compensation = 0
  const logMinimum = Math.log(Number.MIN_VALUE)

  while (true) {
    const pmf = Math.exp(logPmf)
    if (pmf > 0) {
      const corrected = pmf - compensation
      const next = result + corrected
      compensation = next - result - corrected
      result = next
    }

    const logRatio = negativeBinomialLogStep(
      0,
      sum,
      yousei,
      criticalProbability,
    )
    const nextLogPmf = logPmf + logRatio
    const nextPmf = Math.exp(nextLogPmf)
    if (
      logRatio < 0 &&
      (
        nextPmf === 0 ||
        nextPmf <= Number.EPSILON * Math.max(result, Number.MIN_VALUE)
      )
    ) {
      break
    }
    if (logRatio < 0 && nextLogPmf < logMinimum) {
      break
    }

    logPmf = nextLogPmf
    sum += 1
  }

  return clampProbability(result)
}

// T = M + S_y, where M is the maximum of the geometric L values and S_y is
// their y-term negative-binomial sum. Evaluate the tail directly to avoid
// subtracting a near-one CDF when the requested error is very small.
function maxPlusNegativeBinomialTail(
  threshold,
  dice,
  yousei,
  criticalProbability,
) {
  if (threshold < 0) {
    return 1
  }
  if (criticalProbability === 0) {
    return 0
  }

  let logPmf = yousei * Math.log1p(-criticalProbability)
  let result = 0
  let compensation = 0
  for (let sum = 0; sum <= threshold; sum += 1) {
    const pmf = Math.exp(logPmf)
    const term =
      pmf * maxGeometricTail(threshold - sum, dice, criticalProbability)
    if (term > 0) {
      const corrected = term - compensation
      const next = result + corrected
      compensation = next - result - corrected
      result = next
    }
    logPmf = negativeBinomialLogStep(
      logPmf,
      sum,
      yousei,
      criticalProbability,
    )
  }

  result += negativeBinomialTailFrom(
    logPmf,
    threshold + 1,
    yousei,
    criticalProbability,
  )
  return clampProbability(result)
}

/**
 * Exact tail probability for a Yousei-adjusted maximum when shihai is zero.
 * The value is P(score > value), including the finite critical=11 shortcut.
 */
export function calculateYouseiTailProbability(
  value,
  dice,
  critical,
  yousei,
) {
  if (dice === 0) {
    return 0
  }
  assertCriticalValue(critical)
  nonNegativeInteger(dice, 'dice')
  nonNegativeInteger(yousei, 'yousei')

  // At critical=11 no natural critical is possible. The first use of
  // 《妖精の手》 changes the current result to 10 and subsequent uses leave
  // that value unchanged.
  if (critical === 11) {
    return Math.floor(value) < 10 ? 1 : 0
  }

  const integerValue = Math.floor(value)
  const remainderCount = critical - 1
  const criticalProbability = (11 - critical) / 10

  // A_y = 10(y + T) + R, with R uniform on 1..critical-1. There are at
  // most two distinct T thresholds among the possible remainders.
  let result = 0
  let previousThreshold = null
  let multiplicity = 0
  for (let remainder = 1; remainder <= remainderCount; remainder += 1) {
    const threshold =
      Math.floor((integerValue - remainder) / 10) - yousei
    if (threshold === previousThreshold) {
      multiplicity += 1
      continue
    }
    if (previousThreshold !== null) {
      result += multiplicity * maxPlusNegativeBinomialTail(
        previousThreshold,
        dice,
        yousei,
        criticalProbability,
      )
    }
    previousThreshold = threshold
    multiplicity = 1
  }
  if (previousThreshold !== null) {
    result += multiplicity * maxPlusNegativeBinomialTail(
      previousThreshold,
      dice,
      yousei,
      criticalProbability,
    )
  }

  return clampProbability(result / remainderCount)
}

const LOG_GAMMA_COEFFICIENTS = [
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
]

// Lanczos approximation for log(Gamma(z)). All callers use positive integer
// arguments, but the reflection branch keeps this helper useful for
// diagnostics without factorial-sized intermediate values.
function logGamma(value) {
  if (value < 0.5) {
    return Math.log(Math.PI) -
      Math.log(Math.sin(Math.PI * value)) -
      logGamma(1 - value)
  }

  const shifted = value - 1
  let sum = 0.99999999999980993
  for (let index = 0; index < LOG_GAMMA_COEFFICIENTS.length; index += 1) {
    sum += LOG_GAMMA_COEFFICIENTS[index] / (shifted + index + 1)
  }
  const g = 7
  const t = shifted + g + 0.5
  return 0.5 * Math.log(2 * Math.PI) +
    (shifted + 0.5) * Math.log(t) -
    t +
    Math.log(sum)
}

/** PMF of the negative-binomial number of natural criticals before Yousei. */
export function negativeBinomialPmf(sum, yousei, criticalProbability) {
  if (yousei === 0) {
    return sum === 0 ? 1 : 0
  }
  if (criticalProbability === 0) {
    return sum === 0 ? 1 : 0
  }

  const logPmf =
    logGamma(sum + yousei) -
    logGamma(yousei) -
    logGamma(sum + 1) +
    yousei * Math.log1p(-criticalProbability) +
    sum * Math.log(criticalProbability)
  return Math.exp(logPmf)
}

// For shihai>0, the maximum-of-all-dice tail is deliberately conservative.
// It is independent of the finite work array and therefore suitable for a
// planner certificate even though production DP uses an order statistic.
export function scoreTailBound(value, params) {
  object(params, 'score')
  const { dice, critical, shihai = 0, yousei = 0 } = params
  nonNegativeInteger(dice, 'score.dice')
  nonNegativeInteger(shihai, 'score.shihai')
  nonNegativeInteger(yousei, 'score.yousei')
  assertCriticalValue(critical, 'score.critical')
  if (Number.isNaN(value)) {
    throw new RangeError('score.value must not be NaN')
  }
  if (yousei === 0) {
    return maxTailBound(value, dice, critical)
  }

  if (shihai === 0) {
    if (value === Infinity) {
      return 0
    }
    if (value === -Infinity) {
      return 1
    }
    return calculateYouseiTailProbability(value, dice, critical, yousei)
  }

  const adjusted = Math.floor((value - 9 * yousei) / (yousei + 1))
  if (adjusted <= 0) {
    return 1
  }
  return Math.min(
    1,
    maxTailBound(adjusted, dice, critical) +
      yousei * maxTailBound(adjusted, 1, critical)
  )
}

export function findTailCutoff(params, epsilon, maxSearch = 1 << 20) {
  object(params, 'score')
  probability(epsilon, 'epsilon')
  positiveInteger(maxSearch, 'maxSearch')

  const cache = new Map()
  const evaluate = (value) => {
    if (!cache.has(value)) {
      cache.set(value, scoreTailBound(value, params))
    }
    return cache.get(value)
  }

  let high = 1
  while (high < maxSearch && evaluate(high) > epsilon) {
    high *= 2
  }
  if (evaluate(high) > epsilon) {
    return {
      reachable: false,
      cutoff: high,
      bound: evaluate(high),
    }
  }

  let low = -1
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (evaluate(middle) <= epsilon) {
      high = middle
    } else {
      low = middle
    }
  }
  return {
    reachable: true,
    cutoff: high,
    bound: evaluate(high),
  }
}
