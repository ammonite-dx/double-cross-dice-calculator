import { getUpperTailProbability } from '../data/Distribution'
import {
  DISTRIBUTION_RESULT_ERROR_CODES,
  DistributionResultAdapterError,
  isDistributionResultAdapterError,
  LEGACY_PUBLISHED_BUCKET_LENGTH,
  toPublishedBucketDistribution,
} from '../calculation/DistributionResult'

export const CANONICAL_LEGACY_DISPLAY_NOT_PROJECTABLE_REASONS = Object.freeze({
  INVALID_ENVELOPE: 'invalid-envelope',
  UPPER_BOUND_OVERFLOW: 'upper-bound-overflow',
  UNSAFE_EXACT_OVERFLOW: 'unsafe-exact-overflow',
})

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property)
}

function failInvalidEnvelope(message, details = {}) {
  throw new DistributionResultAdapterError(
    DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SCHEMA,
    message,
    details
  )
}

function requireCanonicalDamageResult(canonicalDamage) {
  if (
    !isRecord(canonicalDamage)
    || !hasOwn(canonicalDamage, 'result')
    || !isRecord(canonicalDamage.metadata)
    || !hasOwn(canonicalDamage.metadata, 'modeledDistribution')
    || canonicalDamage.metadata.modeledDistribution !== true
  ) {
    failInvalidEnvelope(
      'canonical damage display adapter expects a modeled distribution envelope'
    )
  }

  return canonicalDamage.result
}

function getPresentation(options) {
  if (!isRecord(options) || !hasOwn(options, 'presentation')) {
    return null
  }
  return options.presentation ?? null
}

function getProjectionReason(error) {
  if (error.code === DISTRIBUTION_RESULT_ERROR_CODES.UPPER_BOUND_PROJECTION) {
    return CANONICAL_LEGACY_DISPLAY_NOT_PROJECTABLE_REASONS.UPPER_BOUND_OVERFLOW
  }
  if (error.code === DISTRIBUTION_RESULT_ERROR_CODES.UNSAFE_PROJECTION) {
    return CANONICAL_LEGACY_DISPLAY_NOT_PROJECTABLE_REASONS.UNSAFE_EXACT_OVERFLOW
  }
  return CANONICAL_LEGACY_DISPLAY_NOT_PROJECTABLE_REASONS.INVALID_ENVELOPE
}

function createNotProjectable(
  reason,
  canonicalOverflow,
  canonicalPresentation,
  error
) {
  return Object.freeze({
    kind: 'not-projectable',
    reason,
    causeCode: error.code,
    details: error.details,
    canonicalOverflow,
    canonicalPresentation,
  })
}

/**
 * Project one canonical damage envelope into the legacy chart shape.
 *
 * The projection deliberately delegates overflow validation to the existing
 * DistributionResult adapter. A probability upper bound or an exact tail
 * that can contain values below bucket 1023 is therefore never presented as
 * an actual legacy probability.
 */
export function projectCanonicalDamageToLegacyDisplay(
  canonicalDamage,
  options = {}
) {
  const canonicalPresentation = getPresentation(options)
  let canonicalResult

  try {
    canonicalResult = requireCanonicalDamageResult(canonicalDamage)
    const distribution = toPublishedBucketDistribution(canonicalResult, {
      length: LEGACY_PUBLISHED_BUCKET_LENGTH,
    })

    return Object.freeze({
      kind: 'projected',
      distribution,
      upperTailProbability: getUpperTailProbability(distribution),
      canonicalOverflow: canonicalResult.overflow,
      canonicalPresentation,
    })
  } catch (error) {
    if (!isDistributionResultAdapterError(error)) {
      throw error
    }

    const canonicalOverflow = canonicalResult?.overflow ?? null
    return createNotProjectable(
      getProjectionReason(error),
      canonicalOverflow,
      canonicalPresentation,
      error
    )
  }
}
