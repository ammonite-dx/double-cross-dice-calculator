import {
  DAMAGE_AGGREGATION_ERROR_CODES,
  failIndex,
  failNumerical,
  failResource,
  MAX_SAFE_INTEGER,
} from './DamageAggregationCommon'
import {
  getTailProbability,
  hasPotentialTail,
  unionProbability,
} from './DamageAggregationInspection'
import { getConvolutionFftLength } from '../core/probability/FFT'
import {
  DEFAULT_MAX_CPU_WORK,
  fftOperationCount,
} from './planning/PlanningMath'
import type { DistributionSupport } from '../domain/DistributionResultTypes'
import type {
  DamageAggregationInternalPlan,
  DamageAggregationPlanStep,
  InspectedDamageComponent,
} from './DamageAggregationTypes'

type PlannerOptions = Readonly<{
  maxValuesLength: number
  maxFftLength: number
  maxResourceBytes: number
}>
type NumericDetails = Record<string, unknown>

const FLOAT64_BYTES = Float64Array.BYTES_PER_ELEMENT
const FFT_BUFFER_COUNT = 4
const PERSISTENT_METADATA_BYTES = 16 * 1024
const PERSISTENT_COMPONENT_REFERENCE_BYTES = 16
const PERSISTENT_INSPECTED_BYTES = 512
const PERSISTENT_STEP_BYTES = 512
const PERSISTENT_DESCRIPTOR_BYTES = 512
const PERSISTENT_COMPONENT_METADATA_BYTES = 512
const PERSISTENT_OUTPUT_BUFFER_COUNT = 2

function addSafeIntegers(
  left: number,
  right: number,
  field: string,
  details: NumericDetails = {},
): number {
  if (
    !Number.isSafeInteger(left)
    || !Number.isSafeInteger(right)
    || left < 0
    || right < 0
  ) {
    failIndex(
      `${field} operands must be non-negative safe integers`,
      { ...details, left, right }
    )
  }
  if (left > MAX_SAFE_INTEGER - right) {
    failIndex(
      `${field} exceeds Number.MAX_SAFE_INTEGER`,
      { ...details, left, right }
    )
  }
  return left + right
}

function getLinearConvolutionLength(
  left: number,
  right: number,
  details: NumericDetails = {},
): number {
  if (
    !Number.isSafeInteger(left)
    || !Number.isSafeInteger(right)
    || left <= 0
    || right <= 0
  ) {
    failIndex(
      'linear convolution lengths must be positive safe integers',
      { ...details, left, right }
    )
  }
  if (left > MAX_SAFE_INTEGER - right + 1) {
    failIndex(
      'linear convolution result length exceeds Number.MAX_SAFE_INTEGER',
      { ...details, left, right }
    )
  }
  return left + right - 1
}

function addFiniteNumbers(
  left: number,
  right: number,
  field: string,
  details: NumericDetails = {},
): number {
  const value = left + right
  if (!Number.isFinite(value)) {
    failNumerical(
      `${field} is not finite`,
      { ...details, left, right }
    )
  }
  return value
}

function multiplyFiniteNumbers(
  left: number,
  right: number,
  field: string,
  details: NumericDetails = {},
): number {
  const value = left * right
  if (!Number.isFinite(value)) {
    failNumerical(
      `${field} is not finite`,
      { ...details, left, right }
    )
  }
  return value
}

export function estimateConvolutionBytes(
  leftLength: number,
  rightLength: number,
  resultLength: number,
  fftLength: number,
): number {
  let words = multiplyFiniteNumbers(
    FFT_BUFFER_COUNT,
    fftLength,
    'FFT buffer word count'
  )
  words = addFiniteNumbers(words, resultLength * 2, 'convolution word count')
  words = addFiniteNumbers(words, leftLength, 'convolution word count')
  words = addFiniteNumbers(words, rightLength, 'convolution word count')
  const bytes = multiplyFiniteNumbers(
    words,
    FLOAT64_BYTES,
    'convolution resource estimate'
  )
  if (!Number.isSafeInteger(bytes)) {
    failResource(
      'convolution resource estimate exceeds a safe integer',
      { bytes }
    )
  }
  return bytes
}

export function addResourceBytes(
  left: number,
  right: number,
  field: string,
  details: NumericDetails = {},
): number {
  if (
    !Number.isSafeInteger(left)
    || !Number.isSafeInteger(right)
    || left < 0
    || right < 0
  ) {
    failResource(
      `${field} resource estimate is not a non-negative safe integer`,
      { ...details, left, right }
    )
  }
  if (left > MAX_SAFE_INTEGER - right) {
    failResource(
      `${field} resource estimate exceeds Number.MAX_SAFE_INTEGER`,
      { ...details, left, right }
    )
  }
  return left + right
}

