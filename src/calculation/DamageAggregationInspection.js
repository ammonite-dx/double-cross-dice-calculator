import {
  DAMAGE_AGGREGATION_ERROR_CODES,
  checkAbort,
  fail,
  failNumerical,
  isRecord,
  hasOwn,
} from './DamageAggregationCommon'
import {
  createDistributionResult,
  getCertifiedExpectedValue,
  validateDistributionResult,
} from './DistributionResult'
import {
  getFiniteDamageExpectationInterval,
} from './DamageExpectationCertificate'

const ABORT_CHECK_INTERVAL = 4_096

export function copySupport(support) {
  if (support.kind === 'finite') {
    return Object.freeze({ kind: 'finite', max: support.max })
  }
  return Object.freeze({ kind: 'infinite' })
}

export function copyOverflow(overflow) {
  if (overflow === null) {
    return null
  }
  if (overflow.kind === 'exact') {
    return Object.freeze({
      kind: 'exact',
      lowerBound: overflow.lowerBound,
      probability: overflow.probability,
      errorBound: overflow.errorBound,
    })
  }
  return Object.freeze({
    kind: 'upper-bound',
    lowerBound: overflow.lowerBound,
    probabilityUpperBound: overflow.probabilityUpperBound,
    errorBound: overflow.errorBound,
  })
}

export function validateSourceSupport(sourceSupport, index) {
  if (!isRecord(sourceSupport) || typeof sourceSupport.kind !== 'string') {
    fail(
      DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE,
      `damage metadata.sourceSupport[${index}] must be a support union`,
      { index, sourceSupport }
    )
  }
  if (sourceSupport.kind === 'infinite') {
    if (hasOwn(sourceSupport, 'max')) {
      fail(
        DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE,
        `damage metadata.sourceSupport[${index}] infinite support must not contain max`,
        { index }
      )
    }
    return Object.freeze({ kind: 'infinite' })
  }
  if (
    sourceSupport.kind !== 'finite'
    || !Number.isSafeInteger(sourceSupport.max)
    || sourceSupport.max < 0
  ) {
    fail(
      DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE,
      `damage metadata.sourceSupport[${index}] finite max must be a non-negative safe integer`,
      { index, sourceSupport }
    )
  }
  return Object.freeze({ kind: 'finite', max: sourceSupport.max })
}

export function copyProjectionUncertainty(value, index) {
  if (value === undefined) {
    return null
  }
  if (!isRecord(value)) {
    fail(
      DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE,
      `damage envelope[${index}] projectionUncertainty must be an object`,
      { index }
    )
  }
  const positionUnknownProbabilityUpperBound =
    value.positionUnknownProbabilityUpperBound
  if (
    typeof positionUnknownProbabilityUpperBound !== 'number'
    || !Number.isFinite(positionUnknownProbabilityUpperBound)
    || positionUnknownProbabilityUpperBound < 0
    || positionUnknownProbabilityUpperBound > 1
  ) {
    fail(
      DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE,
      `damage envelope[${index}] projectionUncertainty position bound must be between 0 and 1`,
      { index, positionUnknownProbabilityUpperBound }
    )
  }
  const copied = { positionUnknownProbabilityUpperBound }
  if (hasOwn(value, 'outputOverflowLowerBound')) {
    const outputOverflowLowerBound = value.outputOverflowLowerBound
    if (
      outputOverflowLowerBound !== null
      && (!Number.isSafeInteger(outputOverflowLowerBound)
        || outputOverflowLowerBound < 0)
    ) {
      fail(
        DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE,
        `damage envelope[${index}] output overflow lower bound must be null or a non-negative safe integer`,
        { index, outputOverflowLowerBound }
      )
    }
    copied.outputOverflowLowerBound = outputOverflowLowerBound
  }
  return Object.freeze(copied)
}

