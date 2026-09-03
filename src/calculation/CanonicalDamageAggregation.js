import {
  convolveDistributions,
  getConvolutionFftLength,
} from '../core/probability/FFT'
import {
  createDistributionResult,
  DISTRIBUTION_RESULT_TOLERANCE,
  validateDistributionResult,
} from './DistributionResult'

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER
const FLOAT64_BYTES = Float64Array.BYTES_PER_ELEMENT
const FFT_BUFFER_COUNT = 4
const ABORT_CHECK_INTERVAL = 4_096
const PERSISTENT_METADATA_BYTES = 16 * 1024
const PERSISTENT_COMPONENT_REFERENCE_BYTES = 16
const PERSISTENT_INSPECTED_BYTES = 512
const PERSISTENT_STEP_BYTES = 512
const PERSISTENT_DESCRIPTOR_BYTES = 512
const PERSISTENT_COMPONENT_METADATA_BYTES = 512
const PERSISTENT_OUTPUT_BUFFER_COUNT = 2
const CANONICAL_DAMAGE_AGGREGATION_PLAN_VERSION = 1

// The public plan is intentionally opaque to the execution path. A frozen
// object protects the published contract from ordinary mutation; this private
// registry also prevents a caller from forging a look-alike plan with altered
// estimates or convolution steps.
const PLAN_RECORDS = new WeakMap()

// Values and FFT length share the existing runtime ceiling. The aggregation
// options may lower these values for a caller, but never raise any absolute
// safety ceiling.
export const CANONICAL_DAMAGE_AGGREGATION_MAX_VALUES_LENGTH = 1 << 20
export const CANONICAL_DAMAGE_AGGREGATION_MAX_FFT_LENGTH = 1 << 20
export const CANONICAL_DAMAGE_AGGREGATION_MAX_RESOURCE_BYTES = 512 * 1024 * 1024
export const CANONICAL_DAMAGE_AGGREGATION_MAX_COMPONENTS = 1 << 12

export const CANONICAL_DAMAGE_AGGREGATION_NUMERICAL_EPSILON = 1e-12

export const CANONICAL_DAMAGE_AGGREGATION_LIMITS = Object.freeze({
  maxValuesLength: CANONICAL_DAMAGE_AGGREGATION_MAX_VALUES_LENGTH,
  maxFftLength: CANONICAL_DAMAGE_AGGREGATION_MAX_FFT_LENGTH,
  maxResourceBytes: CANONICAL_DAMAGE_AGGREGATION_MAX_RESOURCE_BYTES,
  maxComponents: CANONICAL_DAMAGE_AGGREGATION_MAX_COMPONENTS,
})

export const CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES = Object.freeze({
  INVALID_ENVELOPE: 'invalid-envelope',
  INVALID_OPTIONS: 'invalid-options',
  INDEX_OVERFLOW: 'index-overflow',
  RESOURCE_LIMIT: 'resource-limit',
  NUMERICAL_FAILURE: 'numerical-failure',
  ABORTED: 'aborted',
})

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function freezeDetails(details) {
  return Object.freeze(isRecord(details) ? { ...details } : {})
}

export class CanonicalDamageAggregationError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'CanonicalDamageAggregationError'
    this.code = code
    this.details = freezeDetails(details)
    this.canonicalDamageAggregation = true
  }
}

export class CanonicalDamageAggregationAbortError
  extends CanonicalDamageAggregationError {
  constructor(message = 'Canonical damage aggregation was aborted', details = {}) {
    super(
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.ABORTED,
      message,
      details
    )
    this.name = 'AbortError'
    this.aborted = true
  }
}

export function isCanonicalDamageAggregationError(error) {
  return error?.canonicalDamageAggregation === true
    && typeof error.code === 'string'
}

export function isCanonicalDamageAggregationAbortError(error) {
  return isCanonicalDamageAggregationError(error)
    && error.code === CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.ABORTED
}

function fail(code, message, details = {}) {
  throw new CanonicalDamageAggregationError(code, message, details)
}

function failIndex(message, details = {}) {
  fail(
    CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INDEX_OVERFLOW,
    message,
    details
  )
}

