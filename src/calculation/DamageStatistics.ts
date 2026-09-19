import {
  createBoundedCertifiedValue,
  createExactCertifiedValue,
  createLowerBoundCertifiedValue,
} from '../domain/CertifiedValue'
import {
  getCertifiedDamageExpectation,
} from './DamageExpectationCertificate'
import {
  DISTRIBUTION_RESULT_ERROR_CODES,
  DISTRIBUTION_RESULT_TOLERANCE,
  DistributionResultValidationError,
  getCertifiedExpectedValue,
  getProbabilityMassSummary,
  validateDistributionResult,
} from './DistributionResult'

function failTotalDamageValidation(code: string, message: string, details = {}) {
  throw new DistributionResultValidationError(code, message, details)
}

function isDamageEnvelope(value: any) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.prototype.hasOwnProperty.call(value, 'result')
    && value.metadata !== null
    && typeof value.metadata === 'object'
    && !Array.isArray(value.metadata)
    && Object.prototype.hasOwnProperty.call(
      value.metadata,
      'modeledDistribution',
    )
    && value.metadata.modeledDistribution === true
}

function sumExplicitFirstMoment(values: Float64Array, offset: number) {
  let firstMoment = 0
  for (let index = 0; index < values.length; index += 1) {
    firstMoment += (offset + index) * values[index]
  }
  return firstMoment
}

function validateTotalDamageEnvelope(totalDamage: any) {
  if (
    totalDamage === null
    || typeof totalDamage !== 'object'
    || Array.isArray(totalDamage)
    || !Object.prototype.hasOwnProperty.call(totalDamage, 'result')
    || totalDamage.metadata === null
    || typeof totalDamage.metadata !== 'object'
    || Array.isArray(totalDamage.metadata)
    || totalDamage.metadata.modeledDistribution !== true
  ) {
    failTotalDamageValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SCHEMA,
      'total damage summary expects a modeled result envelope',
    )
  }

  validateDistributionResult(totalDamage.result)
  const overflow = totalDamage.result.overflow
  if (overflow?.kind === 'upper-bound') {
    const lowerBound = totalDamage.metadata.overflowProbabilityLowerBound
    if (!Number.isFinite(lowerBound) || lowerBound < 0 || lowerBound > 1) {
      failTotalDamageValidation(
        DISTRIBUTION_RESULT_ERROR_CODES.INVALID_LOWER_BOUND,
        'total damage metadata.overflowProbabilityLowerBound must be a probability',
        { overflowProbabilityLowerBound: lowerBound },
      )
    }
    if (
      lowerBound
      > overflow.probabilityUpperBound + DISTRIBUTION_RESULT_TOLERANCE
    ) {
      failTotalDamageValidation(
        DISTRIBUTION_RESULT_ERROR_CODES.UPPER_BOUND_TOO_SMALL,
        'total damage overflow probability lower bound exceeds its upper bound',
        {
          overflowProbabilityLowerBound: lowerBound,
          probabilityUpperBound: overflow.probabilityUpperBound,
        },
      )
    }
  }
  return {
    result: totalDamage.result,
    values: totalDamage.result.values,
    offset: totalDamage.result.offset,
    overflow,
    support: totalDamage.result.support,
    metadata: totalDamage.metadata,
  }
}

/** Summarize one canonical damage envelope. */
export function getDamageStatistics(damage: any) {
  if (!isDamageEnvelope(damage)) {
    throw new TypeError(
      'damage summary expects an envelope with result and metadata',
    )
  }

  const expectedValue =
    getCertifiedDamageExpectation(
      damage.metadata.damageExpectationCertificate,
    )
    ?? getCertifiedExpectedValue(damage.result)
  const mass = getProbabilityMassSummary(damage.result)
  return Object.freeze({ expectedValue, mass })
}

/** Summarize an aggregated canonical damage envelope. */
export function getTotalDamageStatistics(totalDamage: any) {
  const inspected = validateTotalDamageEnvelope(totalDamage)
  const { result, metadata } = inspected

  const dedicatedExpectedValue = getCertifiedDamageExpectation(
    metadata.damageExpectationCertificate,
  )
  if (dedicatedExpectedValue !== null) {
    return Object.freeze({
      expectedValue: dedicatedExpectedValue,
      mass: getProbabilityMassSummary(result),
    })
  }

  if (inspected.overflow?.kind !== 'upper-bound') {
    return Object.freeze({
      expectedValue: getCertifiedExpectedValue(result),
      mass: getProbabilityMassSummary(result),
    })
  }

  const explicitFirstMoment = sumExplicitFirstMoment(
    inspected.values,
    inspected.offset,
  )
  const overflowProbabilityLowerBound = Math.min(
    metadata.overflowProbabilityLowerBound,
    inspected.overflow.probabilityUpperBound,
  )
  const lowerExpectedValue = explicitFirstMoment
    + overflowProbabilityLowerBound * inspected.overflow.lowerBound

  if (!Number.isFinite(lowerExpectedValue)) {
    failTotalDamageValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SCHEMA,
      'total damage expected-value lower bound is not finite',
      { lowerExpectedValue },
    )
  }

  let expectedValue
  if (inspected.overflow.probabilityUpperBound === 0) {
    expectedValue = createExactCertifiedValue(explicitFirstMoment)
  } else if (inspected.support.kind === 'finite') {
    const upperExpectedValue = explicitFirstMoment
      + inspected.overflow.probabilityUpperBound * inspected.support.max
    if (!Number.isFinite(upperExpectedValue)) {
      failTotalDamageValidation(
        DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SCHEMA,
        'total damage expected-value upper bound is not finite',
        { upperExpectedValue },
      )
    }
    expectedValue = createBoundedCertifiedValue(
      lowerExpectedValue,
      upperExpectedValue,
    )
  } else {
    expectedValue = createLowerBoundCertifiedValue(lowerExpectedValue)
  }

  return Object.freeze({
    expectedValue,
    mass: getProbabilityMassSummary(result),
  })
}
