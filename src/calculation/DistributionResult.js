const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER
const FLOAT64_BYTES = Float64Array.BYTES_PER_ELEMENT

export const DISTRIBUTION_RESULT_VERSION = 1

// Keep the canonical result's mass checks in one place. This matches the
// existing runtime calculation total tolerance without changing those paths.
export const DISTRIBUTION_RESULT_TOLERANCE = 1e-8
export const PROBABILITY_TOLERANCE = DISTRIBUTION_RESULT_TOLERANCE

export const LEGACY_PUBLISHED_BUCKET_LENGTH = 1024
export const LEGACY_PUBLISHED_OVERFLOW_INDEX = 1023

export const DISTRIBUTION_RESULT_ERROR_CODES = Object.freeze({
  INVALID_INPUT: 'invalid-input',
  INVALID_SCHEMA: 'invalid-schema',
  INVALID_VERSION: 'invalid-version',
  INVALID_VALUES: 'invalid-values',
  NON_FINITE_PROBABILITY: 'non-finite-probability',
  NEGATIVE_PROBABILITY: 'negative-probability',
  PROBABILITY_ABOVE_ONE: 'probability-above-one',
  INVALID_OFFSET: 'invalid-offset',
  INDEX_OVERFLOW: 'index-overflow',
  INVALID_SUPPORT: 'invalid-support',
  SUPPORT_BELOW_EXPLICIT: 'support-below-explicit',
  SUPPORT_BELOW_OVERFLOW: 'support-below-overflow',
  INVALID_OVERFLOW: 'invalid-overflow',
  INVALID_LOWER_BOUND: 'invalid-lower-bound',
  INVALID_ERROR_BOUND: 'invalid-error-bound',
  MASS_NOT_NORMALIZED: 'mass-not-normalized',
  EXPLICIT_MASS_ABOVE_ONE: 'explicit-mass-above-one',
  UPPER_BOUND_TOO_SMALL: 'upper-bound-too-small',
  LEGACY_INPUT: 'legacy-input',
  LEGACY_LENGTH: 'legacy-length',
  LEGACY_SUPPORT_REQUIRED: 'legacy-support-required',
  LEGACY_LENGTH_OPTION: 'legacy-length-option',
  UPPER_BOUND_PROJECTION: 'upper-bound-projection',
  UNSAFE_PROJECTION: 'unsafe-projection',
})

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isValueSource(value) {
  return value !== null
    && typeof value === 'object'
    && Number.isSafeInteger(value.length)
    && value.length >= 0
}

function isLegacyValueSource(value) {
  return Array.isArray(value) || value instanceof Float64Array
}

function freezeDetails(details) {
  return Object.freeze({ ...(isRecord(details) ? details : {}) })
}

export class DistributionResultError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'DistributionResultError'
    this.code = code
    this.details = freezeDetails(details)
    this.distributionResultError = true
  }
}

export class DistributionResultValidationError extends DistributionResultError {
  constructor(code, message, details = {}) {
    super(code, message, details)
    this.name = 'DistributionResultValidationError'
    this.validation = true
  }
}

export class DistributionResultAdapterError extends DistributionResultError {
  constructor(code, message, details = {}) {
    super(code, message, details)
    this.name = 'DistributionResultAdapterError'
    this.adapter = true
  }
}

export function isDistributionResultError(error) {
  return error?.distributionResultError === true
    && typeof error.code === 'string'
}

export function isDistributionResultValidationError(error) {
  return isDistributionResultError(error) && error.validation === true
}

export function isDistributionResultAdapterError(error) {
  return isDistributionResultError(error) && error.adapter === true
}

function failValidation(code, message, details = {}) {
  throw new DistributionResultValidationError(code, message, details)
}

function failAdapter(code, message, details = {}) {
  throw new DistributionResultAdapterError(code, message, details)
}

function validateProbability(value, field, index) {
  if (!Number.isFinite(value)) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.NON_FINITE_PROBABILITY,
      `${field} must be a finite probability`,
      { field, index, value }
    )
  }
  if (value < 0) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.NEGATIVE_PROBABILITY,
      `${field} must be non-negative`,
      { field, index, value }
    )
  }
  if (value > 1) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.PROBABILITY_ABOVE_ONE,
      `${field} must not exceed one`,
      { field, index, value }
    )
  }
}