function failResource(message, details = {}) {
  fail(
    CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.RESOURCE_LIMIT,
    message,
    details
  )
}

function failNumerical(message, details = {}) {
  fail(
    CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.NUMERICAL_FAILURE,
    message,
    details
  )
}

function checkAbort(signal) {
  if (signal?.aborted) {
    throw new CanonicalDamageAggregationAbortError()
  }
}

function validateOptionLimit(value, name, absolute, allowZero = true) {
  if (!Number.isSafeInteger(value) || (allowZero ? value < 0 : value <= 0)) {
    fail(
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS,
      `${name} must be a ${allowZero ? 'non-negative' : 'positive'} safe integer`,
      { name, value }
    )
  }
  if (value > absolute) {
    fail(
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS,
      `${name} must not exceed the absolute safety limit of ${absolute}`,
      { name, value, absolute }
    )
  }
  return value
}

function normalizeOptions(options, allowPlan = false) {
  if (options === undefined) {
    options = {}
  }
  if (!isRecord(options)) {
    fail(
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS,
      'canonical damage aggregation options must be an object'
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
        CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS,
        `unknown canonical damage aggregation option: ${displayName}`,
        { name: displayName }
      )
    }
  }

  const maxValuesLength = validateOptionLimit(
    hasOwn(options, 'maxValuesLength')
      ? options.maxValuesLength
      : CANONICAL_DAMAGE_AGGREGATION_MAX_VALUES_LENGTH,
    'maxValuesLength',
    CANONICAL_DAMAGE_AGGREGATION_MAX_VALUES_LENGTH
  )
  const maxFftLength = validateOptionLimit(
    hasOwn(options, 'maxFftLength')
      ? options.maxFftLength
      : CANONICAL_DAMAGE_AGGREGATION_MAX_FFT_LENGTH,
    'maxFftLength',
    CANONICAL_DAMAGE_AGGREGATION_MAX_FFT_LENGTH
  )
  const maxResourceBytes = validateOptionLimit(
    hasOwn(options, 'maxResourceBytes')
      ? options.maxResourceBytes
      : CANONICAL_DAMAGE_AGGREGATION_MAX_RESOURCE_BYTES,
    'maxResourceBytes',
    CANONICAL_DAMAGE_AGGREGATION_MAX_RESOURCE_BYTES
  )
  const maxComponents = validateOptionLimit(
    hasOwn(options, 'maxComponents')
      ? options.maxComponents
      : CANONICAL_DAMAGE_AGGREGATION_MAX_COMPONENTS,
    'maxComponents',
    CANONICAL_DAMAGE_AGGREGATION_MAX_COMPONENTS
  )

  const signal = options.signal ?? null
  if (
    signal !== null
    && (typeof signal !== 'object' || typeof signal.aborted !== 'boolean')
  ) {
    fail(
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS,
      'options.signal must be an AbortSignal-like object',
      { signal }
    )
  }

  const onFftLength = options.onFftLength
  if (onFftLength !== undefined && typeof onFftLength !== 'function') {
    fail(
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS,
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

function addSafeIntegers(left, right, field, details = {}) {
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

function getLinearConvolutionLength(left, right, details = {}) {
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

function addFiniteNumbers(left, right, field, details = {}) {
  const value = left + right
  if (!Number.isFinite(value)) {
    failNumerical(
      `${field} is not finite`,
      { ...details, left, right }
    )
  }
  return value
}

function multiplyFiniteNumbers(left, right, field, details = {}) {
  const value = left * right
  if (!Number.isFinite(value)) {
    failNumerical(
      `${field} is not finite`,
      { ...details, left, right }
    )
  }
  return value
}

function copySupport(support) {
  if (support.kind === 'finite') {
    return Object.freeze({ kind: 'finite', max: support.max })
  }
  return Object.freeze({ kind: 'infinite' })
}

function copyOverflow(overflow) {
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

function validateSourceSupport(sourceSupport, index) {
  if (!isRecord(sourceSupport) || typeof sourceSupport.kind !== 'string') {
    fail(
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE,
      `canonical damage metadata.sourceSupport[${index}] must be a support union`,
      { index, sourceSupport }
    )
  }
  if (sourceSupport.kind === 'infinite') {
    if (hasOwn(sourceSupport, 'max')) {
      fail(
        CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE,
        `canonical damage metadata.sourceSupport[${index}] infinite support must not contain max`,
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
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE,
      `canonical damage metadata.sourceSupport[${index}] finite max must be a non-negative safe integer`,
      { index, sourceSupport }
    )
  }
  return Object.freeze({ kind: 'finite', max: sourceSupport.max })
}

function copyProjectionUncertainty(value, index) {
  if (value === undefined) {
    return null
  }
  if (!isRecord(value)) {
    fail(
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE,
      `canonical damage envelope[${index}] projectionUncertainty must be an object`,
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
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE,
      `canonical damage envelope[${index}] projectionUncertainty position bound must be between 0 and 1`,
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
        CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE,
        `canonical damage envelope[${index}] output overflow lower bound must be null or a non-negative safe integer`,
        { index, outputOverflowLowerBound }
      )
    }
    copied.outputOverflowLowerBound = outputOverflowLowerBound
  }
  return Object.freeze(copied)
}

function sumValues(values, signal) {
  let total = 0
  for (let index = 0; index < values.length; index += 1) {
    if (index % ABORT_CHECK_INTERVAL === 0) {
      checkAbort(signal)
    }
    total += values[index]
  }
  if (!Number.isFinite(total)) {
    failNumerical('canonical damage explicit mass is not finite')
  }
  return total
}

function inspectEnvelope(envelope, index, signal) {
  checkAbort(signal)
  if (!isRecord(envelope) || !hasOwn(envelope, 'result')) {
    fail(
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE,
      `canonical damage envelope[${index}] must contain result and metadata`,
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
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE,
      `canonical damage envelope[${index}] metadata must mark a modeled distribution and provide sourceSupport`,
      { index }
    )
  }

  try {
    validateDistributionResult(envelope.result)
  } catch (error) {
    fail(
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE,
      `canonical damage envelope[${index}] result failed canonical validation`,
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

  // A supplied modeledSupport is metadata, not a second source of truth. It
  // is nevertheless validated when present so malformed component metadata
  // cannot be silently carried into an aggregate descriptor.
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
  }
}

function hasPotentialTail(overflow) {
  if (overflow === null) {
    return false
  }
  return overflow.errorBound > 0
    || (overflow.kind === 'exact'
      ? overflow.probability > 0
      : overflow.probabilityUpperBound > 0)
}

function getTailProbability(overflow) {
  if (overflow === null) {
    return 0
  }
  return overflow.kind === 'exact'
    ? overflow.probability
    : overflow.probabilityUpperBound
}

function unionProbability(probabilities) {
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

function probabilityFromExplicitMass(explicitMass) {
  if (!Number.isFinite(explicitMass)) {
    failNumerical('final explicit probability mass is not finite', {
      explicitMass,
    })
  }
  return Math.min(1, Math.max(0, 1 - explicitMass))
}

function combineSupport(left, right, field) {
  if (left.kind === 'infinite' || right.kind === 'infinite') {
    return Object.freeze({ kind: 'infinite' })
  }
  return Object.freeze({
    kind: 'finite',
    max: addSafeIntegers(left.max, right.max, field),
  })
}

function estimateConvolutionBytes(leftLength, rightLength, resultLength, fftLength) {
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

function addResourceBytes(left, right, field, details = {}) {
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

function multiplyResourceBytes(left, right, field, details = {}) {
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

function estimatePersistentBytes(
  componentCount,
  outputLength,
  sourceValuesLength = 0
) {
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

function getSourceValuesLength(inspected) {
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

function snapshotInspectedComponents(inspected, signal) {
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
        CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE,
        `canonical damage envelope[${component.index}] changed while planning`,
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

function ensureLengthLimit(length, options, field, index) {
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

function estimateAggregateOutputLength(inspected, options) {
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

function buildPlan(inspected, options, persistentBytes) {
  let offset = 0
  let modeledSupport = Object.freeze({ kind: 'finite', max: 0 })
  let sourceSupport = Object.freeze({ kind: 'finite', max: 0 })
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
  const steps = []
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
          {
            index,
            requiredLinearLength,
            limit: options.maxFftLength,
          }
        )
      }
      let fftLength
      try {
        fftLength = getConvolutionFftLength(currentLength, nextLength)
      } catch (error) {
        failIndex(
          'unable to determine a safe FFT length for convolution',
          { index, causeName: error?.name, causeMessage: error?.message }
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
        fftLength * Math.log2(fftLength),
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
  if (currentLength > 0) {
    if (offset > MAX_SAFE_INTEGER - currentLength + 1) {
      failIndex(
        'aggregate offset plus values length exceeds Number.MAX_SAFE_INTEGER',
        { offset, valuesLength: currentLength }
      )
    }
  }

  const potentialOverflowLowerBound = lowerBound ?? 0
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
    potentialOverflowLowerBound,
    hasEmptyValues,
    outputLength: currentLength,
    persistentBytes,
    peakResourceBytes,
    operations,
    steps,
  }
}

function allocateValues(length, details = {}) {
  try {
    return new Float64Array(length)
  } catch (error) {
    failResource(
      'unable to allocate canonical damage aggregation values',
      { ...details, length, causeName: error?.name, causeMessage: error?.message }
    )
  }
}

function sanitizeConvolvedValues(values, signal) {
  let total = 0
  for (let index = 0; index < values.length; index += 1) {
    if (index % ABORT_CHECK_INTERVAL === 0) {
      checkAbort(signal)
    }
    let value = values[index]
    if (!Number.isFinite(value)) {
      failNumerical(
        'FFT convolution produced a non-finite probability',
        { index, value }
      )
    }
    if (value < -CANONICAL_DAMAGE_AGGREGATION_NUMERICAL_EPSILON) {
      failNumerical(
        'FFT convolution produced a material negative probability',
        { index, value }
      )
    }
    if (value < 0) {
      value = 0
    }
    if (value > 1 + CANONICAL_DAMAGE_AGGREGATION_NUMERICAL_EPSILON) {
      failNumerical(
        'FFT convolution produced a probability above one',
        { index, value }
      )
    }
    if (value > 1) {
      value = 1
    }
    values[index] = value
    total += value
  }
  checkAbort(signal)
  if (!Number.isFinite(total)) {
    failNumerical('FFT convolution mass is not finite')
  }
  return total
}

function adjustMass(values, target, signal) {
  let total = 0
  let largestIndex = -1
  let largestValue = -1
  for (let index = 0; index < values.length; index += 1) {
    if (index % ABORT_CHECK_INTERVAL === 0) {
      checkAbort(signal)
    }
    total += values[index]
    if (values[index] > largestValue) {
      largestValue = values[index]
      largestIndex = index
    }
  }
  const difference = target - total
  if (Math.abs(difference) <= Number.EPSILON * Math.max(1, target)) {
    if (largestIndex >= 0) {
      values[largestIndex] += difference
    }
    return
  }

  let remaining = difference
  if (remaining > 0) {
    for (let index = 0; index < values.length && remaining > 0; index += 1) {
      const room = 1 - values[index]
      const delta = Math.min(room, remaining)
      values[index] += delta
      remaining -= delta
    }
  } else {
    remaining = -remaining
    for (let index = 0; index < values.length && remaining > 0; index += 1) {
      const delta = Math.min(values[index], remaining)
      values[index] -= delta
      remaining -= delta
    }
    remaining = -remaining
  }
  checkAbort(signal)
  if (Math.abs(remaining) > DISTRIBUTION_RESULT_TOLERANCE) {
    failNumerical(
      'explicit probability mass could not be safely normalized',
      { target, total, remaining }
    )
  }
}

function normalizeValuesToMass(values, target, rawMass, signal) {
  if (target < 0 || target > 1 || !Number.isFinite(target)) {
    failNumerical('target explicit probability mass is invalid', { target })
  }
  if (target === 0) {
    values.fill(0)
    return 0
  }
  if (values.length === 0 || rawMass <= 0 || !Number.isFinite(rawMass)) {
    failNumerical(
      'non-zero explicit mass is required for normalization',
      { target, rawMass, valuesLength: values.length }
    )
  }
  const factor = target / rawMass
  if (!Number.isFinite(factor)) {
    failNumerical('explicit probability normalization factor is not finite', {
      target,
      rawMass,
    })
  }
  for (let index = 0; index < values.length; index += 1) {
    if (index % ABORT_CHECK_INTERVAL === 0) {
      checkAbort(signal)
    }
    const value = values[index] * factor
    if (
      !Number.isFinite(value)
      || value < -CANONICAL_DAMAGE_AGGREGATION_NUMERICAL_EPSILON
      || value > 1 + CANONICAL_DAMAGE_AGGREGATION_NUMERICAL_EPSILON
    ) {
      failNumerical(
        'explicit probability normalization produced an unsafe value',
        { index, value, target, rawMass }
      )
    }
    values[index] = Math.min(1, Math.max(0, value))
  }
  adjustMass(values, target, signal)
  let total = 0
  for (const value of values) {
    total += value
  }
  return total
}

function createComponentDescriptor(component) {
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

function overflowsEqual(left, right) {
  if (left === null || right === null) {
    return left === right
  }
  if (left.kind !== right.kind || left.lowerBound !== right.lowerBound) {
    return false
  }
  if (left.kind === 'exact') {
    return left.probability === right.probability
      && left.errorBound === right.errorBound
  }
  return left.probabilityUpperBound === right.probabilityUpperBound
    && left.errorBound === right.errorBound
}

function createOutputResult(values, plan, overflow, singleResult, signal) {
  if (singleResult !== null) {
    if (
      Object.isFrozen(singleResult)
      && Object.isFrozen(singleResult.support)
      && (
        singleResult.overflow === null
        || Object.isFrozen(singleResult.overflow)
      )
      && overflowsEqual(singleResult.overflow, overflow)
    ) {
      return singleResult
    }
    try {
      return createDistributionResult({
        values: singleResult.values,
        offset: plan.offset,
        support: plan.modeledSupport,
        overflow,
      })
    } catch (error) {
      fail(
        CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.NUMERICAL_FAILURE,
        'single canonical damage result could not be safely reused',
        { causeCode: error?.code, causeName: error?.name }
      )
    }
  }

  checkAbort(signal)
  try {
    return createDistributionResult({
      values,
      offset: plan.offset,
      support: plan.modeledSupport,
      overflow,
    })
  } catch (error) {
    const code = error?.code === 'index-overflow'
      ? CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INDEX_OVERFLOW
      : CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.NUMERICAL_FAILURE
    fail(
      code,
      'aggregated canonical damage result failed canonical validation',
      { causeCode: error?.code, causeName: error?.name }
    )
  }
}

function createAggregateProjectionUncertainty(inspected, aggregationErrorBound) {
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
    unionProbability(positionBounds) + aggregationErrorBound
  )
  return Object.freeze({
    positionUnknownProbabilityUpperBound,
    outputOverflowLowerBound,
  })
}

function createMetadata(inspected, plan, diagnostics) {
  const componentDescriptors = Object.freeze(inspected.map(createComponentDescriptor))
  const modeledSupport = copySupport(plan.modeledSupport)
  const sourceSupport = copySupport(plan.sourceSupport)
  const projectionUncertainty = createAggregateProjectionUncertainty(
    inspected,
    diagnostics.aggregationErrorBound
  )
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
    ...(projectionUncertainty === null ? {} : { projectionUncertainty }),
  })
}

function createPlanContract(canonicalDamages, inspected, plan, normalizedOptions) {
  const steps = Object.freeze(plan.steps.map((step) => Object.freeze({ ...step })))
  const estimates = Object.freeze({
    float64Bytes: plan.peakResourceBytes,
    operations: plan.operations,
    timeMs: null,
    persistentBytes: plan.persistentBytes,
    peakResourceBytes: plan.peakResourceBytes,
    fftLengths: Object.freeze(steps.map((step) => step.fftLength)),
  })
  const publicPlan = Object.freeze({
    version: CANONICAL_DAMAGE_AGGREGATION_PLAN_VERSION,
    operation: 'canonical-damage-aggregation',
    componentCount: canonicalDamages.length,
    outputLength: plan.outputLength,
    offset: plan.offset,
    modeledSupport: copySupport(plan.modeledSupport),
    sourceSupport: copySupport(plan.sourceSupport),
    steps,
    estimates,
  })

  PLAN_RECORDS.set(publicPlan, {
    canonicalDamages,
    inspected,
    plan,
    normalizedOptions,
  })
  return publicPlan
}

function createCanonicalDamagePlan(canonicalDamages, normalizedOptions) {
  checkAbort(normalizedOptions.signal)

  if (!Array.isArray(canonicalDamages)) {
    fail(
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE,
      'canonicalDamages must be an array of canonical damage envelopes'
    )
  }
  if (canonicalDamages.length > normalizedOptions.maxComponents) {
    failResource(
      'canonical damage component count exceeds the configured resource limit',
      {
        componentCount: canonicalDamages.length,
        limit: normalizedOptions.maxComponents,
      }
    )
  }

  // Guard the fixed component/inspected/step/descriptor/metadata overhead
  // before allocating the inspected records; refine it with the actual output
  // length before buildPlan can allocate its step records.
  let persistentBytes = estimatePersistentBytes(
    canonicalDamages.length,
    1
  )
  if (persistentBytes > normalizedOptions.maxResourceBytes) {
    failResource(
      'persistent canonical damage aggregation resources exceed the configured resource limit',
      {
        componentCount: canonicalDamages.length,
        persistentBytes,
        limit: normalizedOptions.maxResourceBytes,
      }
    )
  }

  if (canonicalDamages.length === 0) {
    if (normalizedOptions.maxValuesLength < 1) {
      failResource(
        'zero-component identity exceeds the configured values length limit',
        { length: 1, limit: normalizedOptions.maxValuesLength }
      )
    }
    const plan = {
      offset: 0,
      modeledSupport: Object.freeze({ kind: 'finite', max: 0 }),
      sourceSupport: Object.freeze({ kind: 'finite', max: 0 }),
      exactUnion: 0,
      upperUnion: 0,
      hasUpperBound: false,
      expectedExplicitMass: 1,
      allOverflowNull: true,
      sourceErrorBound: 0,
      potentialOverflowLowerBound: 0,
      hasEmptyValues: false,
      outputLength: 1,
      persistentBytes,
      peakResourceBytes: persistentBytes,
      operations: 0,
      steps: [],
    }
    return createPlanContract(
      canonicalDamages,
      [],
      plan,
      normalizedOptions
    )
  }

  const inspected = canonicalDamages.map((envelope, index) =>
    inspectEnvelope(envelope, index, normalizedOptions.signal)
  )
  for (const component of inspected) {
    ensureLengthLimit(
      component.values.length,
      normalizedOptions,
      'component values length',
      component.index
    )
  }
  const outputLength = estimateAggregateOutputLength(
    inspected,
    normalizedOptions
  )
  persistentBytes = estimatePersistentBytes(
    canonicalDamages.length,
    outputLength,
    getSourceValuesLength(inspected)
  )
  if (persistentBytes > normalizedOptions.maxResourceBytes) {
    failResource(
      'persistent canonical damage aggregation resources exceed the configured resource limit',
      {
        componentCount: canonicalDamages.length,
        outputLength,
        persistentBytes,
        limit: normalizedOptions.maxResourceBytes,
      }
    )
  }
  // Own a validated copy of each coefficient array before publishing the
  // plan. The public plan can then represent fixed work even if the caller
  // mutates its original canonical results while waiting for admission.
  const ownedInspected = snapshotInspectedComponents(
    inspected,
    normalizedOptions.signal
  )
  const plan = buildPlan(ownedInspected, normalizedOptions, persistentBytes)
  checkAbort(normalizedOptions.signal)
  return createPlanContract(
    canonicalDamages,
    ownedInspected,
    plan,
    normalizedOptions
  )
}

function getPlanRecord(plan) {
  const record = PLAN_RECORDS.get(plan)
  if (!record) {
    fail(
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS,
      'canonical damage aggregation plan is not an approved immutable plan'
    )
  }
  return record
}

function assertPlanMatchesInput(planRecord, canonicalDamages) {
  if (planRecord.canonicalDamages !== canonicalDamages) {
    fail(
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS,
      'canonical damage aggregation plan does not match the input snapshot'
    )
  }
}

function assertPlanLimitsMatch(planRecord, options) {
  for (const name of [
    'maxValuesLength',
    'maxFftLength',
    'maxResourceBytes',
    'maxComponents',
  ]) {
    if (
      hasOwn(options, name)
      && options[name] !== planRecord.normalizedOptions[name]
    ) {
      fail(
        CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS,
        `canonical damage aggregation plan does not match ${name}`,
        { name, planned: planRecord.normalizedOptions[name], value: options[name] }
      )
    }
  }
}

function getExecutionOptions(planRecord, normalizedOptions) {
  return Object.freeze({
    ...planRecord.normalizedOptions,
    signal: normalizedOptions.signal ?? planRecord.normalizedOptions.signal,
    onFftLength:
      normalizedOptions.onFftLength ?? planRecord.normalizedOptions.onFftLength,
    plan: null,
  })
}

/**
 * Validate aggregation options without inspecting or planning any damage
 * envelopes. CalculationClient uses this narrow preflight for batch input so
 * invalid resource limits are rejected before an attack starts.
 */
export function validateCanonicalDamageAggregationOptions(options = {}) {
  return normalizeOptions(options)
}

/**
 * Validate and plan an independent canonical damage sum without allocating
 * convolution buffers. The returned plan is an immutable, opaque contract;
 * pass it back to sumCanonicalDamage to execute the exact planned work.
 */
export function planCanonicalDamageAggregation(
  canonicalDamages,
  options = {}
) {
  const normalizedOptions = normalizeOptions(options)
  return createCanonicalDamagePlan(canonicalDamages, normalizedOptions)
}

/**
 * Add independent canonical damage distributions without collapsing overflow
 * into a point value. Every component must be a modeled canonical damage
 * envelope with a source-support descriptor.
 */
function executeCanonicalDamagePlan(planRecord, normalizedOptions) {
  const { inspected, plan } = planRecord
  const executionOptions = getExecutionOptions(planRecord, normalizedOptions)
  checkAbort(executionOptions.signal)

  if (inspected.length === 0) {
    const result = createDistributionResult({
      values: [1],
      offset: 0,
      support: { kind: 'finite', max: 0 },
      overflow: null,
    })
    const metadata = createMetadata([], plan, {
      aggregationErrorBound: 0,
      rawExplicitMass: 1,
      explicitMass: 1,
      fftMassDrift: 0,
      sourceMassDrift: 0,
    })
    return Object.freeze({ result, metadata })
  }

  let values
  let singleResult = null
  if (inspected.length === 1) {
    singleResult = inspected[0].result
    values = inspected[0].values
  } else if (plan.hasEmptyValues) {
    values = allocateValues(0)
  } else {
    values = inspected[0].values
    for (const step of plan.steps) {
      checkAbort(executionOptions.signal)
      try {
        values = convolveDistributions(values, inspected[step.index].values, {
          fftLength: step.fftLength,
          signal: executionOptions.signal,
          onFftLength: executionOptions.onFftLength,
        })
      } catch (error) {
        if (
          executionOptions.signal?.aborted
          || error?.name === 'AbortError'
        ) {
          throw new CanonicalDamageAggregationAbortError()
        }
        throw error
      }
      checkAbort(executionOptions.signal)
    }
  }

  let rawExplicitMass
  let explicitMass
  let fftMassDrift = 0
  let sourceMassDrift = 0
  let outputExactProbability = null
  if (singleResult !== null) {
    rawExplicitMass = inspected[0].explicitMass
    explicitMass = rawExplicitMass
  } else {
    rawExplicitMass = sanitizeConvolvedValues(values, executionOptions.signal)
    fftMassDrift = Math.abs(rawExplicitMass - plan.expectedExplicitMass)
    if (fftMassDrift > DISTRIBUTION_RESULT_TOLERANCE) {
      failNumerical(
        'FFT convolution mass drift exceeds the canonical tolerance',
        {
          expectedExplicitMass: plan.expectedExplicitMass,
          rawExplicitMass,
          fftMassDrift,
          tolerance: DISTRIBUTION_RESULT_TOLERANCE,
        }
      )
    }

    if (plan.hasUpperBound) {
      if (rawExplicitMass > 1) {
        if (rawExplicitMass > 1 + DISTRIBUTION_RESULT_TOLERANCE) {
          failNumerical(
            'upper-bound aggregation explicit mass exceeds one',
            { rawExplicitMass }
          )
        }
        explicitMass = normalizeValuesToMass(
          values,
          1,
          rawExplicitMass,
          executionOptions.signal
        )
      } else {
        explicitMass = rawExplicitMass
      }
    }
  }

  if (!plan.hasUpperBound) {
    const targetExplicitMass = Math.max(0, 1 - plan.exactUnion)
    if (singleResult === null) {
      if (
        rawExplicitMass === 0
        && targetExplicitMass <= DISTRIBUTION_RESULT_TOLERANCE
      ) {
        values.fill(0)
        explicitMass = 0
      } else {
        explicitMass = normalizeValuesToMass(
          values,
          targetExplicitMass,
          rawExplicitMass,
          executionOptions.signal
        )
      }
    }
    outputExactProbability = probabilityFromExplicitMass(explicitMass)
    sourceMassDrift = Math.max(
      Math.abs(plan.expectedExplicitMass - targetExplicitMass),
      Math.abs(plan.exactUnion - outputExactProbability)
    )
  }

  const aggregationErrorBound = addFiniteNumbers(
    addFiniteNumbers(
      plan.sourceErrorBound,
      fftMassDrift,
      'aggregation error bound'
    ),
    sourceMassDrift,
    'aggregation error bound'
  )

  let outputOverflow
  if (plan.hasUpperBound) {
    const coverageUpperBound = Math.max(0, 1 - explicitMass)
    const probabilityUpperBound = Math.min(
      1,
      Math.max(plan.upperUnion, coverageUpperBound)
    )
    outputOverflow = {
      kind: 'upper-bound',
      lowerBound: plan.potentialOverflowLowerBound,
      probabilityUpperBound,
      errorBound: aggregationErrorBound,
    }
  } else if (plan.allOverflowNull) {
    outputOverflow = null
  } else {
    outputOverflow = {
      kind: 'exact',
      lowerBound: plan.potentialOverflowLowerBound,
      probability: outputExactProbability,
      errorBound: aggregationErrorBound,
    }
  }

  const result = createOutputResult(
    values,
    plan,
    outputOverflow,
    singleResult,
    executionOptions.signal
  )
  const metadata = createMetadata(inspected, plan, {
    aggregationErrorBound,
    rawExplicitMass,
    explicitMass,
    fftMassDrift,
    sourceMassDrift,
  })
  checkAbort(executionOptions.signal)
  return Object.freeze({ result, metadata })
}

/**
 * Execute a canonical damage sum. When `options.plan` (or the optional third
 * argument) is supplied, no envelope validation or resource planning is
 * repeated: the approved immutable plan is executed directly.
 */
export function sumCanonicalDamage(
  canonicalDamages,
  options = {},
  explicitPlan = undefined
) {
  let rawOptions = options
  if (explicitPlan !== undefined) {
    if (!isRecord(options)) {
      fail(
        CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS,
        'canonical damage aggregation options must be an object'
      )
    }
    rawOptions = { ...options, plan: explicitPlan }
  }

  const normalizedOptions = normalizeOptions(rawOptions, true)
  let planRecord
  if (normalizedOptions.plan === null) {
    const publicPlan = createCanonicalDamagePlan(
      canonicalDamages,
      normalizedOptions
    )
    planRecord = getPlanRecord(publicPlan)
  } else {
    planRecord = getPlanRecord(normalizedOptions.plan)
    assertPlanMatchesInput(planRecord, canonicalDamages)
    assertPlanLimitsMatch(planRecord, rawOptions)
    checkAbort(normalizedOptions.signal)
  }

  return executeCanonicalDamagePlan(planRecord, normalizedOptions)
}
