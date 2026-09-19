import {
  getDisplayRangePointCount,
  isDisplayMode,
  isDisplayCoordinate,
} from '../../../shared/validation/DisplayRangeRules'

/** @typedef {import('../../../domain/CalculationInputs').DisplayRequestSnapshot} DisplayRequestSnapshot */
/** @typedef {import('../../../calculation/planning/RangePlannerTypes').RangePolicyInput} RangePolicyInput */

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
  INVALID_POLICY: 'invalid-attack-range-policy',
})

export const DEFAULT_ATTACK_DISPLAY_REQUEST = Object.freeze({
  min: 0,
  max: 100,
  mode: ATTACK_DISPLAY_MODES.PMF,
})

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function clonePolicyValue(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (seen.has(value)) {
    return seen.get(value)
  }
  if (Array.isArray(value)) {
    const copy = []
    seen.set(value, copy)
    for (const entry of value) {
      copy.push(clonePolicyValue(entry, seen))
    }
    return copy
  }
  if (!isRecord(value)) {
    fail(
      ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_POLICY,
      'rangePolicy must contain only objects and arrays',
      { path: 'rangePolicy' }
    )
  }
  const copy = {}
  seen.set(value, copy)
  for (const [key, entry] of Object.entries(value)) {
    copy[key] = clonePolicyValue(entry, seen)
  }
  return copy
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return value
  }
  seen.add(value)
  for (const child of Object.values(value)) {
    deepFreeze(child, seen)
  }
  return Object.freeze(value)
}

function validateOptionalPolicyInteger(value, path) {
  if (value === undefined) {
    return
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(
      ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_POLICY,
      `${path} must be a non-negative safe integer`,
      { path, value }
    )
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
  if (!Object.prototype.hasOwnProperty.call(request, property)) {
    fail(
      ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_REQUEST,
      `displayRequest.${property} must be an own property`,
      { path: `displayRequest.${property}` }
    )
  }
  return request[property]
}

function normalizeCoordinate(value, property) {
  if (!isDisplayCoordinate(value)) {
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
  if (!isDisplayMode(value)) {
    fail(
      ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_MODE,
      'displayRequest.mode must be pmf or upper-tail',
      { path: 'displayRequest.mode', value }
    )
  }
  return value
}

/**
 * Normalize the display-only Attack boundary shared by future score and
 * damage requests. Calculation aliases and legacy 999 limits deliberately do
 * not belong to this value.
 */
export function normalizeAttackDisplayRequest(request) {
  if (!isRecord(request)) {
    fail(
      ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_REQUEST,
      'displayRequest must be an object',
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

  if (getDisplayRangePointCount(min, max) === null) {
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
/**
 * @param {DisplayRequestSnapshot} [request]
 * @returns {DisplayRequestSnapshot}
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

/**
 * Validate and snapshot the policy boundary for an Attack request. Display
 * requests are validated here for ownership, but their calculation coverage
 * is passed separately to the planner by the CalculationClient.
 */
/**
 * @param {DisplayRequestSnapshot} displayRequest
 * @param {RangePolicyInput} [suppliedPolicy]
 * @param {DisplayRequestSnapshot} [scoreDisplayRequest]
 * @returns {RangePolicyInput}
 */
export function createAttackRangePolicy(
  displayRequest,
  suppliedPolicy = {},
  scoreDisplayRequest
) {
  createAttackDisplayRequestSnapshot(displayRequest)
  if (!isRecord(suppliedPolicy)) {
    fail(
      ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_POLICY,
      'rangePolicy must be an object',
      { path: 'rangePolicy' }
    )
  }

  if (scoreDisplayRequest !== undefined && scoreDisplayRequest !== null) {
    createAttackDisplayRequestSnapshot(scoreDisplayRequest)
  }

  const policy = clonePolicyValue(suppliedPolicy)
  const suppliedDisplay = policy.display ?? {}
  if (!isRecord(suppliedDisplay)) {
    fail(
      ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_POLICY,
      'rangePolicy.display must be an object',
      { path: 'rangePolicy.display' }
    )
  }
  validateOptionalPolicyInteger(
    suppliedDisplay.maxPoints,
    'rangePolicy.display.maxPoints'
  )
  if (
    Object.prototype.hasOwnProperty.call(policy, 'calculationMax')
    || Object.prototype.hasOwnProperty.call(suppliedDisplay, 'defaultMin')
    || Object.prototype.hasOwnProperty.call(suppliedDisplay, 'defaultMax')
  ) {
    fail(
      ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_POLICY,
      'legacy calculation/display coverage fields are no longer supported; pass score display coverage as a planner request',
      { path: 'rangePolicy' }
    )
  }
  return deepFreeze(policy)
}