function copyValues(values) {
  if (!isValueSource(values)) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_VALUES,
      'values must be an ArrayLike object'
    )
  }

  if (values.length > Math.floor(MAX_SAFE_INTEGER / FLOAT64_BYTES)) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INDEX_OVERFLOW,
      'values byte length must be a safe integer',
      { valuesLength: values.length }
    )
  }

  const copied = new Float64Array(values.length)
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    validateProbability(value, 'values', index)
    copied[index] = value
  }
  return copied
}

function validateResultValues(values) {
  if (!(values instanceof Float64Array)) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_VALUES,
      'values must be a Float64Array'
    )
  }

  for (let index = 0; index < values.length; index += 1) {
    validateProbability(values[index], 'values', index)
  }
}

function validateOffset(offset, valuesLength) {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_OFFSET,
      'offset must be a non-negative safe integer',
      { offset }
    )
  }
  if (valuesLength > MAX_SAFE_INTEGER - offset) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INDEX_OVERFLOW,
      'offset plus values.length must be a safe integer',
      { offset, valuesLength }
    )
  }
}

function getExplicitMaxFromParts(offset, valuesLength) {
  return valuesLength === 0 ? null : offset + valuesLength - 1
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

function validateSupport(support, explicitMax, overflow) {
  if (!isRecord(support) || typeof support.kind !== 'string') {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SUPPORT,
      'support must be a finite or infinite discriminated union'
    )
  }

  if (support.kind === 'infinite') {
    if (hasOwn(support, 'max')) {
      failValidation(
        DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SUPPORT,
        'infinite support must not contain max'
      )
    }
    return
  }

  if (support.kind !== 'finite') {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SUPPORT,
      'support.kind must be finite or infinite',
      { kind: support.kind }
    )
  }
  if (!Number.isSafeInteger(support.max) || support.max < 0) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SUPPORT,
      'finite support.max must be a non-negative safe integer',
      { max: support.max }
    )
  }
  if (explicitMax !== null && support.max < explicitMax) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.SUPPORT_BELOW_EXPLICIT,
      'finite support.max must be at least explicitMax',
      { explicitMax, supportMax: support.max }
    )
  }
  if (
    hasPotentialOverflowMass(overflow)
    && support.max < overflow.lowerBound
  ) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.SUPPORT_BELOW_OVERFLOW,
      'finite support.max must contain the overflow lowerBound',
      { lowerBound: overflow.lowerBound, supportMax: support.max }
    )
  }
}

function validateOverflow(overflow) {
  if (overflow === null) {
    return null
  }
  if (!isRecord(overflow) || typeof overflow.kind !== 'string') {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_OVERFLOW,
      'overflow must be null or a discriminated union'
    )
  }
  if (!Number.isSafeInteger(overflow.lowerBound) || overflow.lowerBound < 0) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_LOWER_BOUND,
      'overflow.lowerBound must be a non-negative safe integer',
      { lowerBound: overflow.lowerBound }
    )
  }
  if (!Number.isFinite(overflow.errorBound) || overflow.errorBound < 0) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_ERROR_BOUND,
      'overflow.errorBound must be a finite non-negative number',
      { errorBound: overflow.errorBound }
    )
  }

  if (overflow.kind === 'exact') {
    validateProbability(overflow.probability, 'overflow.probability')
    return overflow
  }
  if (overflow.kind === 'upper-bound') {
    validateProbability(
      overflow.probabilityUpperBound,
      'overflow.probabilityUpperBound'
    )
    return overflow
  }

  failValidation(
    DISTRIBUTION_RESULT_ERROR_CODES.INVALID_OVERFLOW,
    'overflow.kind must be exact or upper-bound',
    { kind: overflow.kind }
  )
}

function sumValues(values) {
  let total = 0
  for (const value of values) {
    total += value
  }
  return total
}

