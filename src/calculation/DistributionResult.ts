import {
  createBoundedCertifiedValue,
  createExactCertifiedValue,
  createLowerBoundCertifiedValue,
} from '../domain/CertifiedValue'
import type {
  CertifiedValue,
} from '../domain/CertifiedValue'
import type {
  DistributionOverflow,
  DistributionResult,
  DistributionSupport,
  ProbabilityMassSummary,
} from '../domain/DistributionResultTypes'

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER
const FLOAT64_BYTES = Float64Array.BYTES_PER_ELEMENT

export const DISTRIBUTION_RESULT_VERSION = 1

// Keep the distribution result's mass checks in one place. This matches the
// existing runtime calculation total tolerance without changing those paths.
export const DISTRIBUTION_RESULT_TOLERANCE = 1e-8

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
})

type DistributionResultCode = string

interface InspectedDistributionResult {
  readonly result: DistributionResult
  readonly values: Float64Array
  readonly offset: number
  readonly explicitMax: number | null
  readonly explicitMass: number
  readonly support: DistributionSupport
  readonly overflow: DistributionOverflow | null
}

function hasOwn(object: object, property: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, property)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isValueSource(value: unknown): value is ArrayLike<number> {
  return value !== null
    && typeof value === 'object'
    && Number.isSafeInteger((value as { length?: unknown }).length)
    && ((value as { length: number }).length >= 0)
}

function freezeDetails(details: unknown): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...(isRecord(details) ? details : {}) })
}

export class DistributionResultError extends Error {
  readonly code: DistributionResultCode
  readonly details: Readonly<Record<string, unknown>>
  readonly distributionResultError = true
  readonly validation: boolean = false

  constructor(
    code: DistributionResultCode,
    message: string,
    details: unknown = {},
  ) {
    super(message)
    this.name = 'DistributionResultError'
    this.code = code
    this.details = freezeDetails(details)
  }
}

export class DistributionResultValidationError extends DistributionResultError {
  override readonly validation: boolean = true

  constructor(
    code: DistributionResultCode,
    message: string,
    details: unknown = {},
  ) {
    super(code, message, details)
    this.name = 'DistributionResultValidationError'
  }
}

export function isDistributionResultError(
  error: unknown,
): error is DistributionResultError {
  return isRecord(error)
    && error.distributionResultError === true
    && typeof error.code === 'string'
}

export function isDistributionResultValidationError(
  error: unknown,
): error is DistributionResultValidationError {
  return isDistributionResultError(error) && error.validation === true
}

function failValidation(
  code: DistributionResultCode,
  message: string,
  details: unknown = {},
): never {
  throw new DistributionResultValidationError(code, message, details)
}

function validateProbability(
  value: unknown,
  field: string,
  index?: number,
): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
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

function copyValues(values: unknown): Float64Array {
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

function validateResultValues(values: unknown): asserts values is Float64Array {
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

function validateOffset(offset: unknown, valuesLength: number): asserts offset is number {
  if (!Number.isSafeInteger(offset)) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_OFFSET,
      'offset must be a safe integer',
      { offset }
    )
  }
  // The last explicit coordinate is offset + length - 1.  A one-point
  // distribution at MAX_SAFE_INTEGER is therefore valid; only a second point
  // would leave the safe-integer domain.
  const numericOffset = offset as number
  const explicitMax = BigInt(numericOffset)
    + BigInt(valuesLength === 0 ? 0 : valuesLength - 1)
  if (
    explicitMax < BigInt(Number.MIN_SAFE_INTEGER)
    || explicitMax > BigInt(MAX_SAFE_INTEGER)
  ) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INDEX_OVERFLOW,
      'offset plus values.length minus one must be a safe integer',
      { offset: numericOffset, valuesLength }
    )
  }
}

function getExplicitMaxFromParts(
  offset: number,
  valuesLength: number,
): number | null {
  return valuesLength === 0 ? null : offset + valuesLength - 1
}

