import {
  nonNegativeNumber,
  nonNegativeInteger,
  object,
  probability,
  DEFAULT_MAX_CPU_WORK,
} from './PlanningMath'
import type {
  RangeDisplayPlan,
  RangePolicy,
  RangePolicyInput,
} from './RangePlannerTypes'

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

function rejectUnknownKeys(
  value: unknown,
  path: string,
  allowedKeys: readonly string[],
): void {
  object(value, path)
  const allowed = new Set(allowedKeys)
  for (const key of Reflect.ownKeys(value as object)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw new RangeError(
        `${path}.${String(key)} is not a supported range policy key`
      )
    }
  }
}

export function mergePolicy(policy?: RangePolicyInput | null): RangePolicy {
  const supplied = policy ?? {}
  object(supplied, 'policy')
  rejectUnknownKeys(supplied, 'policy', [
    'errorBudget',
    'display',
    'limits',
  ])
  const errorBudget = supplied.errorBudget ?? {}
  const display = supplied.display ?? {}
  const limits = supplied.limits ?? {}
  rejectUnknownKeys(errorBudget, 'policy.errorBudget', ['total', 'scoreTail'])
  rejectUnknownKeys(display, 'policy.display', ['maxPoints'])
  rejectUnknownKeys(limits, 'policy.limits', [
    'maxCpuWork',
    'estimatedMemoryBytes',
    'workingLength',
    'fftLength',
  ])

  const merged = {
    ...DEFAULT_POLICY,
    ...supplied,
    errorBudget: {
      ...DEFAULT_POLICY.errorBudget,
      ...errorBudget,
    },
    display: {
      ...DEFAULT_POLICY.display,
      ...display,
    },
    limits: {
      ...DEFAULT_POLICY.limits,
      ...limits,
    },
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

export function normalizeDisplay(
  display?: Readonly<{ min?: number; max?: number }> | null,
): RangeDisplayPlan {
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
