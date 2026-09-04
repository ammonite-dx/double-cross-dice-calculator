import {
  validateDistributionResult,
} from '../../calculation/DistributionResult'

export const CANONICAL_DISTRIBUTION_DISPLAY_VERSION = 1

// The production probability labels use a 0.1 percentage-point display step.
// A position-unknown probability bound at or below half that step keeps the
// projection error within the UI display precision.
export const DISPLAY_PROBABILITY_TOLERANCE = 5e-4

// These limits keep recursive JSON validation well below the JavaScript call
// stack and bound the amount of data copied into a display model.
export const DISTRIBUTION_PRESENTATION_MAX_JSON_DEPTH = 64
export const DISTRIBUTION_PRESENTATION_MAX_JSON_NODES = 10_000

export const DISTRIBUTION_PRESENTATION_ERROR_CODES = Object.freeze({
  INVALID_ENVELOPE: 'invalid-envelope',
  INVALID_OPTIONS: 'invalid-options',
  INVALID_DISPLAY_WINDOW: 'invalid-display-window',
  INVALID_SUMMARY: 'invalid-summary',
  INVALID_WARNING: 'invalid-warning',
  UNSAFE_JSON: 'unsafe-json',
})

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property)
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  let prototype
  try {
    prototype = Object.getPrototypeOf(value)
  } catch {
    return false
  }
  return prototype === Object.prototype || prototype === null
}

function freezeDetails(details) {
  return Object.freeze(isPlainRecord(details) ? { ...details } : {})
}

export class DistributionPresentationError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'DistributionPresentationError'
    this.code = code
    this.details = freezeDetails(details)
    this.distributionPresentation = true
  }
}

export class DistributionPresentationValidationError
  extends DistributionPresentationError {
  constructor(code, message, details = {}) {
    super(code, message, details)
    this.name = 'DistributionPresentationValidationError'
    this.validation = true
  }
}

export function isDistributionPresentationError(error) {
  return error?.distributionPresentation === true
    && typeof error.code === 'string'
}

export function isDistributionPresentationValidationError(error) {
  return isDistributionPresentationError(error) && error.validation === true
}

function fail(code, message, details = {}) {
  throw new DistributionPresentationValidationError(code, message, details)
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNullableFiniteNumber(value) {
  return value === null || isFiniteNumber(value)
}

function isCanonicalArrayIndex(property, length) {
  const index = Number(property)
  return Number.isSafeInteger(index)
    && index >= 0
    && index < length
    && String(index) === property
}

function getOwnPropertyNamesSafely(value, invalidCode, path) {
  try {
    return Object.getOwnPropertyNames(value)
  } catch {
    fail(
      invalidCode,
      `${path} properties could not be inspected safely`,
      { path }
    )
  }
}

function getOwnPropertySymbolsSafely(value, invalidCode, path) {
  try {
    return Object.getOwnPropertySymbols(value)
  } catch {
    fail(
      invalidCode,
      `${path} symbol properties could not be inspected safely`,
      { path }
    )
  }
}

function getPropertyDescriptorSafely(value, property, invalidCode, path) {
  try {
    return Object.getOwnPropertyDescriptor(value, property)
  } catch {
    fail(
      invalidCode,
      `${path}.${property} could not be inspected safely`,
      { path, property }
    )
  }
}

function requireOwnDataProperty(value, property, invalidCode, path) {
  const descriptor = getPropertyDescriptorSafely(
    value,
    property,
    invalidCode,
    path
  )
  if (!descriptor || !hasOwn(descriptor, 'value')) {
    fail(
      invalidCode,
      `${path}.${property} must be an own data property`,
      { path: `${path}.${property}`, property }
    )
  }
  return descriptor.value
}

function validatePlainRecordDataProperties(value, path, invalidCode) {
  if (!isPlainRecord(value)) {
    fail(
      invalidCode,
      `${path} must be a plain record`,
      { path }
    )
  }

  if (getOwnPropertySymbolsSafely(value, invalidCode, path).length > 0) {
    fail(
      invalidCode,
      `${path} must not contain symbol properties`,
      { path }
    )
  }

  for (const property of getOwnPropertyNamesSafely(value, invalidCode, path)) {
    const descriptor = getPropertyDescriptorSafely(
      value,
      property,
      invalidCode,
      path
    )
    if (!descriptor?.enumerable || !hasOwn(descriptor, 'value')) {
      fail(
        invalidCode,
        `${path}.${property} must be an enumerable data property`,
        { path, property }
      )
    }
  }
}

function createJsonCloneState() {
  return {
    ancestors: new WeakSet(),
    memo: new WeakMap(),
    nodes: 0,
  }
}

function countJsonNode(state, path) {
  state.nodes += 1
  if (state.nodes > DISTRIBUTION_PRESENTATION_MAX_JSON_NODES) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.UNSAFE_JSON,
      `${path} exceeds the JSON node limit`,
      {
        path,
        limit: DISTRIBUTION_PRESENTATION_MAX_JSON_NODES,
      }
    )
  }
}

