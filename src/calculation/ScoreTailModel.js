import {
  assertCriticalValue,
  assertNonNegativeSafeInteger,
  assertSafeInteger,
} from '../domain/InputDomain'
import {
  calculateYouseiTailProbability,
  maxTailBound,
} from './DxTailModel'
import {
  calculateDxOrderStatisticTail,
} from './DxOrderStatistic'
import { oneDieTail } from './DxOneDieModel'

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

// Certificate bounds use this value to keep the directly summed binomial
// coefficient auditable and predictable. A larger reduced rank makes the
// certificate unavailable; the distribution and exact tail model remain
// usable independently.
export const MAX_CERTIFIED_ORDER_STATISTIC_RANK = 1_000

/**
 * Log binomial coefficient without constructing a factorial.
 *
 * This direct recurrence is intentionally limited to a modest reduced rank.
 * It is used only for mathematical upper-bound certificates, so an input
 * outside the certified range fails closed instead of switching to an
 * approximation whose rounding direction is not proven.
 */
function logBinomialCoefficient(n, k) {
  const reduced = Math.min(k, n - k)
  if (reduced <= 0) {
    return 0
  }
  if (reduced > MAX_CERTIFIED_ORDER_STATISTIC_RANK) {
    throw new RangeError(
      `order-statistic certificate rank exceeds ${MAX_CERTIFIED_ORDER_STATISTIC_RANK}`
    )
  }

  let result = 0
  for (let index = 1; index <= reduced; index += 1) {
    result += Math.log(n - reduced + index) - Math.log(index)
  }
  return result
}

/**
 * Safe upper bound for the residual first moment of the positive-shihai
 * order statistic. For rank r=m+1,
 *
 *   P(Y>x) <= C(n,r) q_c(x)^r.
 *
 * Grouping x by residue modulo ten turns the remaining one-die tail into a
 * geometric series with ratio ((11-c)/10)^r. The caller supplies the
 * boundary mass separately; this function bounds only
 * E[(Y-(cutoff+1))_+].
 */
export function orderStatisticTailFirstMomentUpperBound(
  cutoff,
  dice,
  critical,
  shihai,
) {
  nonNegativeInteger(cutoff, 'cutoff')
  nonNegativeInteger(dice, 'dice')
  nonNegativeInteger(shihai, 'shihai')
  assertCriticalValue(critical)
  if (dice === 0 || dice <= shihai || critical === 11) {
    return 0
  }

  const rank = shihai + 1
  const criticalProbability = (11 - critical) / 10
  const geometricRatio = criticalProbability ** rank
  if (!(geometricRatio >= 0 && geometricRatio < 1)) {
    throw new RangeError('DX order-statistic tail first-moment bound is not finite')
  }

  const logCoefficient = logBinomialCoefficient(dice, rank)
  const firstValue = cutoff + 1
  const denominator = 1 - geometricRatio
  let result = 0

  for (let residue = 0; residue < 10; residue += 1) {
    const distance = (residue - (firstValue % 10) + 10) % 10
    const first = firstValue + distance
    let oneDieProbability = oneDieTail(first, critical)
    if (oneDieProbability === 0) {
      // Underflow is still a positive mathematical tail for critical <= 10.
      oneDieProbability = Number.MIN_VALUE
    }
    const logTerm = logCoefficient + rank * Math.log(oneDieProbability)
    if (logTerm > Math.log(Number.MAX_VALUE)) {
      throw new RangeError('DX order-statistic tail first-moment bound is not finite')
    }
    const geometricBase = Math.exp(logTerm)
    const term = geometricBase / denominator
    result += term
    if (!Number.isFinite(result)) {
      throw new RangeError('DX order-statistic tail first-moment bound is not finite')
    }
  }

  return Math.max(0, result)
}

/** Tail model for the score before fixed skill and fumble conversion. */
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
  // These deterministic raw DX cases are resolved before selecting a tail
  // model. A zero-dice check is an automatic failure (raw value 0), while a
  // positive dice count fully covered by 《支配の領域》 is a fumble (raw value
  // 1). ScoreCalculator performs the later fumble-to-zero conversion.
  if (dice === 0) {
    return value < 0 ? 1 : 0
  }
  if (shihai > 0 && dice <= shihai) {
    return value < 1 ? 1 : 0
  }
  if (yousei === 0) {
    return shihai === 0
      ? maxTailBound(value, dice, critical)
      : calculateDxOrderStatisticTail(value, dice, critical, shihai)
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

  // The feature combination is rejected by the planner. Keep the historical
  // conservative union bound here so direct tail inspection remains safe.
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
