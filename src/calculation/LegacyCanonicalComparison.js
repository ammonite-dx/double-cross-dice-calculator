import {
  DISTRIBUTION_RESULT_ERROR_CODES,
  LEGACY_PUBLISHED_BUCKET_LENGTH,
  DistributionResultAdapterError,
  fromPublishedBucketDistribution,
  isDistributionResultAdapterError,
  toPublishedBucketDistribution,
} from './DistributionResult'

export const LEGACY_CANONICAL_COMPARISON_THRESHOLDS = Object.freeze({
  mass: 1e-8,
  maxAbsolute: 2e-6,
  l1: 2e-4,
})

export const LEGACY_CANONICAL_COMPARISON_DEFAULT_THRESHOLDS =
  LEGACY_CANONICAL_COMPARISON_THRESHOLDS

export const LEGACY_CANONICAL_COMPARISON_ERROR_CODES = Object.freeze({
  INVALID_OPTIONS: 'invalid-options',
})

export class LegacyCanonicalComparisonError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'LegacyCanonicalComparisonError'
    this.code = code
    this.details = Object.freeze({ ...details })
    this.legacyCanonicalComparison = true
  }
}

export function isLegacyCanonicalComparisonError(error) {
  return error?.legacyCanonicalComparison === true
    && typeof error.code === 'string'
}

function isRecord(value) {
  try {
    return value !== null
      && typeof value === 'object'
      && !Array.isArray(value)
  } catch {
    return false
  }
}

function isObjectValue(value) {
  return value !== null && typeof value === 'object'
}

function failInvalidEnvelope(message, details = {}) {
  throw new DistributionResultAdapterError(
    DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SCHEMA,
    message,
    details
  )
}

function failLegacyAdapter(code, message, details = {}) {
  throw new DistributionResultAdapterError(code, message, details)
}

function failInvalidLegacySchema(message, details = {}) {
  failLegacyAdapter(
    DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SCHEMA,
    message,
    details
  )
}

function failInvalidOptions(code, message, details = {}) {
  throw new LegacyCanonicalComparisonError(code, message, details)
}

function getCauseNameSafely(error) {
  try {
    return error !== null
      && error !== undefined
      && typeof error.name === 'string'
      ? error.name
      : undefined
  } catch {
    return undefined
  }
}

function getOwnPropertyDescriptorSafely(object, property, path, fail) {
  if (!isObjectValue(object)) {
    fail(`${path} must be an object`, { path })
  }

  let descriptor
  try {
    descriptor = Object.getOwnPropertyDescriptor(object, property)
  } catch (error) {
    fail(
      `${path} could not be inspected safely`,
      { path, causeName: getCauseNameSafely(error) }
    )
  }
  return descriptor
}

function readOwnDataProperty(object, property, path, fail) {
  const descriptor = getOwnPropertyDescriptorSafely(
    object,
    property,
    path,
    fail
  )
  if (
    descriptor === undefined
    || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
  ) {
    fail(
      `${path} must be an own data property`,
      { path }
    )
  }
  return descriptor.value
}

function readOptionalOwnDataProperty(object, property, path, fail) {
  const descriptor = getOwnPropertyDescriptorSafely(
    object,
    property,
    path,
    fail
  )
  if (
    descriptor === undefined
  ) {
    return { present: false, value: undefined }
  }
  if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    fail(
      `${path} must be an own data property`,
      { path }
    )
  }
  return { present: true, value: descriptor.value }
}

function getLegacySourceKind(distribution) {
  let isArray
  let isFloat64Array
  try {
    isArray = Array.isArray(distribution)
    isFloat64Array = distribution instanceof Float64Array
  } catch (error) {
    failLegacyAdapter(
      DISTRIBUTION_RESULT_ERROR_CODES.LEGACY_INPUT,
      'legacy published distribution could not be inspected safely',
      { causeName: getCauseNameSafely(error) }
    )
  }
  if (isArray) {
    return 'array'
  }
  if (isFloat64Array) {
    return 'float64-array'
  }
  failLegacyAdapter(
    DISTRIBUTION_RESULT_ERROR_CODES.LEGACY_INPUT,
    'legacy published distribution must be an Array or Float64Array'
  )
}

