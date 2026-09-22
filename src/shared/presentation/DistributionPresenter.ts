import {
  validateDistributionResult,
} from '../../calculation/DistributionResult'
import type { CertifiedValue } from '../../domain/CertifiedValue'
import type {
  DistributionEnvelope,
  DistributionOverflow,
  DistributionResult,
  DistributionSupport,
  ProbabilityMassSummary,
} from '../../domain/DistributionResultTypes'
import type {
  DisplayProjectionUncertainty,
  DisplayWarning,
  DistributionDisplay,
} from './DistributionProjectionTypes'

/** @typedef {import('./DistributionProjectionTypes').DistributionDisplay} DistributionDisplay */
/** @typedef {import('./DistributionProjectionTypes').DistributionEnvelope} DistributionEnvelope */

export const DISTRIBUTION_DISPLAY_VERSION = 1

// The production probability labels use a 0.1 percentage-point display step.
// A position-unknown probability bound at or below half that step keeps the
// projection error within the UI display precision.
export const DISPLAY_PROBABILITY_TOLERANCE = 5e-4

export const DISTRIBUTION_PRESENTATION_ERROR_CODES = Object.freeze({
  INVALID_ENVELOPE: 'invalid-envelope',
  INVALID_OPTIONS: 'invalid-options',
  INVALID_DISPLAY_WINDOW: 'invalid-display-window',
  INVALID_SUMMARY: 'invalid-summary',
  INVALID_WARNING: 'invalid-warning',
})

interface PresentationSummary {
  readonly mass: ProbabilityMassSummary
  readonly expectedValue: CertifiedValue
}

interface PresentationOptions {
  readonly summary: PresentationSummary
  readonly warnings?: readonly unknown[]
  readonly displayWindow?: unknown
}

interface ValidatedEnvelope {
  readonly values: Float64Array
  readonly offset: number
  readonly explicitMax: number | null
  readonly support: DistributionSupport
  readonly overflow: DistributionOverflow | null
  readonly projectionUncertainty: DisplayProjectionUncertainty | null
}

function hasOwn(value: object, property: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, property)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function freezeDetails(details: unknown): Readonly<Record<string, unknown>> {
  return Object.freeze(isRecord(details) ? { ...details } : {})
}

export class DistributionPresentationError extends Error {
  readonly code: string
  readonly details: Readonly<Record<string, unknown>>
  readonly distributionPresentation = true
  readonly validation: boolean = false

  constructor(code: string, message: string, details: unknown = {}) {
    super(message)
    this.name = 'DistributionPresentationError'
    this.code = code
    this.details = freezeDetails(details)
  }
}

export class DistributionPresentationValidationError
  extends DistributionPresentationError {
  override readonly validation: boolean = true

  constructor(code: string, message: string, details: unknown = {}) {
    super(code, message, details)
    this.name = 'DistributionPresentationValidationError'
    this.validation = true
  }
}

export function isDistributionPresentationError(
  error: unknown,
): error is DistributionPresentationError {
  return isRecord(error)
    && error.distributionPresentation === true
    && typeof error.code === 'string'
}

export function isDistributionPresentationValidationError(
  error: unknown,
): error is DistributionPresentationValidationError {
  return isDistributionPresentationError(error) && error.validation === true
}

function fail(code: string, message: string, details: unknown = {}): never {
  throw new DistributionPresentationValidationError(code, message, details)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function copySupport(support: DistributionSupport): DistributionSupport {
  if (support.kind === 'finite') {
    return Object.freeze({
      kind: 'finite',
      max: support.max,
    })
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

function copyProjectionUncertainty(
  metadata: Record<string, unknown>,
): DisplayProjectionUncertainty | null {
  if (!hasOwn(metadata, 'projectionUncertainty')) {
    return null
  }

  const value = metadata.projectionUncertainty
  if (!isRecord(value)) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'Envelope.metadata.projectionUncertainty must be an object'
    )
  }

  const positionUnknownProbabilityUpperBound =
    value.positionUnknownProbabilityUpperBound
  if (
    !isFiniteNumber(positionUnknownProbabilityUpperBound)
    || positionUnknownProbabilityUpperBound < 0
    || positionUnknownProbabilityUpperBound > 1
  ) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'Envelope.metadata.projectionUncertainty.positionUnknownProbabilityUpperBound must be between 0 and 1',
      { positionUnknownProbabilityUpperBound }
    )
  }

  const copied: {
    positionUnknownProbabilityUpperBound: number
    outputOverflowLowerBound?: number | null
  } = {
    positionUnknownProbabilityUpperBound,
  }
  if (hasOwn(value, 'outputOverflowLowerBound')) {
    const outputOverflowLowerBound = value.outputOverflowLowerBound
    if (
      outputOverflowLowerBound !== null
      && (
        typeof outputOverflowLowerBound !== 'number'
        || !Number.isSafeInteger(outputOverflowLowerBound)
        || outputOverflowLowerBound < 0
      )
    ) {
      fail(
        DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
        'Envelope.metadata.projectionUncertainty.outputOverflowLowerBound must be null or a non-negative safe integer',
        { outputOverflowLowerBound }
      )
    }
    copied.outputOverflowLowerBound = outputOverflowLowerBound
  }
  return Object.freeze(copied) as DisplayProjectionUncertainty
}