function cloneJsonSafe(
  value,
  path,
  invalidCode,
  state = createJsonCloneState(),
  depth = 0
) {
  if (depth > DISTRIBUTION_PRESENTATION_MAX_JSON_DEPTH) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.UNSAFE_JSON,
      `${path} exceeds the JSON depth limit`,
      {
        path,
        limit: DISTRIBUTION_PRESENTATION_MAX_JSON_DEPTH,
      }
    )
  }

  if (value === null) {
    countJsonNode(state, path)
    return null
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    countJsonNode(state, path)
    return value
  }

  if (typeof value === 'number') {
    countJsonNode(state, path)
    if (!Number.isFinite(value)) {
      fail(
        invalidCode,
        `${path} must contain only finite numbers`,
        { path }
      )
    }
    return value
  }

  if (typeof value !== 'object') {
    countJsonNode(state, path)
    fail(
      invalidCode,
      `${path} must be JSON-safe`,
      { path }
    )
  }

  if (state.ancestors.has(value)) {
    fail(
      invalidCode,
      `${path} must not contain a circular reference`,
      { path }
    )
  }

  if (state.memo.has(value)) {
    return state.memo.get(value)
  }

  countJsonNode(state, path)

  if (Array.isArray(value)) {
    const ownSymbols = getOwnPropertySymbolsSafely(value, invalidCode, path)
    if (ownSymbols.length > 0) {
      fail(
        invalidCode,
        `${path} must not contain symbol properties`,
        { path }
      )
    }

    const lengthDescriptor = getPropertyDescriptorSafely(
      value,
      'length',
      invalidCode,
      path
    )
    const length = lengthDescriptor?.value
    if (!Number.isSafeInteger(length) || length < 0) {
      fail(
        invalidCode,
        `${path}.length must be a safe non-negative integer`,
        { path }
      )
    }
    if (length > DISTRIBUTION_PRESENTATION_MAX_JSON_NODES) {
      fail(
        DISTRIBUTION_PRESENTATION_ERROR_CODES.UNSAFE_JSON,
        `${path} exceeds the JSON node limit`,
        {
          path,
          limit: DISTRIBUTION_PRESENTATION_MAX_JSON_NODES,
        }
      )
    }

    const descriptors = new Map()
    for (const property of getOwnPropertyNamesSafely(
      value,
      invalidCode,
      path
    )) {
      if (property === 'length') {
        continue
      }
      if (!isCanonicalArrayIndex(property, length)) {
        fail(
          invalidCode,
          `${path} must be a JSON array without extra properties`,
          { path, property }
        )
      }
      const descriptor = getPropertyDescriptorSafely(
        value,
        property,
        invalidCode,
        path
      )
      if (!descriptor?.enumerable || !hasOwn(descriptor, 'value')) {
        fail(
          invalidCode,
          `${path}[${property}] must be an enumerable data property`,
          { path, property }
        )
      }
      descriptors.set(property, descriptor)
    }

    const copy = new Array(length)
    state.memo.set(value, copy)
    state.ancestors.add(value)
    try {
      for (let index = 0; index < length; index += 1) {
        const property = String(index)
        const descriptor = descriptors.get(property)
        if (!descriptor) {
          fail(
            invalidCode,
            `${path} must not contain sparse array entries`,
            { path, index }
          )
        }
        copy[index] = cloneJsonSafe(
          descriptor.value,
          `${path}[${index}]`,
          invalidCode,
          state,
          depth + 1
        )
      }
    } finally {
      state.ancestors.delete(value)
    }
    return copy
  }

  if (!isPlainRecord(value)) {
    fail(
      invalidCode,
      `${path} must contain only plain records and arrays`,
      { path }
    )
  }

  const ownSymbols = getOwnPropertySymbolsSafely(value, invalidCode, path)
  if (ownSymbols.length > 0) {
    fail(
      invalidCode,
      `${path} must not contain symbol properties`,
      { path }
    )
  }

  const descriptors = new Map()
  for (const property of getOwnPropertyNamesSafely(
    value,
    invalidCode,
    path
  )) {
    const descriptor = getPropertyDescriptorSafely(
      value,
      property,
      invalidCode,
      path
    )
    if (!descriptor?.enumerable || !hasOwn(descriptor, 'value')) {
      fail(
        invalidCode,
        `${path}.${property} must be an enumerable data property`,
        { path, property }
      )
    }
    descriptors.set(property, descriptor)
  }

  const copy = {}
  state.memo.set(value, copy)
  state.ancestors.add(value)
  try {
    for (const [property, descriptor] of descriptors) {
      Object.defineProperty(copy, property, {
        configurable: true,
        enumerable: true,
        value: cloneJsonSafe(
          descriptor.value,
          `${path}.${property}`,
          invalidCode,
          state,
          depth + 1
        ),
        writable: true,
      })
    }
  } finally {
    state.ancestors.delete(value)
  }
  return copy
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return value
  }
  seen.add(value)
  for (const child of Object.values(value)) {
    deepFreeze(child, seen)
  }
  return Object.freeze(value)
}

