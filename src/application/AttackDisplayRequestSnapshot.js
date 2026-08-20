export const ATTACK_DISPLAY_REQUEST_VERSION = 1

export const ATTACK_DISPLAY_MODES = Object.freeze({
  PMF: 'pmf',
  UPPER_TAIL: 'upper-tail',
})

export const ATTACK_DISPLAY_REQUEST_ERROR_CODES = Object.freeze({
  INVALID_REQUEST: 'invalid-attack-display-request',
  INVALID_MIN: 'invalid-attack-display-min',
  INVALID_MAX: 'invalid-attack-display-max',
  INVALID_MODE: 'invalid-attack-display-mode',
  INVALID_POINT_COUNT: 'invalid-attack-display-point-count',
})

export const DEFAULT_ATTACK_DISPLAY_REQUEST = Object.freeze({
  min: 0,
  max: 100,
  mode: ATTACK_DISPLAY_MODES.PMF,
})

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object') {
    return false
  }
  try {
    if (Array.isArray(value)) {
      return false
    }
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

function fail(code, message, details = {}) {
  const error = new TypeError(message)
  error.code = code
  error.details = Object.freeze({ ...details })
  error.attackDisplayRequest = true
  throw error
}

function readOwn(request, property) {
  let hasProperty
  try {
    hasProperty = Object.prototype.hasOwnProperty.call(request, property)
  } catch {
    fail(
      ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_REQUEST,
      `displayRequest.${property} could not be inspected safely`,
      { path: `displayRequest.${property}` }
    )
  }
  if (!hasProperty) {
    fail(
      ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_REQUEST,
      `displayRequest.${property} must be an own data property`,
      { path: `displayRequest.${property}` }
    )
  }

  let descriptor
  try {
    descriptor = Object.getOwnPropertyDescriptor(request, property)
  } catch {
    fail(
      ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_REQUEST,
      `displayRequest.${property} could not be inspected safely`,
      { path: `displayRequest.${property}` }
    )
  }
  if (
    descriptor === undefined
    || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    || descriptor.enumerable !== true
  ) {
    fail(
      ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_REQUEST,
      `displayRequest.${property} must be an enumerable data property`,
      { path: `displayRequest.${property}` }
    )
  }
  return descriptor.value
}

function normalizeCoordinate(value, property) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(
      property === 'min'
        ? ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_MIN
        : ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_MAX,
      `displayRequest.${property} must be a non-negative safe integer`,
      { path: `displayRequest.${property}`, value }
    )
  }
  return value
}

function normalizeMode(value) {
  if (!Object.values(ATTACK_DISPLAY_MODES).includes(value)) {
    fail(
      ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_MODE,
      'displayRequest.mode must be pmf or upper-tail',
      { path: 'displayRequest.mode', value }
    )
  }
  return value
}

/**
 * Normalize the display-only Attack boundary shared by future Score and
 * Damage requests. Calculation aliases and legacy 999 limits deliberately do
 * not belong to this value.
 */
export function normalizeAttackDisplayRequest(request) {
  if (!isPlainRecord(request)) {
    fail(
      ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_REQUEST,
      'displayRequest must be a plain record',
      { path: 'displayRequest' }
    )
  }

  const min = normalizeCoordinate(readOwn(request, 'min'), 'min')
  const max = normalizeCoordinate(readOwn(request, 'max'), 'max')
  if (min > max) {
    fail(
      ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_REQUEST,
      'displayRequest.min must be less than or equal to displayRequest.max',
      { min, max }
    )
  }

  const pointCount = max - min + 1
  if (!Number.isSafeInteger(pointCount)) {
    fail(
      ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_POINT_COUNT,
      'displayRequest point count must be a safe integer',
      { min, max }
    )
  }

  return {
    min,
    max,
    mode: normalizeMode(readOwn(request, 'mode')),
  }
}

/**
 * Create an alias-free, deeply immutable display request snapshot.
 */
export function createAttackDisplayRequestSnapshot(
  request = DEFAULT_ATTACK_DISPLAY_REQUEST
) {
  const normalized = normalizeAttackDisplayRequest(request)
  return Object.freeze({
    min: normalized.min,
    max: normalized.max,
    mode: normalized.mode,
  })
}