function inspectDistributionResult(result) {
  if (!isRecord(result)) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SCHEMA,
      'distribution result must be an object'
    )
  }
  if (hasOwn(result, 'explicitMax')) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SCHEMA,
      'distribution result must derive explicitMax instead of storing it'
    )
  }
  if (result.version !== DISTRIBUTION_RESULT_VERSION) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_VERSION,
      `distribution result version must be ${DISTRIBUTION_RESULT_VERSION}`,
      { version: result.version }
    )
  }

  const values = result.values
  validateResultValues(values)
  validateOffset(result.offset, values.length)
  const explicitMax = getExplicitMaxFromParts(result.offset, values.length)

  if (!hasOwn(result, 'support')) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SCHEMA,
      'distribution result support is required'
    )
  }
  if (!hasOwn(result, 'overflow')) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SCHEMA,
      'distribution result overflow is required'
    )
  }

  const overflow = validateOverflow(result.overflow)
  validateSupport(
    result.support,
    explicitMax,
    overflow
  )

  const explicitMass = sumValues(values)
  if (!Number.isFinite(explicitMass)) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.EXPLICIT_MASS_ABOVE_ONE,
      'explicit probability mass must be finite',
      { explicitMass }
    )
  }

  if (overflow === null) {
    if (Math.abs(explicitMass - 1) > DISTRIBUTION_RESULT_TOLERANCE) {
      failValidation(
        DISTRIBUTION_RESULT_ERROR_CODES.MASS_NOT_NORMALIZED,
        'explicit probability mass must be approximately one when overflow is null',
        { explicitMass, tolerance: DISTRIBUTION_RESULT_TOLERANCE }
      )
    }
  } else if (overflow.kind === 'exact') {
    const totalMass = explicitMass + overflow.probability
    if (
      !Number.isFinite(totalMass)
      || Math.abs(totalMass - 1) > DISTRIBUTION_RESULT_TOLERANCE
    ) {
      failValidation(
        DISTRIBUTION_RESULT_ERROR_CODES.MASS_NOT_NORMALIZED,
        'explicit mass plus exact overflow probability must be approximately one',
        {
          explicitMass,
          overflowProbability: overflow.probability,
          totalMass,
          tolerance: DISTRIBUTION_RESULT_TOLERANCE,
        }
      )
    }
  } else {
    if (explicitMass > 1 + DISTRIBUTION_RESULT_TOLERANCE) {
      failValidation(
        DISTRIBUTION_RESULT_ERROR_CODES.EXPLICIT_MASS_ABOVE_ONE,
        'explicit probability mass must not exceed one beyond tolerance',
        { explicitMass, tolerance: DISTRIBUTION_RESULT_TOLERANCE }
      )
    }
    const unrepresentedMass = Math.max(0, 1 - explicitMass)
    if (
      unrepresentedMass
      > overflow.probabilityUpperBound + DISTRIBUTION_RESULT_TOLERANCE
    ) {
      failValidation(
        DISTRIBUTION_RESULT_ERROR_CODES.UPPER_BOUND_TOO_SMALL,
        'upper-bound overflow must cover the unrepresented probability mass',
        {
          unrepresentedMass,
          probabilityUpperBound: overflow.probabilityUpperBound,
          tolerance: DISTRIBUTION_RESULT_TOLERANCE,
        }
      )
    }
  }

  return {
    result,
    values,
    offset: result.offset,
    explicitMax,
    explicitMass,
    support: result.support,
    overflow,
  }
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

function createImmutableResult(values, offset, support, overflow) {
  const result = {
    version: DISTRIBUTION_RESULT_VERSION,
    values,
    offset,
    support: copySupport(support),
    overflow: copyOverflow(overflow),
  }

  return Object.freeze(result)
}

function createValidatedResult(values, offset, support, overflow) {
  const candidate = {
    version: DISTRIBUTION_RESULT_VERSION,
    values,
    offset,
    support,
    overflow,
  }
  inspectDistributionResult(candidate)
  return createImmutableResult(values, offset, support, overflow)
}

function normalizeFactoryInput(input, options) {
  if (options === undefined && isRecord(input) && hasOwn(input, 'values')) {
    return input
  }
  if (options !== undefined && isValueSource(input) && isRecord(options)) {
    return { ...options, values: input }
  }
  failValidation(
    DISTRIBUTION_RESULT_ERROR_CODES.INVALID_INPUT,
    'createDistributionResult expects a result object or values plus options'
  )
}

/**
 * Create a canonical result with one defensive values copy.
 *
 * The returned result owns the copied Float64Array and exposes it directly.
 * Callers must treat `values` as read-only; use copyDistributionValues when a
 * writable copy is needed. Input values may be any object with a safe integer
 * length and numeric indexed elements.
 */
