import {
  CHECK_RANGE_POLICY_ERROR_CODE,
  createCheckRangePolicy,
} from '../../../runtime/CheckRangePolicy'
import { createCheckInputSnapshot } from './CheckInputSnapshot'

export const CHECK_DISPLAY_REQUEST_VERSION = 1

export const CHECK_DISPLAY_MODES = Object.freeze({
  PMF: 'pmf',
  UPPER_TAIL: 'upper-tail',
})

export const CHECK_DISPLAY_REQUEST_ERROR_CODES = Object.freeze({
  INVALID_REQUEST: 'invalid-display-request',
  INVALID_MIN: 'invalid-display-min',
  INVALID_MAX: 'invalid-display-max',
  INVALID_MODE: 'invalid-display-mode',
  INVALID_POLICY: CHECK_RANGE_POLICY_ERROR_CODE,
})

export const DEFAULT_CHECK_DISPLAY_REQUEST = Object.freeze({
  min: 0,
  max: 30,
  mode: CHECK_DISPLAY_MODES.PMF,
})

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function fail(code, message, details = {}) {
  const error = new TypeError(message)
  error.code = code
  error.details = Object.freeze({ ...details })
  throw error
}

function readOwn(request, property) {
  if (!Object.prototype.hasOwnProperty.call(request, property)) {
    fail(
      CHECK_DISPLAY_REQUEST_ERROR_CODES.INVALID_REQUEST,
      `displayRequest.${property} must be an own data property`,
      { path: `displayRequest.${property}` }
    )
  }
  const descriptor = Object.getOwnPropertyDescriptor(request, property)
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    fail(
      CHECK_DISPLAY_REQUEST_ERROR_CODES.INVALID_REQUEST,
      `displayRequest.${property} must be an own data property`,
      { path: `displayRequest.${property}` }
    )
  }
  return descriptor.value
}

function normalizeCoordinate(value, property) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(
      property === 'min'
        ? CHECK_DISPLAY_REQUEST_ERROR_CODES.INVALID_MIN
        : CHECK_DISPLAY_REQUEST_ERROR_CODES.INVALID_MAX,
      `displayRequest.${property} must be a non-negative safe integer`,
      { path: `displayRequest.${property}`, value }
    )
  }
  return value
}

function normalizeMode(value) {
  if (!Object.values(CHECK_DISPLAY_MODES).includes(value)) {
    fail(
      CHECK_DISPLAY_REQUEST_ERROR_CODES.INVALID_MODE,
      'displayRequest.mode must be a supported Check display mode',
      { path: 'displayRequest.mode', value }
    )
  }
  return value
}

/**
 * Normalize the display-only request boundary. It intentionally has no
 * calculation aliases such as `displayWindow` or `setting`; the returned
 * object is the only shape passed between the Check form and presentation.
 */
export function normalizeCheckDisplayRequest(request) {
  if (!isPlainRecord(request)) {
    fail(
      CHECK_DISPLAY_REQUEST_ERROR_CODES.INVALID_REQUEST,
      'displayRequest must be a plain record',
      { path: 'displayRequest' }
    )
  }
  const min = normalizeCoordinate(readOwn(request, 'min'), 'min')
  const max = normalizeCoordinate(readOwn(request, 'max'), 'max')
  if (min > max) {
    fail(
      CHECK_DISPLAY_REQUEST_ERROR_CODES.INVALID_REQUEST,
      'displayRequest.min must be less than or equal to displayRequest.max',
      { min, max }
    )
  }
  const pointCount = max - min + 1
  if (!Number.isSafeInteger(pointCount)) {
    fail(
      CHECK_DISPLAY_REQUEST_ERROR_CODES.INVALID_REQUEST,
      'displayRequest point count must be a safe integer',
      { min, max }
    )
  }
  return { min, max, mode: normalizeMode(readOwn(request, 'mode')) }
}

export function createCheckDisplayRequestSnapshot(request) {
  const normalized = normalizeCheckDisplayRequest(request)
  return Object.freeze({
    min: normalized.min,
    max: normalized.max,
    mode: normalized.mode,
  })
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return value
  }
  seen.add(value)
  for (const entry of Object.values(value)) {
    deepFreeze(entry, seen)
  }
  return Object.freeze(value)
}

/**
 * Make the complete, alias-free Check calculation request consumed by the
 * latest-wins runner. Existing createCheckInputSnapshot remains unchanged for
 * callers that only need calculation inputs.
 */
export function createCheckCalculationRequestSnapshot(draft = {}) {
  const displayRequest = createCheckDisplayRequestSnapshot(
    draft.displayRequest ?? DEFAULT_CHECK_DISPLAY_REQUEST
  )
  const input = createCheckInputSnapshot(draft)
  return deepFreeze({
    difficulty: input.difficulty,
    params: input.params,
    displayRequest,
    rangePolicy: createCheckRangePolicy(displayRequest, draft.rangePolicy),
  })
}
