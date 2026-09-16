import { OUTPUT_DISTRIBUTION_SIZE } from '../../core/probability/Distribution'
import { PUBLISHED_OVERFLOW_INDEX } from '../DistributionResult'
import {
  nonNegativeInteger,
  nonNegativeNumber,
  object,
  probability,
  DEFAULT_MAX_CPU_WORK,
} from './PlanningMath'

const DEFAULT_ERROR_BUDGET = 1e-8
const PUBLISHED_SCORE_MAX_INDEX = OUTPUT_DISTRIBUTION_SIZE - 1
const LEGACY_CALCULATION_MAX = PUBLISHED_OVERFLOW_INDEX - 1

function getPublishedScoreUpperBound(calculationMax) {
  return Math.max(calculationMax + 1, PUBLISHED_SCORE_MAX_INDEX)
}

/**
 * The default propagates the complete canonical score tail. Resource
 * thresholds are provisional policy inputs, not UI input limits.
 */
export const DEFAULT_POLICY = {
  scorePropagation: 'full-tail',
  calculationMax: LEGACY_CALCULATION_MAX,
  errorBudget: {
    total: DEFAULT_ERROR_BUDGET,
    scoreTail: 8e-9,
  },
  display: {
    defaultMin: 0,
    defaultMax: 999,
    // The display range is no longer tied to the old 0..999 chart. Typed
    // arrays and the resource policy below provide the practical bound.
    maxPoints: Number.MAX_SAFE_INTEGER,
  },
  limits: {
    maxCpuWork: DEFAULT_MAX_CPU_WORK,
    estimatedMemoryBytes: 64 * 1024 * 1024,
    workingLength: 16384,
    fftLength: 32768,
  },
}

export { getPublishedScoreUpperBound }

export function mergePolicy(policy) {
  const supplied = policy ?? {}
  object(supplied, 'policy')

  for (const legacyKey of [
    'costModel',
    'estimatedTimeMs',
    'dxOperationsPerMs',
    'fftOperationsPerMs',
    'damageOperationsPerMs',
    'backtrackOperationsPerMs',
  ]) {
    if (Object.prototype.hasOwnProperty.call(supplied, legacyKey)) {
      throw new RangeError(`policy.${legacyKey} is no longer supported`)
    }
  }
  if (supplied.limits !== undefined) {
    object(supplied.limits, 'policy.limits')
    for (const threshold of ['warning', 'hard']) {
      if (Object.prototype.hasOwnProperty.call(supplied.limits, threshold)) {
        throw new RangeError(
          `policy.limits.${threshold} is no longer supported; use policy.limits directly`
        )
      }
    }
    if (
      Object.prototype.hasOwnProperty.call(
        supplied.limits,
        'estimatedTimeMs'
      )
    ) {
      throw new RangeError(
        'policy.limits.estimatedTimeMs is no longer supported'
      )
    }
  }

  const merged = {
    ...DEFAULT_POLICY,
    ...supplied,
    errorBudget: {
      ...DEFAULT_POLICY.errorBudget,
      ...(supplied.errorBudget ?? {}),
    },
    display: {
      ...DEFAULT_POLICY.display,
      ...(supplied.display ?? {}),
    },
    limits: {
      ...DEFAULT_POLICY.limits,
      ...(supplied.limits ?? {}),
    },
  }

  if (!['published-bucket', 'full-tail'].includes(merged.scorePropagation)) {
    throw new RangeError(
      'policy.scorePropagation must be published-bucket or full-tail'
    )
  }
  nonNegativeInteger(merged.calculationMax, 'policy.calculationMax')

  probability(merged.errorBudget.total, 'policy.errorBudget.total')
  probability(merged.errorBudget.scoreTail, 'policy.errorBudget.scoreTail')
  if (merged.errorBudget.scoreTail > merged.errorBudget.total) {
    throw new RangeError(
      'policy.errorBudget.scoreTail must not exceed policy.errorBudget.total'
    )
  }

  nonNegativeInteger(merged.display.defaultMin, 'policy.display.defaultMin')
  nonNegativeInteger(merged.display.defaultMax, 'policy.display.defaultMax')
  nonNegativeInteger(merged.display.maxPoints, 'policy.display.maxPoints')
  if (merged.display.defaultMax < merged.display.defaultMin) {
    throw new RangeError(
      'policy.display.defaultMax must be greater than or equal to defaultMin'
    )
  }

  nonNegativeNumber(merged.limits.maxCpuWork, 'policy.limits.maxCpuWork')
  nonNegativeNumber(
    merged.limits.estimatedMemoryBytes,
    'policy.limits.estimatedMemoryBytes'
  )
  nonNegativeInteger(merged.limits.workingLength, 'policy.limits.workingLength')
  nonNegativeInteger(merged.limits.fftLength, 'policy.limits.fftLength')

  return merged
}

export function normalizeDisplay(display, policy) {
  const supplied = display ?? {}
  object(supplied, 'display')
  const min = supplied.min ?? policy.display.defaultMin
  const max = supplied.max ?? policy.display.defaultMax
  nonNegativeInteger(min, 'display.min')
  nonNegativeInteger(max, 'display.max')
  if (max < min) {
    throw new RangeError('display.max must be greater than or equal to display.min')
  }
  const points = max - min + 1
  if (!Number.isSafeInteger(points)) {
    throw new RangeError('display range is too large to represent safely')
  }
  return {
    min,
    max,
    points,
    overflowLowerBound: max === Number.MAX_SAFE_INTEGER
      ? Infinity
      : max + 1,
  }
}