export function createDistributionResult(input, options) {
  const source = normalizeFactoryInput(input, options)
  const values = copyValues(source.values)
  const offset = source.offset === undefined ? 0 : source.offset
  const support = source.support
  const overflow = source.overflow === undefined ? null : source.overflow
  const version = source.version === undefined
    ? DISTRIBUTION_RESULT_VERSION
    : source.version
  const candidate = {
    version,
    values,
    offset,
    support,
    overflow,
  }

  inspectDistributionResult(candidate)
  return createImmutableResult(values, offset, support, overflow)
}

export const createCanonicalDistributionResult = createDistributionResult

/** Validate a canonical result. Returns true and throws a typed error on failure. */
export function validateDistributionResult(result) {
  inspectDistributionResult(result)
  return true
}

export function getExplicitMax(result) {
  return inspectDistributionResult(result).explicitMax
}

export function getValuesCopy(result) {
  return copyDistributionValues(result)
}

export function copyDistributionValues(result) {
  const { values } = inspectDistributionResult(result)
  return new Float64Array(values)
}

/**
 * Summarize explicit and overflow mass without conflating exact and upper-bound
 * overflow. `totalMass` is null for an upper-bound result because no exact
 * unrepresented mass is available.
 */
export function getProbabilityMassSummary(result) {
  const inspected = inspectDistributionResult(result)
  const { explicitMass, overflow } = inspected
  const exactOverflowMass = overflow?.kind === 'exact'
    ? overflow.probability
    : null
  const overflowMassUpperBound = overflow === null
    ? 0
    : overflow.kind === 'exact'
      ? overflow.probability
      : overflow.probabilityUpperBound
  const totalMass = overflow === null || overflow.kind === 'exact'
    ? explicitMass + (exactOverflowMass ?? 0)
    : null

  return Object.freeze({
    explicitMass,
    overflowMass: exactOverflowMass,
    overflowMassUpperBound,
    totalMass,
    totalMassUpperBound: totalMass ?? explicitMass + overflowMassUpperBound,
    unrepresentedMass: overflow === null ? 0 : exactOverflowMass,
    unrepresentedMassUpperBound: overflowMassUpperBound,
    errorBound: overflow?.errorBound ?? 0,
    isExact: overflow?.kind !== 'upper-bound',
  })
}

export const summarizeProbabilityMass = getProbabilityMassSummary

function sumExplicitFirstMoment(values, offset) {
  let firstMoment = 0
  for (let index = 0; index < values.length; index += 1) {
    firstMoment += (offset + index) * values[index]
  }
  return firstMoment
}

function createExactExpectedValue(value) {
  return Object.freeze({ kind: 'exact', value })
}

function createBoundedExpectedValue(lowerBound, upperBound) {
  return Object.freeze({ kind: 'bounded', lowerBound, upperBound })
}

function createLowerBoundExpectedValue(lowerBound) {
  return Object.freeze({ kind: 'lower-bound', lowerBound })
}

/**
 * Summarize the expected value without assigning a point value to overflow.
 *
 * The explicit values contribute their first moment directly. Exact overflow
 * contributes a point value only when its support is known exactly; otherwise
 * the result retains the strongest safe interval or lower bound available.
 * Upper-bound overflow is never treated as actual probability mass.
 */
export function getExpectedValueSummary(result) {
  const inspected = inspectDistributionResult(result)
  const { values, offset, support, overflow } = inspected
  const explicitFirstMoment = sumExplicitFirstMoment(values, offset)

  if (overflow === null) {
    return createExactExpectedValue(explicitFirstMoment)
  }

  if (overflow.kind === 'exact') {
    const lowerExpectedValue = explicitFirstMoment
      + overflow.probability * overflow.lowerBound

    if (support.kind === 'finite') {
      const upperExpectedValue = explicitFirstMoment
        + overflow.probability * support.max
      if (overflow.probability === 0 || overflow.lowerBound === support.max) {
        return createExactExpectedValue(lowerExpectedValue)
      }
      return createBoundedExpectedValue(
        lowerExpectedValue,
        upperExpectedValue
      )
    }

    if (overflow.probability === 0) {
      return createExactExpectedValue(explicitFirstMoment)
    }
    return createLowerBoundExpectedValue(lowerExpectedValue)
  }

  if (overflow.probabilityUpperBound === 0) {
    return createExactExpectedValue(explicitFirstMoment)
  }
  if (support.kind === 'finite') {
    return createBoundedExpectedValue(
      explicitFirstMoment,
      explicitFirstMoment + overflow.probabilityUpperBound * support.max
    )
  }
  return createLowerBoundExpectedValue(explicitFirstMoment)
}

