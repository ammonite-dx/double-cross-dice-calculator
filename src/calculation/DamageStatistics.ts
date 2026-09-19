import {
  createBoundedCertifiedValue,
  createExactCertifiedValue,
  createLowerBoundCertifiedValue,
} from '../domain/CertifiedValue'
import type {
  DamageEnvelope,
  DamageMetadata,
  DamageStatistics,
} from '../domain/DamageResultTypes'
import type {
  DistributionOverflow,
  DistributionSupport,
} from '../domain/DistributionResultTypes'
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

interface TotalDamageMetadata extends DamageMetadata {
  readonly overflowProbabilityLowerBound?: number
}

interface InspectedTotalDamageEnvelope {
  readonly result: DamageEnvelope['result']
  readonly values: Float64Array
  readonly offset: number
  readonly overflow: DistributionOverflow | null
  readonly support: DistributionSupport
  readonly metadata: TotalDamageMetadata
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function failTotalDamageValidation(
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): never {
  throw new DistributionResultValidationError(code, message, details)
}

function isDamageEnvelope(value: unknown): value is DamageEnvelope {
  if (!isRecord(value) || !isRecord(value.metadata)) {
    return false
  }
  return Object.prototype.hasOwnProperty.call(value, 'result')
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

function validateTotalDamageEnvelope(
  totalDamage: unknown,
): InspectedTotalDamageEnvelope {
  if (
    !isDamageEnvelope(totalDamage)
    || totalDamage.metadata.modeledDistribution !== true
  ) {
    failTotalDamageValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SCHEMA,
      'total damage summary expects a modeled result envelope',
    )
  }

  validateDistributionResult(totalDamage.result)
  const metadata = totalDamage.metadata as TotalDamageMetadata
  const overflow = totalDamage.result.overflow
  if (overflow?.kind === 'upper-bound') {
    const lowerBound = metadata.overflowProbabilityLowerBound
    if (
      typeof lowerBound !== 'number'
      || !Number.isFinite(lowerBound)
      || lowerBound < 0
      || lowerBound > 1
    ) {
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
    metadata,
  }
}

/** Summarize one canonical damage envelope. */
export function getDamageStatistics(damage: unknown): DamageStatistics {
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
export function getTotalDamageStatistics(
  totalDamage: unknown,
): DamageStatistics {
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
    metadata.overflowProbabilityLowerBound as number,
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