function hasPotentialOverflowMass(overflow: DistributionOverflow | null): boolean {
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

function validateSupport(
  support: unknown,
  explicitMax: number | null,
  overflow: DistributionOverflow | null,
): asserts support is DistributionSupport {
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
  if (!Number.isSafeInteger(support.max)) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SUPPORT,
      'finite support.max must be a safe integer',
      { max: support.max }
    )
  }
  const supportMax = support.max as number
  if (explicitMax !== null && supportMax < explicitMax) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.SUPPORT_BELOW_EXPLICIT,
      'finite support.max must be at least explicitMax',
      { explicitMax, supportMax }
    )
  }
  if (
    overflow !== null
    && hasPotentialOverflowMass(overflow)
    && supportMax < overflow.lowerBound
  ) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.SUPPORT_BELOW_OVERFLOW,
      'finite support.max must contain the overflow lowerBound',
      { lowerBound: overflow.lowerBound, supportMax }
    )
  }
}

function validateOverflow(overflow: unknown): DistributionOverflow | null {
  if (overflow === null) {
    return null
  }
  if (!isRecord(overflow) || typeof overflow.kind !== 'string') {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_OVERFLOW,
      'overflow must be null or a discriminated union'
    )
  }
  const lowerBound = overflow.lowerBound
  const errorBound = overflow.errorBound
  if (
    typeof lowerBound !== 'number'
    || !Number.isSafeInteger(lowerBound)
    || lowerBound < 0
  ) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_LOWER_BOUND,
      'overflow.lowerBound must be a non-negative safe integer',
      { lowerBound }
    )
  }
  if (
    typeof errorBound !== 'number'
    || !Number.isFinite(errorBound)
    || errorBound < 0
  ) {
    failValidation(
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_ERROR_BOUND,
      'overflow.errorBound must be a finite non-negative number',
      { errorBound }
    )
  }

  if (overflow.kind === 'exact') {
    const probability = overflow.probability
    validateProbability(probability, 'overflow.probability')
    return Object.freeze({
      kind: 'exact',
      lowerBound,
      probability,
      errorBound,
    })
  }
  if (overflow.kind === 'upper-bound') {
    const probabilityUpperBound = overflow.probabilityUpperBound
    validateProbability(
      probabilityUpperBound,
      'overflow.probabilityUpperBound'
    )
    return Object.freeze({
      kind: 'upper-bound',
      lowerBound,
      probabilityUpperBound,
      errorBound,
    })
  }

  failValidation(
    DISTRIBUTION_RESULT_ERROR_CODES.INVALID_OVERFLOW,
    'overflow.kind must be exact or upper-bound',
    { kind: overflow.kind }
  )
}

function sumValues(values: ArrayLike<number>): number {
  let total = 0
  for (let index = 0; index < values.length; index += 1) {
    total += values[index]
  }
  return total
}

function inspectDistributionResult(result: unknown): InspectedDistributionResult {
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

  const typedResult: DistributionResult = {
    version: result.version as number,
    values,
    offset: result.offset as number,
    support: result.support as DistributionSupport,
    overflow,
  }

  return {
    result: typedResult,
    values,
    offset: typedResult.offset,
    explicitMax,
    explicitMass,
    support: typedResult.support,
    overflow: typedResult.overflow,
  }
}

function copySupport(support: DistributionSupport): DistributionSupport {
  if (support.kind === 'finite') {
    return Object.freeze({ kind: 'finite', max: support.max })
  }
  return Object.freeze({ kind: 'infinite' })
}

