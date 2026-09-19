const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER
const DAMAGE_AGGREGATION_PLAN_VERSION = 1

// Values and FFT length share the existing runtime ceiling. The aggregation
// options may lower these values for a caller, but never raise any absolute
// safety ceiling.
export const DAMAGE_AGGREGATION_MAX_VALUES_LENGTH = 1 << 20
export const DAMAGE_AGGREGATION_MAX_FFT_LENGTH = 1 << 20
export const DAMAGE_AGGREGATION_MAX_RESOURCE_BYTES = 512 * 1024 * 1024
export const DAMAGE_AGGREGATION_MAX_COMPONENTS = 1 << 12

export const DAMAGE_AGGREGATION_NUMERICAL_EPSILON = 1e-12

export const DAMAGE_AGGREGATION_LIMITS = Object.freeze({
  maxValuesLength: DAMAGE_AGGREGATION_MAX_VALUES_LENGTH,
  maxFftLength: DAMAGE_AGGREGATION_MAX_FFT_LENGTH,
  maxResourceBytes: DAMAGE_AGGREGATION_MAX_RESOURCE_BYTES,
  maxComponents: DAMAGE_AGGREGATION_MAX_COMPONENTS,
})

export const DAMAGE_AGGREGATION_ERROR_CODES = Object.freeze({
  INVALID_ENVELOPE: 'invalid-envelope',
  INVALID_OPTIONS: 'invalid-options',
  INDEX_OVERFLOW: 'index-overflow',
  RESOURCE_LIMIT: 'resource-limit',
  NUMERICAL_FAILURE: 'numerical-failure',
  ABORTED: 'aborted',
})

export function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property)
}

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function freezeDetails(details) {
  return Object.freeze(isRecord(details) ? { ...details } : {})
}

export class DamageAggregationError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'DamageAggregationError'
    this.code = code
    this.details = freezeDetails(details)
    this.DamageAggregation = true
  }
}

export class DamageAggregationAbortError extends DamageAggregationError {
  constructor(message = ' damage aggregation was aborted', details = {}) {
    super(
      DAMAGE_AGGREGATION_ERROR_CODES.ABORTED,
      message,
      details
    )
    this.name = 'AbortError'
    this.aborted = true
  }
}

export function isDamageAggregationError(error) {
  return error?.DamageAggregation === true
    && typeof error.code === 'string'
}

export function isDamageAggregationAbortError(error) {
  return isDamageAggregationError(error)
    && error.code === DAMAGE_AGGREGATION_ERROR_CODES.ABORTED
}

export function fail(code, message, details = {}) {
  throw new DamageAggregationError(code, message, details)
}

export function failIndex(message, details = {}) {
  fail(
    DAMAGE_AGGREGATION_ERROR_CODES.INDEX_OVERFLOW,
    message,
    details
  )
}

export function failResource(message, details = {}) {
  fail(
    DAMAGE_AGGREGATION_ERROR_CODES.RESOURCE_LIMIT,
    message,
    details
  )
}

export function failNumerical(message, details = {}) {
  fail(
    DAMAGE_AGGREGATION_ERROR_CODES.NUMERICAL_FAILURE,
    message,
    details
  )
}

export function checkAbort(signal) {
  if (signal?.aborted) {
    throw new DamageAggregationAbortError()
  }
}

function validateOptionLimit(value, name, absolute, allowZero = true) {
  if (!Number.isSafeInteger(value) || (allowZero ? value < 0 : value <= 0)) {
    fail(
      DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS,
      `${name} must be a ${allowZero ? 'non-negative' : 'positive'} safe integer`,
      { name, value }
    )
  }
  if (value > absolute) {
    fail(
      DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS,
      `${name} must not exceed the absolute safety limit of ${absolute}`,
      { name, value, absolute }
    )
  }
  return value
}

export function normalizeOptions(options, allowPlan = false) {
  if (options === undefined) {
    options = {}
  }
  if (!isRecord(options)) {
    fail(
      DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS,
      'damage aggregation options must be an object'
    )
  }

  const allowedOptionNames = new Set([
    'maxValuesLength',
    'maxFftLength',
    'maxResourceBytes',
    'maxComponents',
    'signal',
    'onFftLength',
  ])
  if (allowPlan) {
    allowedOptionNames.add('plan')
  }
  for (const name of Reflect.ownKeys(options)) {
    if (typeof name !== 'string' || !allowedOptionNames.has(name)) {
      const displayName = typeof name === 'symbol' ? name.toString() : name
      fail(
        DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS,
        `unknown damage aggregation option: ${displayName}`,
        { name: displayName }
      )
    }
  }

  const maxValuesLength = validateOptionLimit(
    hasOwn(options, 'maxValuesLength')
      ? options.maxValuesLength
      : DAMAGE_AGGREGATION_MAX_VALUES_LENGTH,
    'maxValuesLength',
    DAMAGE_AGGREGATION_MAX_VALUES_LENGTH
  )
  const maxFftLength = validateOptionLimit(
    hasOwn(options, 'maxFftLength')
      ? options.maxFftLength
      : DAMAGE_AGGREGATION_MAX_FFT_LENGTH,
    'maxFftLength',
    DAMAGE_AGGREGATION_MAX_FFT_LENGTH
  )
  const maxResourceBytes = validateOptionLimit(
    hasOwn(options, 'maxResourceBytes')
      ? options.maxResourceBytes
      : DAMAGE_AGGREGATION_MAX_RESOURCE_BYTES,
    'maxResourceBytes',
    DAMAGE_AGGREGATION_MAX_RESOURCE_BYTES
  )
  const maxComponents = validateOptionLimit(
    hasOwn(options, 'maxComponents')
      ? options.maxComponents
      : DAMAGE_AGGREGATION_MAX_COMPONENTS,
    'maxComponents',
    DAMAGE_AGGREGATION_MAX_COMPONENTS
  )

  const signal = options.signal ?? null
  if (
    signal !== null
    && (typeof signal !== 'object' || typeof signal.aborted !== 'boolean')
  ) {
    fail(
      DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS,
      'options.signal must be an AbortSignal-like object',
      { signal }
    )
  }

  const onFftLength = options.onFftLength
  if (onFftLength !== undefined && typeof onFftLength !== 'function') {
    fail(
      DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS,
      'options.onFftLength must be a function when supplied'
    )
  }

  return Object.freeze({
    maxValuesLength,
    maxFftLength,
    maxResourceBytes,
    maxComponents,
    signal,
    onFftLength,
    plan: allowPlan && hasOwn(options, 'plan') ? options.plan : null,
  })
}

export { DAMAGE_AGGREGATION_PLAN_VERSION, MAX_SAFE_INTEGER }