export function multiplyResourceBytes(
  left: number,
  right: number,
  field: string,
  details: NumericDetails = {},
): number {
  if (
    !Number.isSafeInteger(left)
    || !Number.isSafeInteger(right)
    || left < 0
    || right < 0
  ) {
    failResource(
      `${field} resource estimate is not a non-negative safe integer`,
      { ...details, left, right }
    )
  }
  if (left !== 0 && right > MAX_SAFE_INTEGER / left) {
    failResource(
      `${field} resource estimate exceeds Number.MAX_SAFE_INTEGER`,
      { ...details, left, right }
    )
  }
  return left * right
}

export function estimatePersistentBytes(
  componentCount: number,
  outputLength: number,
  sourceValuesLength = 0,
): number {
  let bytes = PERSISTENT_METADATA_BYTES
  const perComponentBytes =
    PERSISTENT_COMPONENT_REFERENCE_BYTES
    + PERSISTENT_INSPECTED_BYTES
    + PERSISTENT_STEP_BYTES
    + PERSISTENT_DESCRIPTOR_BYTES
    + PERSISTENT_COMPONENT_METADATA_BYTES
  bytes = addResourceBytes(
    bytes,
    multiplyResourceBytes(
      componentCount,
      perComponentBytes,
      'persistent component'
    ),
    'persistent aggregation'
  )
  bytes = addResourceBytes(
    bytes,
    multiplyResourceBytes(
      outputLength,
      FLOAT64_BYTES * PERSISTENT_OUTPUT_BUFFER_COUNT,
      'persistent output'
    ),
    'persistent aggregation'
  )
  bytes = addResourceBytes(
    bytes,
    multiplyResourceBytes(
      sourceValuesLength,
      FLOAT64_BYTES,
      'persistent source snapshot'
    ),
    'persistent aggregation'
  )
  return bytes
}

export function getSourceValuesLength(
  inspected: readonly InspectedDamageComponent[],
): number {
  let length = 0
  for (const component of inspected) {
    length = addResourceBytes(
      length,
      component.values.length,
      'source values length'
    )
  }
  return length
}

export function ensureLengthLimit(
  length: number,
  options: PlannerOptions,
  field: string,
  index?: number,
): void {
  if (!Number.isSafeInteger(length) || length < 0) {
    failIndex(
      `${field} must be a non-negative safe integer`,
      { field, index, length }
    )
  }
  if (length > options.maxValuesLength) {
    failResource(
      `${field} exceeds the configured values length limit`,
      { field, index, length, limit: options.maxValuesLength }
    )
  }
}

export function estimateAggregateOutputLength(
  inspected: readonly InspectedDamageComponent[],
  options: PlannerOptions,
): number {
  if (inspected.some((component) => component.values.length === 0)) {
    return 0
  }
  let currentLength = inspected[0]?.values.length ?? 0
  for (let index = 1; index < inspected.length; index += 1) {
    currentLength = getLinearConvolutionLength(
      currentLength,
      inspected[index].values.length,
      { index }
    )
    ensureLengthLimit(currentLength, options, 'convolution result length', index)
  }
  return currentLength
}

function combineSupport(
  left: DistributionSupport,
  right: DistributionSupport,
  field: string,
): DistributionSupport {
  if (left.kind === 'infinite' || right.kind === 'infinite') {
    return Object.freeze({ kind: 'infinite' })
  }
  return Object.freeze({
    kind: 'finite',
    max: addSafeIntegers(left.max, right.max, field),
  })
}