function readLegacyLength(distribution, sourceKind) {
  let length
  if (sourceKind === 'array') {
    length = readOwnDataProperty(
      distribution,
      'length',
      'legacyDistribution.length',
      failInvalidLegacySchema
    )
  } else {
    const descriptor = getOwnPropertyDescriptorSafely(
      distribution,
      'length',
      'legacyDistribution.length',
      failInvalidLegacySchema
    )
    if (descriptor !== undefined) {
      if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        failInvalidLegacySchema(
          'legacyDistribution.length must be an own data property',
          { path: 'legacyDistribution.length' }
        )
      }
      length = descriptor.value
    } else {
      let typedArrayLengthGetter
      try {
        const typedArrayPrototype = Object.getPrototypeOf(
          Float64Array.prototype
        )
        typedArrayLengthGetter = Object.getOwnPropertyDescriptor(
          typedArrayPrototype,
          'length'
        )?.get
      } catch (error) {
        failInvalidLegacySchema(
          'Float64Array length getter could not be inspected safely',
          {
            path: 'legacyDistribution.length',
            causeName: getCauseNameSafely(error),
          }
        )
      }
      if (typeof typedArrayLengthGetter !== 'function') {
        failInvalidLegacySchema(
          'Float64Array length getter is unavailable',
          { path: 'legacyDistribution.length' }
        )
      }
      try {
        length = Reflect.apply(typedArrayLengthGetter, distribution, [])
      } catch (error) {
        failInvalidLegacySchema(
          'legacyDistribution.length could not be inspected safely',
          {
            path: 'legacyDistribution.length',
            causeName: getCauseNameSafely(error),
          }
        )
      }
    }
  }

  if (
    !Number.isSafeInteger(length)
    || length !== LEGACY_PUBLISHED_BUCKET_LENGTH
  ) {
    failLegacyAdapter(
      DISTRIBUTION_RESULT_ERROR_CODES.LEGACY_LENGTH,
      `legacy published distribution must have ${LEGACY_PUBLISHED_BUCKET_LENGTH} entries`,
      { length }
    )
  }
  return length
}

function readLegacyIndexedValue(distribution, index) {
  const path = `legacyDistribution[${index}]`
  const descriptor = getOwnPropertyDescriptorSafely(
    distribution,
    String(index),
    path,
    failInvalidLegacySchema
  )
  if (descriptor === undefined) {
    // Preserve the existing adapter's sparse-array behavior: a missing
    // indexed value is validated as a non-finite probability.
    failLegacyAdapter(
      DISTRIBUTION_RESULT_ERROR_CODES.NON_FINITE_PROBABILITY,
      'legacy published distribution must contain finite probabilities',
      { index, value: undefined }
    )
  }
  if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    failInvalidLegacySchema(
      `${path} must be an own data property`,
      { path }
    )
  }

  const value = descriptor.value
  if (!Number.isFinite(value)) {
    failLegacyAdapter(
      DISTRIBUTION_RESULT_ERROR_CODES.NON_FINITE_PROBABILITY,
      'legacy published distribution must contain finite probabilities',
      { index, value }
    )
  }
  if (value < 0) {
    failLegacyAdapter(
      DISTRIBUTION_RESULT_ERROR_CODES.NEGATIVE_PROBABILITY,
      'legacy published distribution must contain non-negative probabilities',
      { index, value }
    )
  }
  if (value > 1) {
    failLegacyAdapter(
      DISTRIBUTION_RESULT_ERROR_CODES.PROBABILITY_ABOVE_ONE,
      'legacy published distribution probabilities must not exceed one',
      { index, value }
    )
  }
  return value
}

function snapshotLegacyDistribution(distribution) {
  const sourceKind = getLegacySourceKind(distribution)
  const length = readLegacyLength(distribution, sourceKind)
  const snapshot = new Float64Array(length)
  for (let index = 0; index < length; index += 1) {
    snapshot[index] = readLegacyIndexedValue(distribution, index)
  }
  return snapshot
}

function copySafeFloat64Array(values, path) {
  let isFloat64Array
  try {
    isFloat64Array = values instanceof Float64Array
  } catch (error) {
    failInvalidEnvelope(
      `${path} could not be inspected safely`,
      { path, causeName: getCauseNameSafely(error) }
    )
  }
  if (!isFloat64Array) {
    failInvalidEnvelope(
      `${path} must be a Float64Array`,
      { path }
    )
  }

  try {
    return new Float64Array(values)
  } catch (error) {
    failInvalidEnvelope(
      `${path} could not be copied safely`,
      { path, causeName: getCauseNameSafely(error) }
    )
  }
}

