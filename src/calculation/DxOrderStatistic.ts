import {
  assertCriticalValue,
  assertNonNegativeSafeInteger,
} from '../domain/InputDomain'
import { oneDieTail } from './DxTailModel'

const PROBABILITY_TOLERANCE = 1e-12

function clampProbability(value: number, label = 'probability'): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    throw new RangeError(`${label} calculation produced NaN or infinity`)
  }
  if (value < -PROBABILITY_TOLERANCE || value > 1 + PROBABILITY_TOLERANCE) {
    throw new RangeError(`${label} calculation produced an invalid value`)
  }
  return Math.min(1, Math.max(0, value))
}

function logAddExp(left: number, right: number): number {
  if (left === -Infinity) {
    return right
  }
  if (right === -Infinity) {
    return left
  }
  const maximum = Math.max(left, right)
  const difference = Math.min(left, right) - maximum
  return maximum + Math.log1p(Math.exp(difference))
}

/** Return log P(Binomial(dice, probability) <= maximumSuccesses). */
function logBinomialLowerCdf(
  dice: number,
  maximumSuccesses: number,
  probability: number,
): number {
  if (maximumSuccesses < 0) {
    return -Infinity
  }
  if (maximumSuccesses >= dice || probability === 0) {
    return 0
  }
  if (probability === 1) {
    return -Infinity
  }

  let logPmf = dice * Math.log1p(-probability)
  let logTotal = -Infinity
  const logOdds = Math.log(probability) - Math.log1p(-probability)
  for (let successes = 0; successes <= maximumSuccesses; successes += 1) {
    logTotal = logAddExp(logTotal, logPmf)
    if (successes === maximumSuccesses) {
      break
    }
    logPmf +=
      Math.log(dice - successes) -
      Math.log(successes + 1) +
      logOdds
  }
  return Math.min(0, logTotal)
}

/**
 * Return P(K >= required) for K ~ Binomial(dice, probability).
 *
 * The shorter of the lower success tail and the equivalent lower failure tail
 * is evaluated in log-space. This keeps the work proportional to the order
 * statistic rank rather than to the dice count.
 */
export function binomialSurvivalProbability(
  dice: number,
  required: number,
  probability: number,
): number {
  assertNonNegativeSafeInteger(dice, 'dice')
  assertNonNegativeSafeInteger(required, 'required')
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

  const lowerTermCount = required
  const upperTermCount = dice - required + 1
  if (lowerTermCount <= upperTermCount) {
    const logLowerCdf = logBinomialLowerCdf(
      dice,
      required - 1,
      probability
    )
    return clampProbability(
      -Math.expm1(logLowerCdf),
      'binomial survival probability'
    )
  }

  // K >= required is equivalent to failures <= dice - required.
  const logFailureCdf = logBinomialLowerCdf(
    dice,
    dice - required,
    1 - probability
  )
  return clampProbability(
    Math.exp(logFailureCdf),
    'binomial survival probability'
  )
}

/** Return the number of binomial terms needed for shihai=m. */
export function getDxOrderStatisticTermCount(dice: number, shihai: number): number {
  assertNonNegativeSafeInteger(dice, 'dice')
  assertNonNegativeSafeInteger(shihai, 'shihai')
  if (dice <= shihai) {
    return 0
  }
  return Math.min(shihai + 1, dice - shihai)
}

/**
 * Estimate one complete order-statistic distribution pass. The estimate is a
 * shared planning primitive; it intentionally counts the one-die tail work
 * and the short binomial side without allocating a dice-sized table.
 */
export function getDxOrderStatisticOperationEstimate(
  workingLength: number,
  dice: number,
  shihai: number,
  critical: number,
): number {
  assertNonNegativeSafeInteger(workingLength, 'workingLength')
  assertNonNegativeSafeInteger(dice, 'dice')
  assertNonNegativeSafeInteger(shihai, 'shihai')
  assertCriticalValue(critical)
  const termCount = getDxOrderStatisticTermCount(dice, shihai)
  if (termCount === 0) {
    return 0
  }
  const perBoundary = Math.max(1, critical - 1) + termCount
  const operations = workingLength * perBoundary
  if (!Number.isSafeInteger(operations)) {
    throw new RangeError('DX order-statistic operation estimate exceeds the safe integer range')
  }
  return operations
}

/** Return P(X_(m+1) > value) for complete independent 1DX results. */
export function calculateDxOrderStatisticTail(
  value: number,
  dice: number,
  critical: number,
  shihai: number,
): number {
  if (Number.isNaN(value)) {
    throw new RangeError('score.value must not be NaN')
  }
  assertNonNegativeSafeInteger(dice, 'dice')
  assertNonNegativeSafeInteger(shihai, 'shihai')
  assertCriticalValue(critical)
  if (value < 0) {
    return 1
  }
  if (dice <= shihai) {
    return 0
  }
  return binomialSurvivalProbability(
    dice,
    shihai + 1,
    oneDieTail(value, critical)
  )
}

// Short aliases keep the mathematical helper convenient for focused tests and
// future callers without exposing any calculator or planner implementation.
export const orderStatisticTail = calculateDxOrderStatisticTail
export const binomialTail = binomialSurvivalProbability