function validateEnvelope(envelope: unknown): ValidatedEnvelope {
  if (!isRecord(envelope)) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'distribution presentation expects a modeled distribution envelope'
    )
  }

  const result = envelope.result
  const metadata = envelope.metadata
  if (!isRecord(result) || !isRecord(metadata)) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'distribution presentation expects result and metadata objects'
    )
  }
  if (metadata.modeledDistribution !== true) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'Envelope.metadata.modeledDistribution must be true'
    )
  }

  let typedResult: DistributionResult
  try {
    validateDistributionResult(result)
    typedResult = {
      version: result.version as number,
      values: result.values as Float64Array,
      offset: result.offset as number,
      support: result.support as DistributionSupport,
      overflow: result.overflow as DistributionOverflow | null,
    }
  } catch (error: unknown) {
    const details = isRecord(error) && typeof error.code === 'string'
      ? { causeCode: error.code }
      : {}
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'distribution envelope contains an invalid distribution result',
      details
    )
  }

  // Display coordinates are non-negative even though the calculation core
  // can represent a signed explicit offset.
  if (!Number.isSafeInteger(typedResult.offset) || typedResult.offset < 0) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'distribution display does not support negative explicit offsets',
      { offset: typedResult.offset }
    )
  }

  return {
    values: typedResult.values,
    offset: typedResult.offset,
    explicitMax: typedResult.values.length === 0
      ? null
      : typedResult.offset + typedResult.values.length - 1,
    support: typedResult.support,
    overflow: typedResult.overflow,
    projectionUncertainty: copyProjectionUncertainty(metadata),
  }
}

function copyWarnings(warnings: unknown): readonly DisplayWarning[] {
  if (!Array.isArray(warnings)) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_WARNING,
      'warnings must be an array'
    )
  }

  const copied = Array.from(warnings, (warning: unknown, index): DisplayWarning => {
    if (!isRecord(warning)) {
      fail(
        DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_WARNING,
        `warnings[${index}] must be an object`,
        { index }
      )
    }
    if (typeof warning.code !== 'string') {
      fail(
        DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_WARNING,
        `warnings[${index}].code must be a string`,
        { index }
      )
    }
    if (
      typeof warning.severity !== 'string'
      || !['info', 'warning', 'error', 'reject'].includes(warning.severity)
    ) {
      fail(
        DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_WARNING,
        `warnings[${index}].severity must be info, warning, error, or reject`,
        { index }
      )
    }

    // Planner warnings are trusted, shallow DTOs. Keep consumer-visible
    // fields such as entryId/details, but do not recursively copy or freeze
    // their owned nested values.
    return Object.freeze({ ...warning }) as DisplayWarning
  })
  return Object.freeze(copied)
}

function copyDisplayWindow(
  options: Record<string, unknown>,
): Readonly<{ min: number; max: number }> | null {
  if (!hasOwn(options, 'displayWindow')) {
    return null
  }

  const displayWindow = options.displayWindow
  if (!isRecord(displayWindow)) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_WINDOW,
      'options.displayWindow must be an object'
    )
  }

  const { min, max } = displayWindow
  if (typeof min !== 'number' || !Number.isSafeInteger(min) || min < 0) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_WINDOW,
      'options.displayWindow.min must be a non-negative safe integer',
      { min }
    )
  }
  if (typeof max !== 'number' || !Number.isSafeInteger(max) || max < 0) {
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

  return Object.freeze({ min, max })
}

function readSummary(options: Record<string, unknown>): PresentationSummary {
  if (!hasOwn(options, 'summary')) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_OPTIONS,
      'presentDistribution options.summary is required'
    )
  }
  const summary = options.summary
  if (
    !isRecord(summary)
    || !isRecord(summary.mass)
    || !isRecord(summary.expectedValue)
  ) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_SUMMARY,
      'summary must contain mass and expectedValue objects'
    )
  }
  return summary as unknown as PresentationSummary
}

/**
 * Convert a modeled distribution into a UI-independent display model.
 * DistributionResult and statistics are validated at their owning boundary;
 * this function only projects them and copies the mutable probability array.
 * An optional displayWindow is retained as a request boundary and never
 * truncates the explicit coverage.
 *
 * @param {DistributionEnvelope} envelope
 * @param {{ summary: Object, warnings?: readonly Object[], displayWindow?: { min: number, max: number } }} options
 * @returns {DistributionDisplay}
 */
export function presentDistribution(
  envelope: DistributionEnvelope,
  options: PresentationOptions,
): DistributionDisplay {
  if (!isRecord(options)) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_OPTIONS,
      'presentDistribution options must be an object'
    )
  }

  const summary = readSummary(options)
  const warnings = options.warnings === undefined ? [] : options.warnings
  const displayWindow = copyDisplayWindow(options)
  const validated = validateEnvelope(envelope)
  const probabilities = Array.from(validated.values)

  const display: DistributionDisplay = {
    version: DISTRIBUTION_DISPLAY_VERSION,
    kind: 'canonical-distribution-display',
    explicit: Object.freeze({
      offset: validated.offset,
      probabilities: Object.freeze(probabilities),
    }),
    explicitMax: validated.explicitMax,
    support: copySupport(validated.support),
    overflow: copyOverflow(validated.overflow),
    // Certified statistics are immutable calculation-owned values. Reusing
    // these references avoids a second, presentation-local schema validator.
    mass: summary.mass,
    expectedValue: summary.expectedValue,
    warnings: copyWarnings(warnings),
    ...(validated.projectionUncertainty === null
      ? {}
      : { projectionUncertainty: validated.projectionUncertainty }),
  }
  return Object.freeze({
    ...display,
    ...(displayWindow === null ? {} : { displayWindow }),
  })
}