function validateCanonicalEnvelope(canonicalEnvelope) {
  if (!isPlainRecord(canonicalEnvelope)) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'canonical distribution presentation expects a modeled distribution envelope'
    )
  }

  validatePlainRecordDataProperties(
    canonicalEnvelope,
    'canonicalEnvelope',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE
  )

  const result = requireOwnDataProperty(
    canonicalEnvelope,
    'result',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
    'canonicalEnvelope'
  )
  const metadata = requireOwnDataProperty(
    canonicalEnvelope,
    'metadata',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
    'canonicalEnvelope'
  )

  if (!isPlainRecord(metadata)) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'canonicalEnvelope.metadata must be a plain record'
    )
  }
  validatePlainRecordDataProperties(
    metadata,
    'canonicalEnvelope.metadata',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE
  )
  if (
    requireOwnDataProperty(
      metadata,
      'modeledDistribution',
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'canonicalEnvelope.metadata'
    ) !== true
  ) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'canonicalEnvelope.metadata.modeledDistribution must be true'
    )
  }

  if (!isPlainRecord(result)) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'canonicalEnvelope.result must be a plain record'
    )
  }
  validatePlainRecordDataProperties(
    result,
    'canonicalEnvelope.result',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE
  )

  requireOwnDataProperty(
    result,
    'version',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
    'canonicalEnvelope.result'
  )
  const values = requireOwnDataProperty(
    result,
    'values',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
    'canonicalEnvelope.result'
  )
  const offset = requireOwnDataProperty(
    result,
    'offset',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
    'canonicalEnvelope.result'
  )
  const support = requireOwnDataProperty(
    result,
    'support',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
    'canonicalEnvelope.result'
  )
  const overflow = requireOwnDataProperty(
    result,
    'overflow',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
    'canonicalEnvelope.result'
  )

  if (!isPlainRecord(support)) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'canonicalEnvelope.result.support must be a plain record'
    )
  }
  validatePlainRecordDataProperties(
    support,
    'canonicalEnvelope.result.support',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE
  )
  const supportKind = requireOwnDataProperty(
    support,
    'kind',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
    'canonicalEnvelope.result.support'
  )
  if (supportKind === 'finite') {
    requireOwnDataProperty(
      support,
      'max',
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'canonicalEnvelope.result.support'
    )
  }

  if (overflow !== null) {
    if (!isPlainRecord(overflow)) {
      fail(
        DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
        'canonicalEnvelope.result.overflow must be null or a plain record'
      )
    }
    validatePlainRecordDataProperties(
      overflow,
      'canonicalEnvelope.result.overflow',
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE
    )
    const overflowKind = requireOwnDataProperty(
      overflow,
      'kind',
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'canonicalEnvelope.result.overflow'
    )
    requireOwnDataProperty(
      overflow,
      'lowerBound',
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'canonicalEnvelope.result.overflow'
    )
    requireOwnDataProperty(
      overflow,
      'errorBound',
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'canonicalEnvelope.result.overflow'
    )
    if (overflowKind === 'exact') {
      requireOwnDataProperty(
        overflow,
        'probability',
        DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
        'canonicalEnvelope.result.overflow'
      )
    } else if (overflowKind === 'upper-bound') {
      requireOwnDataProperty(
        overflow,
        'probabilityUpperBound',
        DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
        'canonicalEnvelope.result.overflow'
      )
    }
  }

  try {
    validateDistributionResult(result)
  } catch (error) {
    const details = typeof error?.code === 'string'
      ? { causeCode: error.code }
      : {}
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'canonical distribution envelope contains an invalid distribution result',
      details
    )
  }

  if (offset < 0) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'canonical distribution display does not support negative explicit offsets',
      { offset }
    )
  }

  return {
    values,
    offset,
    support,
    overflow,
    projectionUncertainty: copyProjectionUncertainty(metadata),
  }
}

