import {
  getBacktrackRule,
} from '../../../domain/BacktrackRules'
import {
  validateDistributionResult,
} from '../../../calculation/DistributionResult'

export const BACKTRACK_PRESENTATION_VERSION = 1

export const BACKTRACK_PRESENTATION_ERROR_CODES = Object.freeze({
  INVALID_INPUT: 'invalid-input',
  INVALID_PARAMS: 'invalid-params',
  MISSING_RESULT: 'missing-result',
  INVALID_RESULT: 'invalid-result',
  INCOMPLETE_SUPPORT: 'incomplete-support',
  UNSUPPORTED_OVERFLOW: 'unsupported-overflow',
  UNEXPECTED_ERROR: 'unexpected-error',
})

const RESULT_KEYS = Object.freeze(['single', 'double', 'second'])

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property)
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

function freezeDetails(details) {
  return Object.freeze(isPlainRecord(details) ? { ...details } : {})
}

export class BacktrackPresentationError extends Error {
  constructor(code, message, details = {}, cause) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'BacktrackPresentationError'
    this.code = code
    this.details = freezeDetails(details)
    this.backtrackPresentation = true
    if (cause !== undefined && this.cause === undefined) {
      this.cause = cause
    }
  }
}

export class BacktrackPresentationValidationError
  extends BacktrackPresentationError {
  constructor(code, message, details = {}, cause) {
    super(code, message, details, cause)
    this.name = 'BacktrackPresentationValidationError'
    this.validation = true
  }
}

export function isBacktrackPresentationError(error) {
  return error?.backtrackPresentation === true
    && typeof error.code === 'string'
}

export function isBacktrackPresentationValidationError(error) {
  return isBacktrackPresentationError(error)
    && error.validation === true
}

function fail(code, message, details = {}) {
  throw new BacktrackPresentationValidationError(
    code,
    message,
    details
  )
}

function normalizeParams(params) {
  if (!isPlainRecord(params)) {
    fail(
      BACKTRACK_PRESENTATION_ERROR_CODES.INVALID_PARAMS,
      'backtrack params must be a plain record',
      { path: 'params' }
    )
  }

  const encroachment = params.encroachment ?? 0
  if (!Number.isSafeInteger(encroachment)) {
    fail(
      BACKTRACK_PRESENTATION_ERROR_CODES.INVALID_PARAMS,
      'params.encroachment must be a safe integer',
      { path: 'params.encroachment', value: encroachment }
    )
  }

  const value = params.value ?? 0
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(
      BACKTRACK_PRESENTATION_ERROR_CODES.INVALID_PARAMS,
      'params.value must be a non-negative safe integer',
      { path: 'params.value', value }
    )
  }

  const dlois = params.dlois ?? 'なし'
  if (typeof dlois !== 'string') {
    fail(
      BACKTRACK_PRESENTATION_ERROR_CODES.INVALID_PARAMS,
      'params.dlois must be a string',
      { path: 'params.dlois', value: dlois }
    )
  }

  return { encroachment, value, dlois }
}

function normalizeDistribution(Result, key) {
  if (!hasOwn(Result, key)) {
    fail(
      BACKTRACK_PRESENTATION_ERROR_CODES.MISSING_RESULT,
      `backtrack result is missing ${key}`,
      { path: key }
    )
  }

  const result = Result[key]
  try {
    validateDistributionResult(result)
  } catch (cause) {
    fail(
      BACKTRACK_PRESENTATION_ERROR_CODES.INVALID_RESULT,
      `backtrack ${key} is not a valid DistributionResult`,
      { path: key, causeCode: cause?.code },
    )
  }

  if (result.support?.kind !== 'finite') {
    fail(
      BACKTRACK_PRESENTATION_ERROR_CODES.INCOMPLETE_SUPPORT,
      `backtrack ${key} must have complete finite support`,
      { path: `${key}.support` }
    )
  }
  if (result.overflow !== null) {
    fail(
      BACKTRACK_PRESENTATION_ERROR_CODES.UNSUPPORTED_OVERFLOW,
      `backtrack ${key} must not contain overflow`,
      { path: `${key}.overflow` }
    )
  }

  const explicitMax = result.values.length === 0
    ? null
    : result.offset + result.values.length - 1
  if (explicitMax === null || result.support.max !== explicitMax) {
    fail(
      BACKTRACK_PRESENTATION_ERROR_CODES.INCOMPLETE_SUPPORT,
      `backtrack ${key} must explicitly cover its finite support`,
      {
        path: key,
        explicitMax,
        supportMax: result.support.max,
      }
    )
  }

  return result
}