function validateCanonicalTotalDamageEnvelope(canonicalTotalDamage) {
  if (
    !isRecord(canonicalTotalDamage)
    || !hasOwn(canonicalTotalDamage, 'result')
    || !isRecord(canonicalTotalDamage.metadata)
    || canonicalTotalDamage.metadata.modeledDistribution !== true
  ) {
    failAdapter(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SCHEMA,
      'canonical total damage summary expects a modeled result envelope'
    )
  }

  const inspected = inspectDistributionResult(canonicalTotalDamage.result)
  const overflow = inspected.overflow
  if (overflow?.kind === 'upper-bound') {
    const lowerBound = canonicalTotalDamage.metadata
      .overflowProbabilityLowerBound
    if (!Number.isFinite(lowerBound) || lowerBound < 0 || lowerBound > 1) {
      failAdapter(
        DISTRIBUTION_RESULT_ERROR_CODES.INVALID_LOWER_BOUND,
        'canonical total damage metadata.overflowProbabilityLowerBound must be a probability',
        { overflowProbabilityLowerBound: lowerBound }
      )
    }
    if (
      lowerBound
      > overflow.probabilityUpperBound + DISTRIBUTION_RESULT_TOLERANCE
    ) {
      failAdapter(
        DISTRIBUTION_RESULT_ERROR_CODES.UPPER_BOUND_TOO_SMALL,
        'canonical total damage overflow probability lower bound exceeds its upper bound',
        {
          overflowProbabilityLowerBound: lowerBound,
          probabilityUpperBound: overflow.probabilityUpperBound,
        }
      )
    }
  }
  return inspected
}

/**
 * Summarize an aggregated canonical damage envelope. Upper-bound aggregates
 * retain the proven overflow probability lower bound from aggregation when
 * deriving their expected-value lower bound; numerical drift and error bounds
 * remain diagnostics and never widen the returned interval.
 */
export function getCanonicalTotalDamageSummary(canonicalTotalDamage) {
  const inspected = validateCanonicalTotalDamageEnvelope(canonicalTotalDamage)
  const { result, metadata } = canonicalTotalDamage

  if (inspected.overflow?.kind !== 'upper-bound') {
    return Object.freeze({
      expectedValue: getExpectedValueSummary(result),
      mass: getProbabilityMassSummary(result),
    })
  }

  const explicitFirstMoment = sumExplicitFirstMoment(
    inspected.values,
    inspected.offset
  )
  // Validation admits a tolerance-sized numerical disagreement between the
  // published lower and upper probabilities. Clamp that disagreement before
  // constructing the expectation interval so its bounds cannot be inverted.
  const overflowProbabilityLowerBound = Math.min(
    metadata.overflowProbabilityLowerBound,
    inspected.overflow.probabilityUpperBound
  )
  const lowerExpectedValue = explicitFirstMoment
    + overflowProbabilityLowerBound * inspected.overflow.lowerBound

  if (!Number.isFinite(lowerExpectedValue)) {
    failAdapter(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SCHEMA,
      'canonical total damage expected-value lower bound is not finite',
      { lowerExpectedValue }
    )
  }

  let expectedValue
  if (inspected.overflow.probabilityUpperBound === 0) {
    expectedValue = createExactExpectedValue(explicitFirstMoment)
  } else if (inspected.support.kind === 'finite') {
    const upperExpectedValue = explicitFirstMoment
      + inspected.overflow.probabilityUpperBound * inspected.support.max
    if (!Number.isFinite(upperExpectedValue)) {
      failAdapter(
        DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SCHEMA,
        'canonical total damage expected-value upper bound is not finite',
        { upperExpectedValue }
      )
    }
    expectedValue = createBoundedExpectedValue(
      lowerExpectedValue,
      upperExpectedValue
    )
  } else {
    expectedValue = createLowerBoundExpectedValue(lowerExpectedValue)
  }

  return Object.freeze({
    expectedValue,
    mass: getProbabilityMassSummary(result),
  })
}