const MASS_NUMBER_FIELDS = [
  'explicitMass',
  'overflowMassUpperBound',
  'totalMassUpperBound',
  'unrepresentedMassUpperBound',
  'errorBound',
]

const MASS_NULLABLE_NUMBER_FIELDS = [
  'overflowMass',
  'totalMass',
  'unrepresentedMass',
]

function validateMassSummary(mass) {
  if (!isPlainRecord(mass)) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
      'summary.mass must be a plain record'
    )
  }

  for (const field of [
    ...MASS_NUMBER_FIELDS,
    ...MASS_NULLABLE_NUMBER_FIELDS,
    'isExact',
  ]) {
    requireOwnDataProperty(
      mass,
      field,
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
      'summary.mass'
    )
  }

  for (const field of MASS_NUMBER_FIELDS) {
    const value = requireOwnDataProperty(
      mass,
      field,
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
      'summary.mass'
    )
    if (!isFiniteNumber(value)) {
      fail(
        DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
        `summary.mass.${field} must be finite`,
        { field }
      )
    }
  }

  for (const field of MASS_NULLABLE_NUMBER_FIELDS) {
    const value = requireOwnDataProperty(
      mass,
      field,
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
      'summary.mass'
    )
    if (!isNullableFiniteNumber(value)) {
      fail(
        DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
        `summary.mass.${field} must be finite or null`,
        { field }
      )
    }
  }

  if (typeof requireOwnDataProperty(
    mass,
    'isExact',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
    'summary.mass'
  ) !== 'boolean') {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
      'summary.mass.isExact must be boolean'
    )
  }
}

function validateExpectedValueSummary(expectedValue) {
  if (!isPlainRecord(expectedValue)) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
      'summary.expectedValue must be an expected-value union'
    )
  }

  const kind = requireOwnDataProperty(
    expectedValue,
    'kind',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
    'summary.expectedValue'
  )
  if (typeof kind !== 'string') {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
      'summary.expectedValue.kind must be a string'
    )
  }

  if (kind === 'exact') {
    const value = requireOwnDataProperty(
      expectedValue,
      'value',
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
      'summary.expectedValue'
    )
    if (!isFiniteNumber(value)) {
      fail(
        DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
        'summary.expectedValue.value must be finite'
      )
    }
    return
  }

  if (kind === 'bounded') {
    const lowerBound = requireOwnDataProperty(
      expectedValue,
      'lowerBound',
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
      'summary.expectedValue'
    )
    const upperBound = requireOwnDataProperty(
      expectedValue,
      'upperBound',
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
      'summary.expectedValue'
    )
    if (
      !isFiniteNumber(lowerBound)
      || !isFiniteNumber(upperBound)
      || lowerBound > upperBound
    ) {
      fail(
        DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
        'bounded expectedValue must contain an ordered finite interval'
      )
    }
    return
  }

  if (kind === 'lower-bound') {
    const lowerBound = requireOwnDataProperty(
      expectedValue,
      'lowerBound',
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
      'summary.expectedValue'
    )
    if (!isFiniteNumber(lowerBound)) {
      fail(
        DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
        'lower-bound expectedValue.lowerBound must be finite'
      )
    }
    return
  }

  fail(
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
    'summary.expectedValue.kind is invalid',
    { kind }
  )
}

function copySummary(summary, state) {
  if (!isPlainRecord(summary)) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
      'summary must be a plain record'
    )
  }

  // Inspect every top-level descriptor before reading either required field.
  // This makes accessor-backed summaries a typed validation failure even when
  // the accessor itself would throw a native error.
  validatePlainRecordDataProperties(
    summary,
    'summary',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY
  )

  const mass = cloneJsonSafe(
    requireOwnDataProperty(
      summary,
      'mass',
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
      'summary'
    ),
    'summary.mass',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
    state,
    1
  )
  const expectedValue = cloneJsonSafe(
    requireOwnDataProperty(
      summary,
      'expectedValue',
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
      'summary'
    ),
    'summary.expectedValue',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
    state,
    1
  )
  validateMassSummary(mass)
  validateExpectedValueSummary(expectedValue)
  return { mass, expectedValue }
}