function copySafeSupport(support, path) {
  if (!isRecord(support)) {
    failInvalidEnvelope(`${path} must be an object`, { path })
  }
  const kind = readOwnDataProperty(
    support,
    'kind',
    `${path}.kind`,
    failInvalidEnvelope
  )
  const snapshot = { kind }
  if (kind === 'finite') {
    snapshot.max = readOwnDataProperty(
      support,
      'max',
      `${path}.max`,
      failInvalidEnvelope
    )
  } else if (kind === 'infinite') {
    const max = readOptionalOwnDataProperty(
      support,
      'max',
      `${path}.max`,
      failInvalidEnvelope
    )
    if (max.present) {
      // Preserve the invalid own property so the existing validator retains
      // its precise support error instead of silently dropping it.
      snapshot.max = max.value
    }
  }
  return snapshot
}

function copySafeOverflow(overflow, path, options = {}) {
  if (overflow === null) {
    return null
  }
  if (!isRecord(overflow)) {
    failInvalidEnvelope(`${path} must be null or an object`, { path })
  }
  const kind = readOwnDataProperty(
    overflow,
    'kind',
    `${path}.kind`,
    failInvalidEnvelope
  )
  if (kind !== 'exact' && kind !== 'upper-bound') {
    failInvalidEnvelope(
      `${path}.kind must be exact or upper-bound`,
      { path: `${path}.kind`, kind }
    )
  }
  const lowerBound = readOwnDataProperty(
    overflow,
    'lowerBound',
    `${path}.lowerBound`,
    failInvalidEnvelope
  )
  const errorBound = readOwnDataProperty(
    overflow,
    'errorBound',
    `${path}.errorBound`,
    failInvalidEnvelope
  )
  const snapshot = {
    kind,
    lowerBound,
    errorBound,
  }
  if (kind === 'exact') {
    snapshot.probability = readOwnDataProperty(
      overflow,
      'probability',
      `${path}.probability`,
      failInvalidEnvelope
    )
  } else if (kind === 'upper-bound') {
    snapshot.probabilityUpperBound = readOwnDataProperty(
      overflow,
      'probabilityUpperBound',
      `${path}.probabilityUpperBound`,
      failInvalidEnvelope
    )
  }

  if (options.validateNumeric === true) {
    if (!Number.isSafeInteger(lowerBound) || lowerBound < 0) {
      failInvalidEnvelope(
        `${path}.lowerBound must be a non-negative safe integer`,
        { path: `${path}.lowerBound`, lowerBound }
      )
    }
    if (!Number.isFinite(errorBound) || errorBound < 0) {
      failInvalidEnvelope(
        `${path}.errorBound must be a finite non-negative number`,
        { path: `${path}.errorBound`, errorBound }
      )
    }
    const probability = kind === 'exact'
      ? snapshot.probability
      : snapshot.probabilityUpperBound
    if (!Number.isFinite(probability)) {
      failInvalidEnvelope(
        `${path}.${kind === 'exact' ? 'probability' : 'probabilityUpperBound'} must be a finite probability`,
        { path, probability }
      )
    }
    if (probability < 0) {
      failInvalidEnvelope(
        `${path}.${kind === 'exact' ? 'probability' : 'probabilityUpperBound'} must be non-negative`,
        { path, probability }
      )
    }
    if (probability > 1) {
      failInvalidEnvelope(
        `${path}.${kind === 'exact' ? 'probability' : 'probabilityUpperBound'} must not exceed one`,
        { path, probability }
      )
    }
  }
  return snapshot
}

function copySafeComponentDescriptors(componentDescriptors, path) {
  let isArray
  try {
    isArray = Array.isArray(componentDescriptors)
  } catch (error) {
    failInvalidEnvelope(
      `${path} could not be inspected safely`,
      { path, causeName: getCauseNameSafely(error) }
    )
  }
  if (!isArray) {
    failInvalidEnvelope(`${path} must be an array`, { path })
  }

  const length = readOwnDataProperty(
    componentDescriptors,
    'length',
    `${path}.length`,
    failInvalidEnvelope
  )
  if (!Number.isSafeInteger(length) || length < 0) {
    failInvalidEnvelope(
      `${path}.length must be a non-negative safe integer`,
      { path, length }
    )
  }

  const snapshot = []
  for (let index = 0; index < length; index += 1) {
    const descriptor = readOwnDataProperty(
      componentDescriptors,
      String(index),
      `${path}[${index}]`,
      failInvalidEnvelope
    )
    if (!isRecord(descriptor)) {
      failInvalidEnvelope(
        `${path}[${index}] must be an object`,
        { path: `${path}[${index}]` }
      )
    }

    const overflow = readOptionalOwnDataProperty(
      descriptor,
      'overflow',
      `${path}[${index}].overflow`,
      failInvalidEnvelope
    )
    const descriptorSnapshot = {}
    if (overflow.present) {
      descriptorSnapshot.overflow = copySafeOverflow(
        overflow.value,
        `${path}[${index}].overflow`,
        { validateNumeric: true }
      )
    }
    snapshot.push(descriptorSnapshot)
  }
  return snapshot
}

