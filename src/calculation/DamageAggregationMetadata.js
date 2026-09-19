import { DAMAGE_EXPECTATION_CERTIFICATE_VERSION } from './DamageExpectationCertificate'
import {
  copyOverflow,
  copySupport,
  hasPotentialTail,
  unionProbability,
} from './DamageAggregationInspection'

export function createComponentDescriptor(component) {
  return Object.freeze({
    index: component.index,
    offset: component.offset,
    valuesLength: component.values.length,
    modeledSupport: copySupport(component.support),
    sourceSupport: copySupport(component.sourceSupport),
    overflow: copyOverflow(component.overflow),
    ...(component.projectionUncertainty === null
      ? {}
      : {
          projectionUncertainty: component.projectionUncertainty,
        }),
  })
}

export function createAggregateDamageExpectationCertificate(inspected) {
  if (inspected.length === 0) {
    return null
  }

  let lowerBound = 0
  let upperBound = 0
  let lowerCompensation = 0
  let upperCompensation = 0
  let hasDedicatedCertificate = false
  for (const component of inspected) {
    const interval = component.expectedValueInterval
    if (interval === null) {
      return null
    }
    const lowerCorrected = interval.lowerBound - lowerCompensation
    const lowerNext = lowerBound + lowerCorrected
    lowerCompensation = (lowerNext - lowerBound) - lowerCorrected
    lowerBound = lowerNext
    const upperCorrected = interval.upperBound - upperCompensation
    const upperNext = upperBound + upperCorrected
    upperCompensation = (upperNext - upperBound) - upperCorrected
    upperBound = upperNext
    if (!Number.isFinite(lowerBound) || !Number.isFinite(upperBound)) {
      return null
    }
    hasDedicatedCertificate ||= interval.source === 'damage-certificate'
  }

  if (
    !hasDedicatedCertificate
    || lowerBound > upperBound
    || lowerBound < 0
  ) {
    return null
  }

  return Object.freeze({
    version: DAMAGE_EXPECTATION_CERTIFICATE_VERSION,
    kind: 'damage-expectation-certificate',
    lowerBound,
    upperBound,
  })
}

export function createAggregateProjectionUncertainty(inspected) {
  const descriptors = inspected
    .map((component) => component.projectionUncertainty)
  const hasDescriptor = descriptors.some((descriptor) => descriptor !== null)
  if (!hasDescriptor) {
    return null
  }

  const positionBounds = []
  let outputOverflowLowerBound = null
  for (const component of inspected) {
    const descriptor = component.projectionUncertainty
    if (descriptor === null) {
      // An overflow without the descriptor cannot be proven to be a
      // right-side output tail; retain the conservative position uncertainty.
      if (hasPotentialTail(component.overflow)) {
        positionBounds.push(1)
      }
      continue
    }
    positionBounds.push(descriptor.positionUnknownProbabilityUpperBound)
    if (
      descriptor.outputOverflowLowerBound !== undefined
      && descriptor.outputOverflowLowerBound !== null
    ) {
      outputOverflowLowerBound = outputOverflowLowerBound === null
        ? descriptor.outputOverflowLowerBound
        : Math.min(
            outputOverflowLowerBound,
            descriptor.outputOverflowLowerBound
          )
    }
  }

  const positionUnknownProbabilityUpperBound = Math.min(
    1,
    unionProbability(positionBounds)
  )
  return Object.freeze({
    positionUnknownProbabilityUpperBound,
    outputOverflowLowerBound,
  })
}

/** Construct the aggregate metadata and diagnostics certificate. */
export function createDamageAggregationMetadata(inspected, plan, diagnostics) {
  const componentDescriptors = Object.freeze(inspected.map(createComponentDescriptor))
  const modeledSupport = copySupport(plan.modeledSupport)
  const sourceSupport = copySupport(plan.sourceSupport)
  const projectionUncertainty = createAggregateProjectionUncertainty(
    inspected
  )
  const damageExpectationCertificate =
    createAggregateDamageExpectationCertificate(inspected)
  return Object.freeze({
    modeledDistribution: true,
    aggregation: 'independent-sum',
    independence: 'assumed',
    componentCount: inspected.length,
    modeledSupport,
    sourceSupport,
    overflowProbabilityLowerBound: plan.exactUnion,
    aggregationErrorBound: diagnostics.aggregationErrorBound,
    componentDescriptors,
    sourceOverflowProbability: plan.hasUpperBound ? null : plan.exactUnion,
    sourceOverflowProbabilityUpperBound: plan.upperUnion,
    expectedExplicitMass: plan.expectedExplicitMass,
    rawExplicitMass: diagnostics.rawExplicitMass,
    explicitMass: diagnostics.explicitMass,
    sourceErrorBound: plan.sourceErrorBound,
    fftMassDrift: diagnostics.fftMassDrift,
    sourceMassDrift: diagnostics.sourceMassDrift,
    damageExpectationCertificate,
    ...(projectionUncertainty === null ? {} : { projectionUncertainty }),
  })
}