/** Plan convolution steps and resource estimates without executing FFT. */
export function buildDamageAggregationPlan(
  inspected: readonly InspectedDamageComponent[],
  options: PlannerOptions,
  persistentBytes: number,
): DamageAggregationInternalPlan {
  let offset = 0
  let modeledSupport: DistributionSupport = Object.freeze({
    kind: 'finite',
    max: 0,
  })
  let sourceSupport: DistributionSupport = Object.freeze({
    kind: 'finite',
    max: 0,
  })
  let sourceErrorBound = 0
  let expectedExplicitMass = 1
  let exactTailProbabilities = []
  let allOverflowNull = true
  let hasUpperBound = false
  let lowerBound = null

  for (const component of inspected) {
    offset = addSafeIntegers(offset, component.offset, 'aggregate offset')
    modeledSupport = combineSupport(
      modeledSupport,
      component.support,
      'modeled support maximum'
    )
    sourceSupport = combineSupport(
      sourceSupport,
      component.sourceSupport,
      'source support maximum'
    )
    sourceErrorBound = addFiniteNumbers(
      sourceErrorBound,
      component.overflow?.errorBound ?? 0,
      'source overflow error bound',
      { index: component.index }
    )
    expectedExplicitMass *= component.explicitMass
    if (!Number.isFinite(expectedExplicitMass)) {
      failNumerical('expected explicit mass is not finite')
    }

    const overflow = component.overflow
    if (overflow !== null) {
      allOverflowNull = false
      if (overflow.kind === 'upper-bound') {
        hasUpperBound = true
      } else {
        exactTailProbabilities.push(overflow.probability)
      }
      if (hasPotentialTail(overflow)) {
        lowerBound = lowerBound === null
          ? overflow.lowerBound
          : Math.min(lowerBound, overflow.lowerBound)
      }
    }
  }

  const upperTailProbabilities = inspected.map((component) =>
    getTailProbability(component.overflow)
  )
  const exactUnion = unionProbability(exactTailProbabilities)
  const upperUnion = unionProbability(upperTailProbabilities)

  const hasEmptyValues = inspected.some((component) => component.values.length === 0)
  const steps: DamageAggregationPlanStep[] = []
  let peakResourceBytes = persistentBytes
  let operations = 0
  let currentLength = hasEmptyValues ? 0 : inspected[0]?.values.length ?? 0
  if (!hasEmptyValues) {
    for (let index = 1; index < inspected.length; index += 1) {
      const nextLength = inspected[index].values.length
      const resultLength = getLinearConvolutionLength(
        currentLength,
        nextLength,
        { index }
      )
      ensureLengthLimit(resultLength, options, 'convolution result length', index)
      const requiredLinearLength = resultLength
      if (requiredLinearLength > options.maxFftLength) {
        failResource(
          'required linear convolution length exceeds the configured FFT limit',
          { index, requiredLinearLength, limit: options.maxFftLength }
        )
      }
      let fftLength
      try {
        fftLength = getConvolutionFftLength(currentLength, nextLength)
      } catch (error: unknown) {
        failIndex(
          'unable to determine a safe FFT length for convolution',
          {
            index,
            causeName: error instanceof Error ? error.name : undefined,
            causeMessage: error instanceof Error ? error.message : undefined,
          }
        )
      }
      if (fftLength > options.maxFftLength) {
        failResource(
          'required FFT length exceeds the configured FFT limit',
          { index, fftLength, limit: options.maxFftLength }
        )
      }
      const resourceBytes = estimateConvolutionBytes(
        currentLength,
        nextLength,
        resultLength,
        fftLength
      )
      const peakWithPersistentBytes = addResourceBytes(
        persistentBytes,
        resourceBytes,
        'aggregation peak'
      )
      if (peakWithPersistentBytes > options.maxResourceBytes) {
        failResource(
          'convolution and persistent aggregation resources exceed the configured resource limit',
          {
            index,
            resourceBytes,
            persistentBytes,
            peakWithPersistentBytes,
            limit: options.maxResourceBytes,
          }
        )
      }
      peakResourceBytes = Math.max(peakResourceBytes, peakWithPersistentBytes)
      operations = addFiniteNumbers(
        operations,
        fftOperationCount(fftLength),
        'convolution operation estimate',
        { index }
      )
      steps.push({
        index,
        leftLength: currentLength,
        rightLength: nextLength,
        resultLength,
        fftLength,
        resourceBytes,
      })
      currentLength = resultLength
    }
  }

  ensureLengthLimit(currentLength, options, 'aggregate values length')
  const cpuWork = operations
  if (!Number.isFinite(cpuWork) || cpuWork < 0) {
    failNumerical('damage aggregation CPU work estimate is not finite', {
      operations,
      cpuWork,
    })
  }
  if (cpuWork > DEFAULT_MAX_CPU_WORK) {
    failResource(
      'damage aggregation CPU work exceeds the configured limit',
      { operations, cpuWork, limit: DEFAULT_MAX_CPU_WORK }
    )
  }
  if (currentLength > 0 && offset > MAX_SAFE_INTEGER - currentLength + 1) {
    failIndex(
      'aggregate offset plus values length exceeds Number.MAX_SAFE_INTEGER',
      { offset, valuesLength: currentLength }
    )
  }

  return {
    offset,
    modeledSupport,
    sourceSupport,
    sourceErrorBound,
    expectedExplicitMass,
    exactUnion,
    upperUnion,
    allOverflowNull,
    hasUpperBound,
    potentialOverflowLowerBound: lowerBound ?? 0,
    hasEmptyValues,
    outputLength: currentLength,
    persistentBytes,
    peakResourceBytes,
    operations,
    cpuWork,
    steps,
  }
}

export { DAMAGE_AGGREGATION_ERROR_CODES }
