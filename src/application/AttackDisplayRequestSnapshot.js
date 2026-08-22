import {
  LEGACY_PUBLISHED_OVERFLOW_INDEX,
} from '../calculation/DistributionResult'

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

const LEGACY_SAFE_CALCULATION_MAX = LEGACY_PUBLISHED_OVERFLOW_INDEX - 1

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
  if (!isPlainRecord(value)) {
    fail(
      ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_POLICY,
      'rangePolicy must contain only plain records and arrays',
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

/**
 * Expand the calculation range policy only when an Attack display request
 * needs coverage beyond the published calculation boundary. When a Score
 * request is supplied, the policy covers the envelope of both display
 * requests so a Score-only expansion cannot shrink the current Damage
 * coverage (and vice versa). The independent DisplayRangePlanner remains
 * responsible for display resource rejection; this policy only carries the
 * accepted requests into RangePlanner.
 */
export function createAttackRangePolicy(
  displayRequest,
  suppliedPolicy = {},
  scoreDisplayRequest
) {
  const display = createAttackDisplayRequestSnapshot(displayRequest)
  if (!isPlainRecord(suppliedPolicy)) {
    fail(
      ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_POLICY,
      'rangePolicy must be a plain record',
      { path: 'rangePolicy' }
    )
  }

  // Keep the optional second display request out of the RangePlanner policy
  // itself. Accepting it as a third argument keeps the existing
  // createAttackRangePolicy(request, policy) contract intact while allowing
  // callers to compose the Damage and Score request snapshots explicitly.
  let policyInput = suppliedPolicy
  let composedScoreDisplayRequest = scoreDisplayRequest
  if (
    composedScoreDisplayRequest === undefined
    && Object.prototype.hasOwnProperty.call(
      suppliedPolicy,
      'scoreDisplayRequest'
    )
  ) {
    composedScoreDisplayRequest = suppliedPolicy.scoreDisplayRequest
    policyInput = {}
    for (const [key, value] of Object.entries(suppliedPolicy)) {
      if (key !== 'scoreDisplayRequest') {
        policyInput[key] = value
      }
    }
  }

  const policy = clonePolicyValue(policyInput)
  const score = composedScoreDisplayRequest === undefined
    ? null
    : composedScoreDisplayRequest === null
      ? null
      : createAttackDisplayRequestSnapshot(composedScoreDisplayRequest)
  const requests = score === null ? [display] : [display, score]
  const suppliedCalculationMax = policy.calculationMax
  validateOptionalPolicyInteger(
    suppliedCalculationMax,
    'rangePolicy.calculationMax'
  )
  const suppliedDisplay = policy.display ?? {}
  if (!isPlainRecord(suppliedDisplay)) {
    fail(
      ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_POLICY,
      'rangePolicy.display must be a plain record',
      { path: 'rangePolicy.display' }
    )
  }
  validateOptionalPolicyInteger(
    suppliedDisplay.maxPoints,
    'rangePolicy.display.maxPoints'
  )

  const suppliedDefaultMin = score !== null
    && Number.isSafeInteger(suppliedDisplay.defaultMin)
    && suppliedDisplay.defaultMin >= 0
    ? suppliedDisplay.defaultMin
    : null
  const suppliedDefaultMax = score !== null
    && Number.isSafeInteger(suppliedDisplay.defaultMax)
    && suppliedDisplay.defaultMax >= 0
    ? suppliedDisplay.defaultMax
    : null
  const defaultMin = Math.min(
    ...requests.map((request) => request.min),
    ...(suppliedDefaultMin === null ? [] : [suppliedDefaultMin])
  )
  const defaultMax = Math.max(
    ...requests.map((request) => request.max),
    ...(suppliedDefaultMax === null ? [] : [suppliedDefaultMax])
  )
  const pointCount = defaultMax - defaultMin + 1
  if (!Number.isSafeInteger(pointCount)) {
    fail(
      ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_POLICY,
      'rangePolicy.display point count must be a safe integer',
      { path: 'rangePolicy.display', defaultMin, defaultMax }
    )
  }
  policy.calculationMax = Math.max(
    suppliedCalculationMax ?? LEGACY_SAFE_CALCULATION_MAX,
    defaultMax,
    LEGACY_SAFE_CALCULATION_MAX
  )
  policy.display = {
    ...suppliedDisplay,
    defaultMin,
    defaultMax,
    // RangePlanner's display guard is not a second UI input limit. The
    // independent DisplayRangePlanner has already checked this window.
    maxPoints: Math.max(suppliedDisplay.maxPoints ?? 0, pointCount),
  }
  return deepFreeze(policy)
}
