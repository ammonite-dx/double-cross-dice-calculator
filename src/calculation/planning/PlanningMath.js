import {
  assertNonNegativeSafeInteger,
  assertSafeInteger,
} from '../../domain/InputDomain'

/**
 * Shared arithmetic, FFT cost estimates, and production cost-policy constants
 * for calculation-range planning.
 *
 * These helpers deliberately contain no operation-specific formulas. Keeping
 * overflow checks and shared cost assumptions here gives each planner the same
 * safe-integer behavior without making the RangePlanner façade a dependency.
 */

export function integer(value, name) {
  return assertSafeInteger(value, name)
}

export function addSafe(left, right, name) {
  const result = left + right
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${name} exceeds the safe integer range`)
  }
  return result
}

export function subtractSafe(left, right, name) {
  const result = left - right
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${name} exceeds the safe integer range`)
  }
  return result
}

export function multiplySafe(left, right, name) {
  const result = left * right
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new RangeError(`${name} exceeds the safe integer range`)
  }
  return result
}

export function nonNegativeInteger(value, name) {
  return assertNonNegativeSafeInteger(value, name)
}

export function positiveInteger(value, name) {
  integer(value, name)
  if (value <= 0) {
    throw new RangeError(`${name} must be positive`)
  }
  return value
}

export function positiveNumber(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`)
  }
  return value
}

export function nonNegativeNumber(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number`)
  }
  return value
}

export function probability(value, name) {
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    throw new RangeError(`${name} must be between 0 and 1`)
  }
  return value
}

export function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`)
  }
  return value
}

export function nextPowerOfTwo(value) {
  positiveInteger(value, 'value')
  let result = 1
  while (result < value) {
    if (result > Number.MAX_SAFE_INTEGER / 2) {
      throw new RangeError('value is too large for a power-of-two length')
    }
    result *= 2
  }
  return result
}

export function fftOperationCount(length) {
  if (!length) {
    return 0
  }
  return 3 * length * Math.log2(length)
}

/**
 * Device-independent application CPU budget. This is a work unit, not a
 * promise about elapsed time on any particular device.
 */
export const DEFAULT_MAX_CPU_WORK = 1_600_000_000

/**
 * Fixed weights for the operation-specific work estimates. Keep these
 * weights in one place so every planner shares the same admission contract.
 */
export const CPU_WORK_WEIGHTS = Object.freeze({
  score: 8,
  damage: 32,
  defenceD10: 32,
  fft: 1,
  backtrack: 16,
})

function weightedCpuWork(value, weight, name) {
  const normalized = nonNegativeNumber(value, name)
  const result = normalized * weight
  if (!Number.isFinite(result) || result < 0) {
    throw new RangeError(`${name} CPU work exceeds the finite range`)
  }
  return result
}

/**
 * Combine operation-specific estimates into the shared CPU work unit.
 * Inputs may be fractional because some kernel estimates use a continuous
 * cost model; the result is nevertheless required to be finite and
 * non-negative. Overflow fails closed instead of admitting an unbounded
 * request.
 */
export function calculateCpuWork({
  scoreOperations = 0,
  damageOperations = 0,
  defenceD10Operations = 0,
  fftOperations = 0,
  backtrackOperations = 0,
} = {}) {
  const components = [
    weightedCpuWork(
      scoreOperations,
      CPU_WORK_WEIGHTS.score,
      'scoreOperations'
    ),
    weightedCpuWork(
      damageOperations,
      CPU_WORK_WEIGHTS.damage,
      'damageOperations'
    ),
    weightedCpuWork(
      defenceD10Operations,
      CPU_WORK_WEIGHTS.defenceD10,
      'defenceD10Operations'
    ),
    weightedCpuWork(fftOperations, CPU_WORK_WEIGHTS.fft, 'fftOperations'),
    weightedCpuWork(
      backtrackOperations,
      CPU_WORK_WEIGHTS.backtrack,
      'backtrackOperations'
    ),
  ]
  let total = 0
  for (const component of components) {
    total += component
    if (!Number.isFinite(total) || total < 0) {
      throw new RangeError('CPU work exceeds the finite range')
    }
  }
  return total
}
