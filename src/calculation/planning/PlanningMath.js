import {
  assertNonNegativeSafeInteger,
  assertSafeInteger,
} from '../../domain/InputDomain'

/**
 * Shared arithmetic and validation helpers for calculation-range planning.
 *
 * These helpers deliberately contain no operation-specific formulas or
 * resource policy. Keeping overflow checks here gives each planner the same
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

// Runtime damage-roll cost grows approximately with log(1 + kazanari). Keep
// the measured coefficient in one place so every operation planner uses the
// same estimate.
const KAZANARI_COST_LOG_COEFFICIENT = 15

export function getDamageKazanariCostFactor(kazanari) {
  return 1 + KAZANARI_COST_LOG_COEFFICIENT * Math.log1p(kazanari)
}