function copySafeMetadata(metadata) {
  if (!isRecord(metadata)) {
    failInvalidEnvelope(
      'canonicalEnvelope.metadata must be an object',
      { field: 'metadata' }
    )
  }
  const modeledDistribution = readOwnDataProperty(
    metadata,
    'modeledDistribution',
    'canonicalEnvelope.metadata.modeledDistribution',
    failInvalidEnvelope
  )
  if (modeledDistribution !== true) {
    failInvalidEnvelope(
      'canonicalEnvelope.metadata.modeledDistribution must be true',
      { field: 'metadata.modeledDistribution' }
    )
  }

  const snapshot = { modeledDistribution: true }
  for (const property of [
    'aggregation',
    'sourceOverflowProbability',
    'sourceOverflowProbabilityUpperBound',
    'sourceErrorBound',
  ]) {
    const value = readOptionalOwnDataProperty(
      metadata,
      property,
      `canonicalEnvelope.metadata.${property}`,
      failInvalidEnvelope
    )
    if (value.present) {
      snapshot[property] = value.value
    }
  }

  const componentDescriptors = readOptionalOwnDataProperty(
    metadata,
    'componentDescriptors',
    'canonicalEnvelope.metadata.componentDescriptors',
    failInvalidEnvelope
  )
  if (componentDescriptors.present) {
    snapshot.componentDescriptors = copySafeComponentDescriptors(
      componentDescriptors.value,
      'canonicalEnvelope.metadata.componentDescriptors'
    )
  }
  return snapshot
}

function copySafeCanonicalResult(result) {
  if (!isRecord(result)) {
    failInvalidEnvelope('canonicalEnvelope.result must be an object', {
      field: 'result',
    })
  }
  const version = readOwnDataProperty(
    result,
    'version',
    'canonicalEnvelope.result.version',
    failInvalidEnvelope
  )
  const values = readOwnDataProperty(
    result,
    'values',
    'canonicalEnvelope.result.values',
    failInvalidEnvelope
  )
  const offset = readOwnDataProperty(
    result,
    'offset',
    'canonicalEnvelope.result.offset',
    failInvalidEnvelope
  )
  const support = readOwnDataProperty(
    result,
    'support',
    'canonicalEnvelope.result.support',
    failInvalidEnvelope
  )
  const overflow = readOwnDataProperty(
    result,
    'overflow',
    'canonicalEnvelope.result.overflow',
    failInvalidEnvelope
  )

  return {
    version,
    values: copySafeFloat64Array(
      values,
      'canonicalEnvelope.result.values'
    ),
    offset,
    support: copySafeSupport(
      support,
      'canonicalEnvelope.result.support'
    ),
    overflow: copySafeOverflow(
      overflow,
      'canonicalEnvelope.result.overflow'
    ),
  }
}

function validateCanonicalEnvelope(canonicalEnvelope) {
  if (!isRecord(canonicalEnvelope)) {
    failInvalidEnvelope(
      'canonical comparison expects a canonical distribution envelope'
    )
  }

  const result = readOwnDataProperty(
    canonicalEnvelope,
    'result',
    'canonicalEnvelope.result',
    failInvalidEnvelope
  )
  const metadata = readOwnDataProperty(
    canonicalEnvelope,
    'metadata',
    'canonicalEnvelope.metadata',
    failInvalidEnvelope
  )

  return {
    result: copySafeCanonicalResult(result),
    metadata: copySafeMetadata(metadata),
  }
}

function failInvalidComparisonOptions(message, details = {}) {
  failInvalidOptions(
    LEGACY_CANONICAL_COMPARISON_ERROR_CODES.INVALID_OPTIONS,
    message,
    details
  )
}