function copyWarnings(warnings, state) {
  const copiedWarnings = cloneJsonSafe(
    warnings,
    'warnings',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_WARNING,
    state
  )
  if (!Array.isArray(copiedWarnings)) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_WARNING,
      'warnings must be an array'
    )
  }

  for (let index = 0; index < copiedWarnings.length; index += 1) {
    const warning = copiedWarnings[index]
    if (!isPlainRecord(warning)) {
      fail(
        DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_WARNING,
        `warnings[${index}] must be a plain record`,
        { index }
      )
    }
    const code = requireOwnDataProperty(
      warning,
      'code',
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_WARNING,
      `warnings[${index}]`
    )
    if (typeof code !== 'string') {
      fail(
        DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_WARNING,
        `warnings[${index}].code must be a string`,
        { index }
      )
    }
    const severity = requireOwnDataProperty(
      warning,
      'severity',
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_WARNING,
      `warnings[${index}]`
    )
    if (!['info', 'warning', 'error', 'reject'].includes(severity)) {
      fail(
        DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_WARNING,
        `warnings[${index}].severity must be info, warning, error, or reject`,
        { index }
      )
    }
  }

  return copiedWarnings
}

function copySupport(support) {
  const kind = requireOwnDataProperty(
    support,
    'kind',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
    'canonicalEnvelope.result.support'
  )
  if (kind === 'finite') {
    return {
      kind: 'finite',
      max: requireOwnDataProperty(
        support,
        'max',
        DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
        'canonicalEnvelope.result.support'
      ),
    }
  }
  return { kind: 'infinite' }
}

function copyOverflow(overflow) {
  if (overflow === null) {
    return null
  }
  const kind = requireOwnDataProperty(
    overflow,
    'kind',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
    'canonicalEnvelope.result.overflow'
  )
  if (kind === 'exact') {
    return {
      kind: 'exact',
      lowerBound: requireOwnDataProperty(
        overflow,
        'lowerBound',
        DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
        'canonicalEnvelope.result.overflow'
      ),
      probability: requireOwnDataProperty(
        overflow,
        'probability',
        DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
        'canonicalEnvelope.result.overflow'
      ),
      errorBound: requireOwnDataProperty(
        overflow,
        'errorBound',
        DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
        'canonicalEnvelope.result.overflow'
      ),
    }
  }
  return {
    kind: 'upper-bound',
    lowerBound: requireOwnDataProperty(
      overflow,
      'lowerBound',
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'canonicalEnvelope.result.overflow'
    ),
    probabilityUpperBound: requireOwnDataProperty(
      overflow,
      'probabilityUpperBound',
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'canonicalEnvelope.result.overflow'
    ),
    errorBound: requireOwnDataProperty(
      overflow,
      'errorBound',
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'canonicalEnvelope.result.overflow'
    ),
  }
}

function copyProjectionUncertainty(metadata) {
  if (!hasOwn(metadata, 'projectionUncertainty')) {
    return null
  }

  const value = requireOwnDataProperty(
    metadata,
    'projectionUncertainty',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
    'canonicalEnvelope.metadata'
  )
  if (!isPlainRecord(value)) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'canonicalEnvelope.metadata.projectionUncertainty must be a plain record'
    )
  }
  validatePlainRecordDataProperties(
    value,
    'canonicalEnvelope.metadata.projectionUncertainty',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE
  )

  const positionUnknownProbabilityUpperBound = requireOwnDataProperty(
    value,
    'positionUnknownProbabilityUpperBound',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
    'canonicalEnvelope.metadata.projectionUncertainty'
  )
  if (
    !isFiniteNumber(positionUnknownProbabilityUpperBound)
    || positionUnknownProbabilityUpperBound < 0
    || positionUnknownProbabilityUpperBound > 1
  ) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'canonicalEnvelope.metadata.projectionUncertainty.positionUnknownProbabilityUpperBound must be between 0 and 1',
      { positionUnknownProbabilityUpperBound }
    )
  }

  const copied = { positionUnknownProbabilityUpperBound }
  if (hasOwn(value, 'outputOverflowLowerBound')) {
    const outputOverflowLowerBound = requireOwnDataProperty(
      value,
      'outputOverflowLowerBound',
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'canonicalEnvelope.metadata.projectionUncertainty'
    )
    if (
      outputOverflowLowerBound !== null
      && (!Number.isSafeInteger(outputOverflowLowerBound)
        || outputOverflowLowerBound < 0)
    ) {
      fail(
        DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
        'canonicalEnvelope.metadata.projectionUncertainty.outputOverflowLowerBound must be null or a non-negative safe integer',
        { outputOverflowLowerBound }
      )
    }
    copied.outputOverflowLowerBound = outputOverflowLowerBound
  }
  return copied
}