function normalizeResults(Result) {
  if (!isPlainRecord(Result)) {
    fail(
      BACKTRACK_PRESENTATION_ERROR_CODES.INVALID_INPUT,
      'backtrack result must be a plain record',
      { path: 'Result' }
    )
  }

  const normalized = {}
  for (const key of RESULT_KEYS) {
    normalized[key] = normalizeDistribution(Result, key)
  }
  return normalized
}

function roundPercentage(probability) {
  const rounded = Math.round(probability * 1000) / 10
  return Object.is(rounded, -0) ? 0 : rounded
}

function aggregate(result, categoryCount, getCategory) {
  const buckets = Array.from({ length: categoryCount }, () => 0)
  for (let index = 0; index < result.values.length; index += 1) {
    const finalEncroachment = result.offset + index
    buckets[getCategory(finalEncroachment)] += result.values[index]
  }
  return Object.freeze(buckets.map(roundPercentage))
}

function getSingleCategory(finalEncroachment, nightmare) {
  const boundaries = nightmare
    ? [120, 100, 71, 51, 31]
    : [100, 71, 51, 31]
  const category = boundaries.findIndex((boundary) =>
    finalEncroachment >= boundary
  )
  return category >= 0 ? category : boundaries.length
}

function getBinaryCategory(finalEncroachment, nightmare) {
  return finalEncroachment >= (nightmare ? 120 : 100) ? 0 : 1
}

function createChartPayload(results, params) {
  const nightmare = getBacktrackRule(params.dlois).nightmare === true
  return Object.freeze({
    single: aggregate(
      results.single,
      nightmare ? 6 : 5,
      (finalEncroachment) => getSingleCategory(finalEncroachment, nightmare)
    ),
    double: aggregate(
      results.double,
      2,
      (finalEncroachment) => getBinaryCategory(finalEncroachment, nightmare)
    ),
    second: aggregate(
      results.second,
      2,
      (finalEncroachment) => getBinaryCategory(finalEncroachment, nightmare)
    ),
  })
}

/**
 * Convert complete backtrack PMFs into the legacy ChartSetter
 * payload. The result's `finalEncroachment` field intentionally has the
 * existing `{ single, double, second }` array shape; callers pass that field
 * to `getFinalEncroachmentChartData` without sending signed results through a
 * generic PMF/display adapter.
 */
export function createBacktrackPresentation(
  Result,
  params
) {
  try {
    if (arguments.length !== 2) {
      fail(
        BACKTRACK_PRESENTATION_ERROR_CODES.INVALID_INPUT,
        'createBacktrackPresentation expects Result and params',
        { path: 'arguments' }
      )
    }
    const normalizedParams = normalizeParams(params)
    const results = normalizeResults(Result)
    return Object.freeze({
      version: BACKTRACK_PRESENTATION_VERSION,
      kind: 'backtrack-canonical-presentation',
      finalEncroachment: createChartPayload(results, normalizedParams),
    })
  } catch (error) {
    if (isBacktrackPresentationError(error)) {
      throw error
    }
    throw new BacktrackPresentationError(
      BACKTRACK_PRESENTATION_ERROR_CODES.UNEXPECTED_ERROR,
      'backtrack presentation failed unexpectedly',
      {},
      error
    )
  }
}