function normalizeComparisonOptions(options) {
  if (options === undefined) {
    return {
      scope: 'damage',
      thresholds: LEGACY_CANONICAL_COMPARISON_THRESHOLDS,
    }
  }
  if (!isRecord(options)) {
    failInvalidComparisonOptions(
      'legacy/canonical comparison options must be an object'
    )
  }

  const scopeProperty = readOptionalOwnDataProperty(
    options,
    'scope',
    'comparison.options.scope',
    failInvalidComparisonOptions
  )
  const scope = scopeProperty.present
    && scopeProperty.value !== null
    && scopeProperty.value !== undefined
    ? scopeProperty.value
    : 'damage'
  if (scope !== 'damage' && scope !== 'total') {
    failInvalidComparisonOptions(
      'comparison scope must be damage or total',
      { field: 'scope', value: scope }
    )
  }

  const thresholdsProperty = readOptionalOwnDataProperty(
    options,
    'thresholds',
    'comparison.options.thresholds',
    failInvalidComparisonOptions
  )
  const supplied = thresholdsProperty.present
    && thresholdsProperty.value !== undefined
    ? thresholdsProperty.value
    : {}
  if (!isRecord(supplied)) {
    failInvalidComparisonOptions(
      'comparison thresholds must be an object',
      { field: 'thresholds' }
    )
  }

  const thresholds = {}
  for (const name of ['mass', 'maxAbsolute', 'l1']) {
    const property = readOptionalOwnDataProperty(
      supplied,
      name,
      `comparison.options.thresholds.${name}`,
      failInvalidComparisonOptions
    )
    const value = property.present && property.value !== undefined
      ? property.value
      : LEGACY_CANONICAL_COMPARISON_THRESHOLDS[name]
    if (!Number.isFinite(value) || value < 0) {
      failInvalidComparisonOptions(
        `comparison threshold ${name} must be finite and non-negative`,
        { field: `thresholds.${name}`, value }
      )
    }
    thresholds[name] = value
  }
  return {
    scope,
    thresholds: Object.freeze(thresholds),
  }
}

function projectLegacyDistribution(distribution) {
  // Snapshot the legacy source before invoking the existing adapter. This
  // keeps adapter reads away from accessors, sparse arrays, and Proxy traps.
  const snapshot = snapshotLegacyDistribution(distribution)
  const canonical = fromPublishedBucketDistribution(snapshot, {
    // Bucket 1023 is the legacy overflow bucket, not evidence of a finite
    // canonical maximum. Preserve that distinction for the round-trip.
    support: { kind: 'infinite' },
  })
  return toPublishedBucketDistribution(canonical)
}

function getProjectionFailure(error, thresholds, scope) {
  if (!isDistributionResultAdapterError(error)) {
    return null
  }

  if (error.code === DISTRIBUTION_RESULT_ERROR_CODES.UPPER_BOUND_PROJECTION) {
    return createNotComparable(
      'upper-bound-overflow',
      thresholds,
      scope,
      { causeCode: error.code, ...error.details }
    )
  }
  if (error.code === DISTRIBUTION_RESULT_ERROR_CODES.UNSAFE_PROJECTION) {
    return createNotComparable(
      'unsafe-exact-overflow',
      thresholds,
      scope,
      { causeCode: error.code, ...error.details }
    )
  }
  return null
}

function hasActiveOverflow(overflow) {
  if (overflow === null || overflow === undefined) {
    return false
  }
  try {
    if (!isRecord(overflow)) {
      return true
    }
    if (
      !Number.isSafeInteger(overflow.lowerBound)
      || overflow.lowerBound < 0
      || !Number.isFinite(overflow.errorBound)
      || overflow.errorBound < 0
    ) {
      return true
    }
    if (overflow.kind === 'exact') {
      if (
        !Number.isFinite(overflow.probability)
        || overflow.probability < 0
        || overflow.probability > 1
      ) {
        return true
      }
      return overflow.probability > 0 || overflow.errorBound > 0
    }
    if (overflow.kind === 'upper-bound') {
      if (
        !Number.isFinite(overflow.probabilityUpperBound)
        || overflow.probabilityUpperBound < 0
        || overflow.probabilityUpperBound > 1
      ) {
        return true
      }
      return overflow.probabilityUpperBound > 0 || overflow.errorBound > 0
    }
  } catch {
    return true
  }
  return true
}