export function sumValues(values, signal) {
  let total = 0
  for (let index = 0; index < values.length; index += 1) {
    if (index % ABORT_CHECK_INTERVAL === 0) {
      checkAbort(signal)
    }
    total += values[index]
  }
  if (!Number.isFinite(total)) {
    failNumerical('damage explicit mass is not finite')
  }
  return total
}

export function inspectEnvelope(
  envelope,
  index,
  signal,
  validateResult = validateDistributionResult,
  certifiedExpectedValue = getCertifiedExpectedValue
) {
  checkAbort(signal)
  if (!isRecord(envelope) || !hasOwn(envelope, 'result')) {
    fail(
      DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE,
      `damage envelope[${index}] must contain result and metadata`,
      { index }
    )
  }
  const metadata = envelope.metadata
  if (
    !isRecord(metadata)
    || metadata.modeledDistribution !== true
    || !hasOwn(metadata, 'sourceSupport')
  ) {
    fail(
      DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE,
      `damage envelope[${index}] metadata must mark a modeled distribution and provide sourceSupport`,
      { index }
    )
  }

  try {
    validateResult(envelope.result)
  } catch (error) {
    fail(
      DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE,
      `damage envelope[${index}] result failed validation`,
      {
        index,
        causeCode: error?.code,
        causeName: error?.name,
      }
    )
  }

  const result = envelope.result
  const sourceSupport = validateSourceSupport(metadata.sourceSupport, index)
  const projectionUncertainty = copyProjectionUncertainty(
    hasOwn(metadata, 'projectionUncertainty')
      ? metadata.projectionUncertainty
      : undefined,
    index
  )
  const explicitMass = sumValues(result.values, signal)
  const expectedValueInterval = getFiniteDamageExpectationInterval(
    { result, metadata },
    certifiedExpectedValue
  )

  if (hasOwn(metadata, 'modeledSupport')) {
    validateSourceSupport(metadata.modeledSupport, index)
  }

  return {
    index,
    result,
    values: result.values,
    offset: result.offset,
    explicitMass,
    support: result.support,
    overflow: result.overflow,
    sourceSupport,
    projectionUncertainty,
    expectedValueInterval,
  }
}

export function hasPotentialTail(overflow) {
  if (overflow === null) {
    return false
  }
  return overflow.errorBound > 0
    || (overflow.kind === 'exact'
      ? overflow.probability > 0
      : overflow.probabilityUpperBound > 0)
}

export function getTailProbability(overflow) {
  if (overflow === null) {
    return 0
  }
  return overflow.kind === 'exact'
    ? overflow.probability
    : overflow.probabilityUpperBound
}

export function unionProbability(probabilities) {
  let logComplement = 0
  for (const probability of probabilities) {
    if (probability === 1) {
      return 1
    }
    const logTerm = Math.log1p(-probability)
    if (!Number.isFinite(logTerm)) {
      failNumerical('overflow union probability is not finite', {
        probability,
      })
    }
    logComplement += logTerm
    if (!Number.isFinite(logComplement)) {
      return 1
    }
  }
  const union = -Math.expm1(logComplement)
  if (!Number.isFinite(union)) {
    failNumerical('overflow union probability is not finite')
  }
  return Math.min(1, Math.max(0, union))
}

export function probabilityFromExplicitMass(explicitMass) {
  if (!Number.isFinite(explicitMass)) {
    failNumerical('final explicit probability mass is not finite', {
      explicitMass,
    })
  }
  return Math.min(1, Math.max(0, 1 - explicitMass))
}

export function snapshotInspectedComponents(inspected, signal) {
  return inspected.map((component) => {
    checkAbort(signal)
    let result
    try {
      result = createDistributionResult({
        values: component.values,
        offset: component.offset,
        support: component.support,
        overflow: component.overflow,
      })
    } catch (error) {
      fail(
        DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE,
        `damage envelope[${component.index}] changed while planning`,
        {
          index: component.index,
          causeCode: error?.code,
          causeName: error?.name,
        }
      )
    }
    return {
      ...component,
      result,
      values: result.values,
      support: result.support,
      overflow: result.overflow,
    }
  })
}
