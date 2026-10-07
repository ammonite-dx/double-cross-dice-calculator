import {
  assertCriticalValue,
  assertNonNegativeSafeInteger,
} from '../domain/InputDomain'
import {
  getBinomialSurvivalOperationEstimate,
  binomialSurvivalProbability,
} from './BinomialSurvival'
import { oneDieTail } from './DxTailModel'

// findTailCutoff has at most 42 evaluations; planScore may then evaluate the
// selected display boundary once more to build its tail certificate.
const TAIL_PLANNER_MAX_EVALUATIONS = 43

export { binomialSurvivalProbability }

/**
 * Estimate one complete order-statistic distribution pass. The estimate
 * counts the bounded incomplete-beta work for each score boundary and does
 * not grow with the order-statistic rank.
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
  if (dice <= shihai) {
    return 0
  }
  const perBoundary = getDxOrderStatisticBoundaryOperationEstimate(
    dice,
    shihai,
    critical,
  )
  const operations = workingLength * perBoundary
  if (!Number.isSafeInteger(operations)) {
    throw new RangeError('DX order-statistic operation estimate exceeds the safe integer range')
  }
  return operations
}

/** Estimate the bounded tail evaluations used by the default cutoff search. */
export function getDxOrderStatisticTailSearchOperationEstimate(
  dice: number,
  shihai: number,
  critical: number,
): number {
  assertNonNegativeSafeInteger(dice, 'dice')
  assertNonNegativeSafeInteger(shihai, 'shihai')
  assertCriticalValue(critical)
  if (dice <= shihai) {
    return 0
  }
  const operations = TAIL_PLANNER_MAX_EVALUATIONS
    * getDxOrderStatisticBoundaryOperationEstimate(dice, shihai, critical)
  if (!Number.isSafeInteger(operations)) {
    throw new RangeError('DX order-statistic tail-search estimate exceeds the safe integer range')
  }
  return operations
}

function getDxOrderStatisticBoundaryOperationEstimate(
  dice: number,
  shihai: number,
  critical: number,
): number {
  return Math.max(1, critical - 1)
    + getBinomialSurvivalOperationEstimate(dice, shihai + 1)
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
