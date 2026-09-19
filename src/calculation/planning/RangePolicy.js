import {
  nonNegativeNumber,
  nonNegativeInteger,
  object,
  probability,
  DEFAULT_MAX_CPU_WORK,
} from './PlanningMath'

const DEFAULT_ERROR_BUDGET = 1e-8

/**
 * The default propagates the complete canonical score tail. Resource
 * thresholds are provisional policy inputs, not UI input limits.
 */
export const DEFAULT_POLICY = {
  errorBudget: {
    total: DEFAULT_ERROR_BUDGET,
    scoreTail: 8e-9,
  },
  display: {
    maxPoints: Number.MAX_SAFE_INTEGER,
  },
  limits: {
    maxCpuWork: DEFAULT_MAX_CPU_WORK,
    estimatedMemoryBytes: 64 * 1024 * 1024,
    workingLength: 16384,
    fftLength: 32768,
  },
}

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

  if (Object.prototype.hasOwnProperty.call(supplied, 'scorePropagation')) {
    throw new RangeError(
      'policy.scorePropagation is no longer supported; production uses canonical full-tail propagation'
    )
  }
  if (Object.prototype.hasOwnProperty.call(supplied, 'calculationMax')) {
    throw new RangeError(
      'policy.calculationMax is no longer supported; use explicit display coverage and the tail budget'
    )
  }
  for (const legacyDisplayKey of ['defaultMin', 'defaultMax']) {
    if (
      supplied.display !== undefined
      && Object.prototype.hasOwnProperty.call(supplied.display, legacyDisplayKey)
    ) {
      throw new RangeError(
        `policy.display.${legacyDisplayKey} is no longer supported; pass a display request to the planner`
      )
    }
  }

  probability(merged.errorBudget.total, 'policy.errorBudget.total')
  probability(merged.errorBudget.scoreTail, 'policy.errorBudget.scoreTail')
  if (merged.errorBudget.scoreTail > merged.errorBudget.total) {
    throw new RangeError(
      'policy.errorBudget.scoreTail must not exceed policy.errorBudget.total'
    )
  }

  nonNegativeInteger(merged.display.maxPoints, 'policy.display.maxPoints')

  nonNegativeNumber(merged.limits.maxCpuWork, 'policy.limits.maxCpuWork')
  nonNegativeNumber(
    merged.limits.estimatedMemoryBytes,
    'policy.limits.estimatedMemoryBytes'
  )
  nonNegativeInteger(merged.limits.workingLength, 'policy.limits.workingLength')
  nonNegativeInteger(merged.limits.fftLength, 'policy.limits.fftLength')

  return merged
}

export function normalizeDisplay(display) {
  const supplied = display ?? {}
  object(supplied, 'display')
  const min = supplied.min ?? 0
  const max = supplied.max ?? min
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