function hasTotalOverflowInvolvement(result, metadata) {
  if (hasActiveOverflow(result.overflow)) {
    return true
  }

  const componentDescriptors = metadata.componentDescriptors
  if (Array.isArray(componentDescriptors)) {
    for (const descriptor of componentDescriptors) {
      if (isRecord(descriptor) && hasActiveOverflow(descriptor.overflow)) {
        return true
      }
    }
  }

  for (const property of [
    'sourceOverflowProbability',
    'sourceOverflowProbabilityUpperBound',
  ]) {
    const value = metadata[property]
    if (Number.isFinite(value) && value > 0) {
      return true
    }
  }
  return false
}

function createNotComparable(reason, thresholds, scope, details = {}) {
  return Object.freeze({
    kind: 'not-comparable',
    scope,
    reason,
    passed: false,
    thresholds,
    details: Object.freeze({ ...details }),
  })
}

function compareProjectedDistributions(legacy, canonical) {
  let legacyMass = 0
  let canonicalMass = 0
  let maxAbsoluteDifference = 0
  let l1Difference = 0

  for (let index = 0; index < legacy.length; index += 1) {
    const legacyProbability = legacy[index]
    const canonicalProbability = canonical[index]
    legacyMass += legacyProbability
    canonicalMass += canonicalProbability
    const difference = Math.abs(
      legacyProbability - canonicalProbability
    )
    maxAbsoluteDifference = Math.max(
      maxAbsoluteDifference,
      difference
    )
    l1Difference += difference
  }

  return {
    legacyMass,
    canonicalMass,
    massDifference: Math.abs(legacyMass - canonicalMass),
    maxAbsoluteDifference,
    l1Difference,
  }
}

function createComparableResult(scope, thresholds, metrics) {
  const passed = metrics.massDifference <= thresholds.mass
    && metrics.maxAbsoluteDifference <= thresholds.maxAbsolute
    && metrics.l1Difference <= thresholds.l1

  return Object.freeze({
    kind: 'comparable',
    scope,
    ...metrics,
    thresholds,
    passed,
  })
}

/**
 * Compare a legacy 1024 published distribution with a canonical envelope.
 *
 * Invalid legacy/canonical input keeps the existing DistributionResult typed
 * error contract. A valid canonical result that cannot be projected to the
 * published shape returns a discriminated `not-comparable` result instead of
 * inventing probability for its overflow.
 */
function compareNormalizedDistributions(
  legacyDistribution,
  canonicalEnvelope,
  { scope, thresholds }
) {
  const legacy = projectLegacyDistribution(legacyDistribution)
  const { result, metadata } = validateCanonicalEnvelope(canonicalEnvelope)

  let canonical
  try {
    canonical = toPublishedBucketDistribution(result)
  } catch (error) {
    const projectionFailure = getProjectionFailure(error, thresholds, scope)
    if (projectionFailure !== null) {
      return projectionFailure
    }
    throw error
  }

  if (
    scope === 'total'
    && hasTotalOverflowInvolvement(result, metadata)
  ) {
    return createNotComparable(
      'total-overflow',
      thresholds,
      scope,
      { reason: 'canonical total aggregation includes overflow' }
    )
  }

  return createComparableResult(
    scope,
    thresholds,
    compareProjectedDistributions(legacy, canonical)
  )
}

export function compareLegacyAndCanonicalDistributions(
  legacyDistribution,
  canonicalEnvelope,
  options
) {
  return compareNormalizedDistributions(
    legacyDistribution,
    canonicalEnvelope,
    normalizeComparisonOptions(options)
  )
}

export const compareLegacyCanonicalDistributions =
  compareLegacyAndCanonicalDistributions

export function compareLegacyAndCanonicalDamage(
  legacyDistribution,
  canonicalEnvelope,
  options = {}
) {
  const normalized = normalizeComparisonOptions(options)
  return compareNormalizedDistributions(
    legacyDistribution,
    canonicalEnvelope,
    { scope: 'damage', thresholds: normalized.thresholds }
  )
}

export function compareLegacyAndCanonicalTotalDamage(
  legacyDistribution,
  canonicalEnvelope,
  options = {}
) {
  const normalized = normalizeComparisonOptions(options)
  return compareNormalizedDistributions(
    legacyDistribution,
    canonicalEnvelope,
    { scope: 'total', thresholds: normalized.thresholds }
  )
}
