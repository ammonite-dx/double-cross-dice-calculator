import {
  validateDistributionResult,
} from '../../calculation/DistributionResult'

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

function hasOwn(value, property) {
  return Object.prototype.hasOwnProperty.call(value, property)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function freezeDetails(details) {
  return Object.freeze(isRecord(details) ? { ...details } : {})
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

function copySupport(support) {
  if (support.kind === 'finite') {
    return Object.freeze({
      kind: 'finite',
      max: support.max,
    })
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

function copyProjectionUncertainty(metadata) {
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

  const copied = { positionUnknownProbabilityUpperBound }
  if (hasOwn(value, 'outputOverflowLowerBound')) {
    const outputOverflowLowerBound = value.outputOverflowLowerBound
    if (
      outputOverflowLowerBound !== null
      && (!Number.isSafeInteger(outputOverflowLowerBound)
        || outputOverflowLowerBound < 0)
    ) {
      fail(
        DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
        'Envelope.metadata.projectionUncertainty.outputOverflowLowerBound must be null or a non-negative safe integer',
        { outputOverflowLowerBound }
      )
    }
    copied.outputOverflowLowerBound = outputOverflowLowerBound
  }
  return Object.freeze(copied)
}

function validateEnvelope(envelope) {
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

  try {
    validateDistributionResult(result)
  } catch (error) {
    const details = typeof error?.code === 'string'
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
  if (!Number.isSafeInteger(result.offset) || result.offset < 0) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      'distribution display does not support negative explicit offsets',
      { offset: result.offset }
    )
  }

  return {
    values: result.values,
    offset: result.offset,
    explicitMax: result.values.length === 0
      ? null
      : result.offset + result.values.length - 1,
    support: result.support,
    overflow: result.overflow,
    projectionUncertainty: copyProjectionUncertainty(metadata),
  }
}

function copyWarnings(warnings) {
  if (!Array.isArray(warnings)) {
    fail(
      DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_WARNING,
      'warnings must be an array'
    )
  }

  const copied = Array.from(warnings, (warning, index) => {
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
    if (!['info', 'warning', 'error', 'reject'].includes(warning.severity)) {
      fail(
        DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_WARNING,
        `warnings[${index}].severity must be info, warning, error, or reject`,
        { index }
      )
    }

    // Planner warnings are trusted, shallow DTOs. Keep consumer-visible
    // fields such as entryId/details, but do not recursively copy or freeze
    // their owned nested values.
    return Object.freeze({ ...warning })
  })
  return Object.freeze(copied)
}

function copyDisplayWindow(options) {
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

  return Object.freeze({ min, max })
}

function readSummary(options) {
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
  return summary
}

/**
 * Convert a modeled distribution into a UI-independent display model.
 * DistributionResult and statistics are validated at their owning boundary;
 * this function only projects them and copies the mutable probability array.
 * An optional displayWindow is retained as a request boundary and never
 * truncates the explicit coverage.
 */
export function presentDistribution(envelope, options = {}) {
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

  const display = {
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
  if (displayWindow !== null) {
    display.displayWindow = displayWindow
  }
  return Object.freeze(display)
}