function validateLegacyInputValues(distribution) {
  if (!isLegacyValueSource(distribution)) {
    failAdapter(
      DISTRIBUTION_RESULT_ERROR_CODES.LEGACY_INPUT,
      'legacy published distribution must be an Array or Float64Array'
    )
  }
  if (distribution.length !== LEGACY_PUBLISHED_BUCKET_LENGTH) {
    failAdapter(
      DISTRIBUTION_RESULT_ERROR_CODES.LEGACY_LENGTH,
      `legacy published distribution must have ${LEGACY_PUBLISHED_BUCKET_LENGTH} entries`,
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

/**
 * Convert the current 1024 published buckets to the canonical result.
 * `options.support` is intentionally required; the legacy array cannot prove
 * finite versus infinite support by itself.
 */
export function fromPublishedBucketDistribution(distribution, options) {
  const legacyValues = validateLegacyInputValues(distribution)
  if (!isRecord(options) || !hasOwn(options, 'support')) {
    failAdapter(
      DISTRIBUTION_RESULT_ERROR_CODES.LEGACY_SUPPORT_REQUIRED,
      'legacy conversion requires explicit options.support'
    )
  }

  const explicitValues = new Float64Array(LEGACY_PUBLISHED_OVERFLOW_INDEX)
  for (let index = 0; index < explicitValues.length; index += 1) {
    explicitValues[index] = legacyValues[index]
  }

  return createValidatedResult(
    explicitValues,
    0,
    options.support,
    {
      kind: 'exact',
      lowerBound: LEGACY_PUBLISHED_OVERFLOW_INDEX,
      probability: legacyValues[LEGACY_PUBLISHED_OVERFLOW_INDEX],
      errorBound: 0,
    }
  )
}

function normalizeLegacyOutputLength(options) {
  if (options === undefined) {
    return LEGACY_PUBLISHED_BUCKET_LENGTH
  }
  if (!isRecord(options)) {
    failAdapter(
      DISTRIBUTION_RESULT_ERROR_CODES.LEGACY_LENGTH_OPTION,
      'legacy output options must be an object'
    )
  }
  const length = options.length === undefined
    ? LEGACY_PUBLISHED_BUCKET_LENGTH
    : options.length
  if (
    !Number.isSafeInteger(length)
    || length !== LEGACY_PUBLISHED_BUCKET_LENGTH
  ) {
    failAdapter(
      DISTRIBUTION_RESULT_ERROR_CODES.LEGACY_LENGTH_OPTION,
      `legacy output length must be ${LEGACY_PUBLISHED_BUCKET_LENGTH}`,
      { length }
    )
  }
  return length
}

function validateExactOverflowProjection({ overflow }) {
  if (overflow === null || overflow.kind === 'upper-bound') {
    return
  }
  if (overflow.lowerBound >= LEGACY_PUBLISHED_OVERFLOW_INDEX) {
    return
  }

  const hasPotentialMass = hasPotentialOverflowMass(overflow)
  if (!hasPotentialMass) {
    return
  }
  failAdapter(
    DISTRIBUTION_RESULT_ERROR_CODES.UNSAFE_PROJECTION,
    'exact overflow with potential mass below the legacy overflow bucket cannot be projected safely',
    {
      lowerBound: overflow.lowerBound,
      probability: overflow.probability,
      errorBound: overflow.errorBound,
      legacyOverflowIndex: LEGACY_PUBLISHED_OVERFLOW_INDEX,
    }
  )
}

/**
 * Convert a canonical result to a fresh 1024-element legacy probability
 * array. Exact overflow is folded into bucket 1023 only when its lower bound
 * is at least 1023, or when the overflow is inert.
 */
export function toPublishedBucketDistribution(result, options) {
  const length = normalizeLegacyOutputLength(options)
  const inspected = inspectDistributionResult(result)
  const { values, offset, overflow } = inspected

  if (overflow?.kind === 'upper-bound') {
    failAdapter(
      DISTRIBUTION_RESULT_ERROR_CODES.UPPER_BOUND_PROJECTION,
      'upper-bound overflow is not an actual probability and cannot be projected to legacy buckets',
      { probabilityUpperBound: overflow.probabilityUpperBound }
    )
  }

  validateExactOverflowProjection(inspected)

  const published = new Float64Array(length)
  for (let index = 0; index < values.length; index += 1) {
    const value = offset + index
    const target = value >= LEGACY_PUBLISHED_OVERFLOW_INDEX
      ? LEGACY_PUBLISHED_OVERFLOW_INDEX
      : value
    published[target] += values[index]
  }

  if (overflow !== null) {
    published[LEGACY_PUBLISHED_OVERFLOW_INDEX] += overflow.probability
  }
  return published
}
