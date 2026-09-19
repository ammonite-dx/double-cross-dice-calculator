import {
  DISTRIBUTION_RESULT_ERROR_CODES,
  createDistributionResult,
  validateDistributionResult,
} from '../../src/calculation/DistributionResult'

/**
 * Reference-only compatibility for the original 1024-bucket publication
 * format. Production calculation code must consume DistributionResult
 * directly; this module exists for historical assets, migration comparisons,
 * and regression tests.
 */
export const PUBLISHED_BUCKET_LENGTH = 1024
export const PUBLISHED_OVERFLOW_INDEX = PUBLISHED_BUCKET_LENGTH - 1

export function isDistributionResultAdapterError(error) {
  return error?.adapter === true && typeof error.code === 'string'
}

export class DistributionResultAdapterError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'DistributionResultAdapterError'
    this.code = code
    this.details = Object.freeze({ ...details })
    this.adapter = true
  }
}

export const PUBLISHED_BUCKET_ERROR_CODES = Object.freeze({
  LEGACY_INPUT: 'legacy-input',
  LEGACY_LENGTH: 'legacy-length',
  LEGACY_SUPPORT_REQUIRED: 'legacy-support-required',
  LEGACY_LENGTH_OPTION: 'legacy-length-option',
  UPPER_BOUND_PROJECTION: 'upper-bound-projection',
  UNSAFE_PROJECTION: 'unsafe-projection',
})

function failAdapter(code, message, details = {}) {
  throw new DistributionResultAdapterError(code, message, details)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validateLegacyInputValues(distribution) {
  if (!(Array.isArray(distribution) || distribution instanceof Float64Array)) {
    failAdapter(
      PUBLISHED_BUCKET_ERROR_CODES.LEGACY_INPUT,
      'legacy published distribution must be an Array or Float64Array'
    )
  }
  if (distribution.length !== PUBLISHED_BUCKET_LENGTH) {
    failAdapter(
      PUBLISHED_BUCKET_ERROR_CODES.LEGACY_LENGTH,
      `legacy published distribution must have ${PUBLISHED_BUCKET_LENGTH} entries`,
      { length: distribution.length }
    )
  }

  for (let index = 0; index < distribution.length; index += 1) {
    const value = distribution[index]
    if (!Number.isFinite(value)) {
      failAdapter(
        DISTRIBUTION_RESULT_ERROR_CODES.NON_FINITE_PROBABILITY,
        'legacy published distribution must contain finite probabilities',
        { index, value }
      )
    }
    if (value < 0) {
      failAdapter(
        DISTRIBUTION_RESULT_ERROR_CODES.NEGATIVE_PROBABILITY,
        'legacy published distribution must contain non-negative probabilities',
        { index, value }
      )
    }
    if (value > 1) {
      failAdapter(
        DISTRIBUTION_RESULT_ERROR_CODES.PROBABILITY_ABOVE_ONE,
        'legacy published distribution probabilities must not exceed one',
        { index, value }
      )
    }
  }
  return distribution
}

/** Convert a historical 1024-bucket array into a canonical result. */
export function fromPublishedBucketDistribution(distribution, options) {
  const legacyValues = validateLegacyInputValues(distribution)
  if (!isRecord(options) || !Object.prototype.hasOwnProperty.call(options, 'support')) {
    failAdapter(
      PUBLISHED_BUCKET_ERROR_CODES.LEGACY_SUPPORT_REQUIRED,
      'legacy conversion requires explicit options.support'
    )
  }

  const explicitValues = new Float64Array(PUBLISHED_OVERFLOW_INDEX)
  for (let index = 0; index < explicitValues.length; index += 1) {
    explicitValues[index] = legacyValues[index]
  }

  return createDistributionResult({
    values: explicitValues,
    offset: 0,
    support: options.support,
    overflow: {
      kind: 'exact',
      lowerBound: PUBLISHED_OVERFLOW_INDEX,
      probability: legacyValues[PUBLISHED_OVERFLOW_INDEX],
      errorBound: 0,
    },
  })
}

function normalizeLegacyOutputLength(options) {
  if (options === undefined) {
    return PUBLISHED_BUCKET_LENGTH
  }
  if (!isRecord(options)) {
    failAdapter(
      PUBLISHED_BUCKET_ERROR_CODES.LEGACY_LENGTH_OPTION,
      'legacy output options must be an object'
    )
  }
  const length = options.length === undefined
    ? PUBLISHED_BUCKET_LENGTH
    : options.length
  if (
    !Number.isSafeInteger(length)
    || length !== PUBLISHED_BUCKET_LENGTH
  ) {
    failAdapter(
      PUBLISHED_BUCKET_ERROR_CODES.LEGACY_LENGTH_OPTION,
      `legacy output length must be ${PUBLISHED_BUCKET_LENGTH}`,
      { length }
    )
  }
  return length
}

function hasPotentialOverflowMass(overflow) {
  return overflow !== null
    && (
      overflow.errorBound > 0
      || (
        overflow.kind === 'exact'
          ? overflow.probability > 0
          : overflow.probabilityUpperBound > 0
      )
    )
}

function validateExactOverflowProjection(overflow) {
  if (overflow === null || overflow.kind === 'upper-bound') {
    return
  }
  if (overflow.lowerBound >= PUBLISHED_OVERFLOW_INDEX) {
    return
  }
  if (!hasPotentialOverflowMass(overflow)) {
    return
  }
  failAdapter(
    PUBLISHED_BUCKET_ERROR_CODES.UNSAFE_PROJECTION,
    'exact overflow with potential mass below the legacy overflow bucket cannot be projected safely',
    {
      lowerBound: overflow.lowerBound,
      probability: overflow.probability,
      errorBound: overflow.errorBound,
      legacyOverflowIndex: PUBLISHED_OVERFLOW_INDEX,
    }
  )
}

/** Convert a canonical result to a fresh historical 1024-bucket array. */
export function toPublishedBucketDistribution(result, options) {
  const length = normalizeLegacyOutputLength(options)
  validateDistributionResult(result)
  const { values, offset, overflow } = result

  if (offset < 0) {
    failAdapter(
      PUBLISHED_BUCKET_ERROR_CODES.UNSAFE_PROJECTION,
      'distribution values below zero cannot be projected to legacy buckets without clamping',
      { offset }
    )
  }

  if (overflow?.kind === 'upper-bound') {
    failAdapter(
      PUBLISHED_BUCKET_ERROR_CODES.UPPER_BOUND_PROJECTION,
      'upper-bound overflow is not an actual probability and cannot be projected to legacy buckets',
      { probabilityUpperBound: overflow.probabilityUpperBound }
    )
  }

  validateExactOverflowProjection(overflow)

  const published = new Float64Array(length)
  for (let index = 0; index < values.length; index += 1) {
    const value = offset + index
    const target = value >= PUBLISHED_OVERFLOW_INDEX
      ? PUBLISHED_OVERFLOW_INDEX
      : value
    published[target] += values[index]
  }

  if (overflow !== null) {
    published[PUBLISHED_OVERFLOW_INDEX] += overflow.probability
  }
  return published
}