function copyOverflow(
  overflow: DistributionOverflow | null,
): DistributionOverflow | null {
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

function createImmutableResult(
  values: Float64Array,
  offset: number,
  support: DistributionSupport,
  overflow: DistributionOverflow | null,
): DistributionResult {
  const result = {
    version: DISTRIBUTION_RESULT_VERSION,
    values,
    offset,
    support: copySupport(support),
    overflow: copyOverflow(overflow),
  }

  return Object.freeze(result)
}

function normalizeFactoryInput(input: unknown): Record<string, unknown> {
  if (isRecord(input) && hasOwn(input, 'values')) {
    return input
  }
  failValidation(
    DISTRIBUTION_RESULT_ERROR_CODES.INVALID_INPUT,
    'createDistributionResult expects a result object'
  )
}

/**
 * Create a distribution result with one defensive values copy.
 *
 * The returned result owns the copied Float64Array and exposes it directly.
 * Callers must treat `values` as read-only; use copyDistributionValues when a
 * writable copy is needed. Input values may be any object with a safe integer
 * length and numeric indexed elements.
 */
export function createDistributionResult(input: unknown): DistributionResult {
  const source = normalizeFactoryInput(input)
  const values = copyValues(source.values)
  const offset = source.offset === undefined ? 0 : source.offset
  const support = source.support
  const overflow = source.overflow === undefined ? null : source.overflow
  const version = source.version === undefined
    ? DISTRIBUTION_RESULT_VERSION
    : source.version
  const candidate: Record<string, unknown> = {
    version,
    values,
    offset,
    support,
    overflow,
  }

  const inspected = inspectDistributionResult(candidate)
  return createImmutableResult(
    values,
    inspected.offset,
    inspected.support,
    inspected.overflow,
  )
}

/** Validate a distribution result. Returns true and throws a typed error on failure. */
export function validateDistributionResult(result: unknown): true {
  inspectDistributionResult(result)
  return true
}

export function getExplicitMax(result: unknown): number | null {
  return inspectDistributionResult(result).explicitMax
}

export function copyDistributionValues(result: unknown): Float64Array {
  const { values } = inspectDistributionResult(result)
  return new Float64Array(values)
}

/**
 * Summarize explicit and overflow mass without conflating exact and upper-bound
 * overflow. `totalMass` is null for an upper-bound result because no exact
 * unrepresented mass is available.
 */
export function getProbabilityMassSummary(
  result: unknown,
): ProbabilityMassSummary {
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

function sumExplicitFirstMoment(values: Float64Array, offset: number): number {
  let firstMoment = 0
  for (let index = 0; index < values.length; index += 1) {
    firstMoment += (offset + index) * values[index]
  }
  return firstMoment
}

/**
 * Summarize the expected value without assigning a point value to overflow.
 *
 * The explicit values contribute their first moment directly. Exact overflow
 * contributes a point value only when its support is known exactly; otherwise
 * the result retains the strongest safe interval or lower bound available.
 * Upper-bound overflow is never treated as actual probability mass.
 */
export function getCertifiedExpectedValue(result: unknown): CertifiedValue {
  const inspected = inspectDistributionResult(result)
  const { values, offset, support, overflow } = inspected
  const explicitFirstMoment = sumExplicitFirstMoment(values, offset)

  if (overflow === null) {
    return createExactCertifiedValue(explicitFirstMoment)
  }

  if (overflow.kind === 'exact') {
    const lowerExpectedValue = explicitFirstMoment
      + overflow.probability * overflow.lowerBound

    if (support.kind === 'finite') {
      const upperExpectedValue = explicitFirstMoment
        + overflow.probability * support.max
      if (overflow.probability === 0 || overflow.lowerBound === support.max) {
        return createExactCertifiedValue(lowerExpectedValue)
      }
      return createBoundedCertifiedValue(
        lowerExpectedValue,
        upperExpectedValue
      )
    }

    if (overflow.probability === 0) {
      return createExactCertifiedValue(explicitFirstMoment)
    }
    return createLowerBoundCertifiedValue(lowerExpectedValue)
  }

  if (overflow.probabilityUpperBound === 0) {
    return createExactCertifiedValue(explicitFirstMoment)
  }
  if (support.kind === 'finite') {
    return createBoundedCertifiedValue(
      explicitFirstMoment,
      explicitFirstMoment + overflow.probabilityUpperBound * support.max
    )
  }
  return createLowerBoundCertifiedValue(explicitFirstMoment)
}
