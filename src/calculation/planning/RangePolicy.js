import { OUTPUT_DISTRIBUTION_SIZE } from '../../core/probability/Distribution'
import { PUBLISHED_OVERFLOW_INDEX } from '../DistributionResult'
import {
  nonNegativeInteger,
  nonNegativeNumber,
  object,
  positiveNumber,
  probability,
} from './PlanningMath'

const DEFAULT_ERROR_BUDGET = 1e-8
const PUBLISHED_SCORE_MAX_INDEX = OUTPUT_DISTRIBUTION_SIZE - 1
const LEGACY_CALCULATION_MAX = PUBLISHED_OVERFLOW_INDEX - 1

function getPublishedScoreUpperBound(calculationMax) {
  return Math.max(calculationMax + 1, PUBLISHED_SCORE_MAX_INDEX)
}

/**
 * The default keeps the current published-bucket contract and display range.
 * Resource thresholds are provisional policy inputs, not UI input limits.
 */
export const DEFAULT_POLICY = {
  // Preserve the current public-score-to-damage contract.
  scorePropagation: 'published-bucket',
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
    warning: {
      estimatedTimeMs: 50,
      estimatedMemoryBytes: 32 * 1024 * 1024,
      workingLength: 8192,
      fftLength: 16384,
    },
    hard: {
      estimatedTimeMs: 200,
      estimatedMemoryBytes: 64 * 1024 * 1024,
      workingLength: 16384,
      fftLength: 32768,
    },
  },
  // These coefficients remain injectable until the supported device matrix
  // has been calibrated with production measurements.
  costModel: {
    dxOperationsPerMs: 1_000_000,
    fftOperationsPerMs: 8_000_000,
    damageOperationsPerMs: 250_000,
    backtrackOperationsPerMs: 1_000_000,
  },
}

export { getPublishedScoreUpperBound }

export function mergePolicy(policy) {
  const supplied = policy ?? {}
  object(supplied, 'policy')

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
      warning: {
        ...DEFAULT_POLICY.limits.warning,
        ...(supplied.limits?.warning ?? {}),
      },
      hard: {
        ...DEFAULT_POLICY.limits.hard,
        ...(supplied.limits?.hard ?? {}),
      },
    },
    costModel: {
      ...DEFAULT_POLICY.costModel,
      ...(supplied.costModel ?? {}),
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

  const metricNames = [
    'estimatedTimeMs',
    'estimatedMemoryBytes',
    'workingLength',
    'fftLength',
  ]
  for (const thresholdName of ['warning', 'hard']) {
    for (const metricName of ['estimatedTimeMs', 'estimatedMemoryBytes']) {
      nonNegativeNumber(
        merged.limits[thresholdName][metricName],
        `policy.limits.${thresholdName}.${metricName}`
      )
    }
    for (const metricName of ['workingLength', 'fftLength']) {
      nonNegativeInteger(
        merged.limits[thresholdName][metricName],
        `policy.limits.${thresholdName}.${metricName}`
      )
    }
  }
  for (const metricName of metricNames) {
    if (
      merged.limits.warning[metricName] >
      merged.limits.hard[metricName]
    ) {
      throw new RangeError(
        `policy.limits.warning.${metricName} must not exceed the hard limit`
      )
    }
  }

  for (const name of [
    'dxOperationsPerMs',
    'fftOperationsPerMs',
    'damageOperationsPerMs',
    'backtrackOperationsPerMs',
  ]) {
    positiveNumber(merged.costModel[name], `policy.costModel.${name}`)
  }

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