function copyDisplayWindow(options) {
  const descriptor = getPropertyDescriptorSafely(
    options,
    'displayWindow',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_OPTIONS,
    'options'
  )
  if (!descriptor) {
    return null
  }

  const displayWindow = requireOwnDataProperty(
    options,
    'displayWindow',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_OPTIONS,
    'options'
  )
  if (!isPlainRecord(displayWindow)) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_WINDOW,
      'options.displayWindow must be a plain record'
    )
  }
  validatePlainRecordDataProperties(
    displayWindow,
    'options.displayWindow',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_WINDOW
  )

  const min = requireOwnDataProperty(
    displayWindow,
    'min',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_WINDOW,
    'options.displayWindow'
  )
  const max = requireOwnDataProperty(
    displayWindow,
    'max',
    DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_WINDOW,
    'options.displayWindow'
  )
  if (!Number.isSafeInteger(min) || min < 0) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_WINDOW,
      'options.displayWindow.min must be a non-negative safe integer',
      { min }
    )
  }
  if (!Number.isSafeInteger(max) || max < 0) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_WINDOW,
      'options.displayWindow.max must be a non-negative safe integer',
      { max }
    )
  }
  if (min > max) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_WINDOW,
      'options.displayWindow.min must not exceed max',
      { min, max }
    )
  }

  // This is a request boundary only. The presenter deliberately keeps the
  // complete canonical explicit coverage; Phase 3 owns projection,
  // recalculation, and resource-budget decisions.
  return { min, max }
}

/**
 * Convert a modeled canonical distribution into a UI-independent display
 * model. Summary values are supplied by the caller and are never recomputed.
 * An optional displayWindow is retained as a request boundary and never
 * truncates the canonical explicit coverage.
 */
export function presentCanonicalDistribution(
  canonicalEnvelope,
  options = {}
) {
  try {
    if (!isPlainRecord(options)) {
      fail(
        DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_OPTIONS,
        'presentCanonicalDistribution options must be a plain record'
      )
    }
    validatePlainRecordDataProperties(
      options,
      'options',
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_OPTIONS
    )

    const summary = requireOwnDataProperty(
      options,
      'summary',
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_OPTIONS,
      'options'
    )
    const warningsDescriptor = getPropertyDescriptorSafely(
      options,
      'warnings',
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_OPTIONS,
      'options'
    )
    const warnings = warningsDescriptor
      ? requireOwnDataProperty(
          options,
          'warnings',
          DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_OPTIONS,
          'options'
        )
      : []
    const displayWindow = copyDisplayWindow(options)

    const validated = validateCanonicalEnvelope(canonicalEnvelope)
    const cloneState = createJsonCloneState()
    const copiedSummary = copySummary(summary, cloneState)
    const copiedWarnings = copyWarnings(
      warnings === undefined ? [] : warnings,
      cloneState
    )
    const probabilities = Array.from(validated.values)

    const display = {
      version: CANONICAL_DISTRIBUTION_DISPLAY_VERSION,
      kind: 'canonical-distribution-display',
      explicit: {
        offset: validated.offset,
        probabilities,
      },
      explicitMax: probabilities.length === 0
        ? null
        : validated.offset + probabilities.length - 1,
      support: copySupport(validated.support),
      overflow: copyOverflow(validated.overflow),
      mass: copiedSummary.mass,
      expectedValue: copiedSummary.expectedValue,
      warnings: copiedWarnings,
      ...(validated.projectionUncertainty === null
        ? {}
        : {
            projectionUncertainty: {
              ...validated.projectionUncertainty,
            },
          }),
    }
    if (displayWindow !== null) {
      display.displayWindow = displayWindow
    }
    return deepFreeze(display)
  } catch (error) {
    if (isDistributionPresentationError(error)) {
      throw error
    }
    throw new DistributionPresentationValidationError(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.UNSAFE_JSON,
      'canonical distribution presentation rejected unsafe input'
    )
  }
}
