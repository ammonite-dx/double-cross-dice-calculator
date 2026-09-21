import {
  DISPLAY_PROBABILITY_TOLERANCE,
} from './DistributionPresenter'
import { planDisplayRange } from './DisplayRangePlanner'

/** @typedef {import('./DistributionProjectionTypes').DistributionProjection} DistributionProjection */
/** @typedef {import('./DistributionProjectionTypes').ReadyDistributionProjection} ReadyDistributionProjection */

export const DISTRIBUTION_PROJECTION_VERSION = 1

export const DISTRIBUTION_PROJECTION_MODES = Object.freeze({
  PMF: 'pmf',
  UPPER_TAIL: 'upper-tail',
})

export const DISTRIBUTION_PROJECTION_DECISIONS = Object.freeze({
  REUSE: 'reuse',
  KNOWN_ZERO: 'known-zero',
  RECALCULATE: 'recalculate',
  RESOURCE_REJECTED: 'resource-rejected',
  NOT_PROJECTABLE: 'not-projectable',
})

export const DISTRIBUTION_PROJECTION_REASONS = Object.freeze({
  RECALCULATE: 'recalculate',
  RESOURCE_REJECTED: 'resource-rejected',
  FINITE_SUPPORT_OUTSIDE: 'finite-support-outside',
  EXPLICIT_COVERAGE: 'explicit-coverage',
  EXPLICIT_COVERAGE_WITH_KNOWN_ZERO: 'explicit-coverage-with-known-zero',
  EXACT_OVERFLOW_OVERLAP: 'exact-overflow-overlap',
  UPPER_BOUND_OVERFLOW: 'upper-bound-overflow',
  PROJECTION_UNCERTAINTY: 'projection-uncertainty',
})

export const DISTRIBUTION_PROJECTION_ERROR_CODES = Object.freeze({
  INVALID_OPTIONS: 'invalid-options',
  INVALID_MODE: 'invalid-mode',
})

function hasOwn(value, property) {
  return Object.prototype.hasOwnProperty.call(value, property)
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

function freezeDetails(details) {
  return Object.freeze(isPlainRecord(details) ? { ...details } : {})
}

export class DistributionProjectionError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'DistributionProjectionError'
    this.code = code
    this.details = freezeDetails(details)
    this.distributionProjection = true
  }
}

export class DistributionProjectionValidationError
  extends DistributionProjectionError {
  constructor(code, message, details = {}) {
    super(code, message, details)
    this.name = 'DistributionProjectionValidationError'
    this.validation = true
  }
}

export function isDistributionProjectionError(error) {
  return error?.distributionProjection === true
    && typeof error.code === 'string'
}

export function isDistributionProjectionValidationError(error) {
  return isDistributionProjectionError(error) && error.validation === true
}

function fail(code, message, details = {}) {
  throw new DistributionProjectionValidationError(code, message, details)
}

function normalizeOptions(options) {
  const supplied = options === undefined ? {} : options
  if (!isPlainRecord(supplied)) {
    fail(
      DISTRIBUTION_PROJECTION_ERROR_CODES.INVALID_OPTIONS,
      'projectDistribution options must be a plain record',
      { path: 'options' }
    )
  }

  const mode = supplied.mode === undefined
    ? DISTRIBUTION_PROJECTION_MODES.PMF
    : supplied.mode
  if (
    mode !== DISTRIBUTION_PROJECTION_MODES.PMF
    && mode !== DISTRIBUTION_PROJECTION_MODES.UPPER_TAIL
  ) {
    fail(
      DISTRIBUTION_PROJECTION_ERROR_CODES.INVALID_MODE,
      'options.mode must be pmf or upper-tail',
      { mode }
    )
  }

  const displayWindow = supplied.displayWindow === undefined
    ? undefined
    : supplied.displayWindow
  if (displayWindow === null) {
    fail(
      DISTRIBUTION_PROJECTION_ERROR_CODES.INVALID_OPTIONS,
      'options.displayWindow must not be null',
      { path: 'options.displayWindow' }
    )
  }

  const plannerOptions = {}
  if (displayWindow !== undefined) {
    plannerOptions.displayWindow = displayWindow
  }
  if (hasOwn(supplied, 'policy')) {
    plannerOptions.policy = supplied.policy
  }

  return { mode, plannerOptions }
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

function hasOutputOverflowLowerBound(uncertainty) {
  return uncertainty !== null
    && hasOwn(uncertainty, 'outputOverflowLowerBound')
    && uncertainty.outputOverflowLowerBound !== null
}

function getOverflowLowerBound(overflow, uncertainty) {
  if (uncertainty !== null) {
    return hasOutputOverflowLowerBound(uncertainty)
      ? uncertainty.outputOverflowLowerBound
      : null
  }
  return overflow?.lowerBound ?? null
}

function makeWindow(plan) {
  // DisplayRangePlanner owns and freezes this value. Reuse it instead of
  // creating another structurally identical window for every projection
  // status.
  return plan.displayWindow
}

/** @returns {DistributionProjection} */
function makeNotReady(plan, mode, decision, reason, status = 'not-ready') {
  return Object.freeze({
    kind: 'canonical-distribution-projection',
    version: DISTRIBUTION_PROJECTION_VERSION,
    status,
    decision,
    reason,
    mode,
    displayWindow: makeWindow(plan),
    plan,
  })
}

/** @returns {DistributionProjection} */
function makeNotProjectable(plan, mode, reason) {
  return Object.freeze({
    kind: 'canonical-distribution-projection',
    version: DISTRIBUTION_PROJECTION_VERSION,
    status: plan.coverage.missingSegments.length > 0
      ? 'not-ready'
      : 'not-projectable',
    decision: DISTRIBUTION_PROJECTION_DECISIONS.NOT_PROJECTABLE,
    reason,
    mode,
    displayWindow: makeWindow(plan),
    plan,
  })
}

/** @returns {ReadyDistributionProjection} */
function makeReady(plan, mode, values, decision) {
  return Object.freeze({
    kind: 'canonical-distribution-projection',
    version: DISTRIBUTION_PROJECTION_VERSION,
    status: 'ready',
    decision,
    reason: decision === DISTRIBUTION_PROJECTION_DECISIONS.KNOWN_ZERO
      ? DISTRIBUTION_PROJECTION_REASONS.FINITE_SUPPORT_OUTSIDE
      : plan.reason,
    mode,
    displayWindow: makeWindow(plan),
    plan,
    values,
  })
}

function getExplicitValue(display, value) {
  const { offset, probabilities } = display.explicit
  return probabilities[value - offset]
}

function fillPmf(values, display, plan) {
  const { min, max } = plan.displayWindow
  const { offset, probabilities } = display.explicit
  const explicitMax = display.explicitMax
  const support = display.support
  for (let value = min, index = 0; value <= max; value += 1, index += 1) {
    if (explicitMax !== null && value >= offset && value <= explicitMax) {
      values[index] = probabilities[value - offset]
      continue
    }
    if (support.kind === 'finite' && value > support.max) {
      values[index] = 0
      continue
    }
    throw new DistributionProjectionError(
      DISTRIBUTION_PROJECTION_ERROR_CODES.INVALID_OPTIONS,
      'projection plan does not cover a requested PMF coordinate',
      { value }
    )
  }
}

function fillUpperTail(values, display, plan) {
  const { min, max } = plan.displayWindow
  const { offset, probabilities } = display.explicit
  const explicitMax = display.explicitMax
  const support = display.support
  const overflow = display.overflow
  let tail

  if (offset === 0) {
    tail = 1
    for (let value = 0; value < min; value += 1) {
      if (explicitMax !== null && value <= explicitMax) {
        tail -= probabilities[value]
      } else if (support.kind === 'finite' && value > support.max) {
        tail = 0
      } else {
        throw new DistributionProjectionError(
          DISTRIBUTION_PROJECTION_ERROR_CODES.INVALID_OPTIONS,
          'projection plan does not cover an upper-tail prefix',
          { value }
        )
      }
    }
  } else {
    if (explicitMax === null || min < offset || min > explicitMax) {
      throw new DistributionProjectionError(
        DISTRIBUTION_PROJECTION_ERROR_CODES.INVALID_OPTIONS,
        'offset upper-tail projection requires explicit coverage at min',
        { min, offset, explicitMax }
      )
    }
    tail = 0
    for (
      let explicitIndex = min - offset;
      explicitIndex < probabilities.length;
      explicitIndex += 1
    ) {
      tail += probabilities[explicitIndex]
    }
    if (overflow?.kind === 'exact' && hasPotentialOverflowMass(overflow)) {
      tail += overflow.probability
    }
  }

  for (let value = min, index = 0; value <= max; value += 1, index += 1) {
    if (explicitMax !== null && value >= offset && value <= explicitMax) {
      values[index] = tail
      tail -= getExplicitValue(display, value)
      continue
    }
    if (support.kind === 'finite' && value > support.max) {
      values[index] = 0
      tail = 0
      continue
    }
    throw new DistributionProjectionError(
      DISTRIBUTION_PROJECTION_ERROR_CODES.INVALID_OPTIONS,
      'projection plan does not cover an upper-tail coordinate',
      { value }
    )
  }
}

function createValues(display, plan, mode) {
  const values = new Float64Array(plan.displayWindow.pointCount)
  if (plan.decision === DISTRIBUTION_PROJECTION_DECISIONS.KNOWN_ZERO) {
    return values
  }
  if (mode === DISTRIBUTION_PROJECTION_MODES.PMF) {
    fillPmf(values, display, plan)
  } else {
    fillUpperTail(values, display, plan)
  }
  return values
}

function classifyOverflow(display, plan, mode) {
  if (plan.decision === DISTRIBUTION_PROJECTION_DECISIONS.KNOWN_ZERO) {
    return null
  }

  const overflow = display.overflow
  const uncertainty = display.projectionUncertainty ?? null
  const hasOverflow = hasPotentialOverflowMass(overflow)
  const positionUnknown = uncertainty?.positionUnknownProbabilityUpperBound
  const positionUnknownExceedsTolerance = positionUnknown !== undefined
    && positionUnknown > DISPLAY_PROBABILITY_TOLERANCE

  if (!hasOverflow && !positionUnknownExceedsTolerance) {
    return null
  }

  if (overflow?.kind === 'upper-bound') {
    // An upper-bound output tail cannot supply exact cumulative values. A
    // score-position tail is the exception when its uncertainty is below the
    // display tolerance and no separate output tail remains.
    if (
      mode === DISTRIBUTION_PROJECTION_MODES.UPPER_TAIL
      && (
        uncertainty === null
        || positionUnknownExceedsTolerance
        || hasOutputOverflowLowerBound(uncertainty)
      )
    ) {
      return DISTRIBUTION_PROJECTION_REASONS.UPPER_BOUND_OVERFLOW
    }
    if (positionUnknownExceedsTolerance) {
      return DISTRIBUTION_PROJECTION_REASONS.UPPER_BOUND_OVERFLOW
    }
    const lowerBound = getOverflowLowerBound(overflow, uncertainty)
    if (lowerBound !== null && lowerBound <= plan.displayWindow.max) {
      return DISTRIBUTION_PROJECTION_REASONS.UPPER_BOUND_OVERFLOW
    }
    return null
  }

  // Exact overflow position overlap can be resolved by recalculating with a
  // larger explicit range. The same applies to an exact tail whose position
  // uncertainty exceeds the display tolerance.
  if (positionUnknownExceedsTolerance) {
    return DISTRIBUTION_PROJECTION_REASONS.EXACT_OVERFLOW_OVERLAP
  }
  const lowerBound = getOverflowLowerBound(overflow, uncertainty)
  return lowerBound !== null && lowerBound <= plan.displayWindow.max
    ? DISTRIBUTION_PROJECTION_REASONS.EXACT_OVERFLOW_OVERLAP
    : null
}

function classifyDecision(display, plan, mode) {
  if (plan.status === 'resource-rejected') {
    return {
      decision: DISTRIBUTION_PROJECTION_DECISIONS.RESOURCE_REJECTED,
      reason: DISTRIBUTION_PROJECTION_REASONS.RESOURCE_REJECTED,
    }
  }

  const overflowReason = classifyOverflow(display, plan, mode)
  if (overflowReason === DISTRIBUTION_PROJECTION_REASONS.UPPER_BOUND_OVERFLOW) {
    return {
      decision: DISTRIBUTION_PROJECTION_DECISIONS.NOT_PROJECTABLE,
      reason: overflowReason,
    }
  }
  if (overflowReason === DISTRIBUTION_PROJECTION_REASONS.EXACT_OVERFLOW_OVERLAP) {
    return {
      decision: DISTRIBUTION_PROJECTION_DECISIONS.RECALCULATE,
      reason: overflowReason,
    }
  }

  if (plan.decision === DISTRIBUTION_PROJECTION_DECISIONS.KNOWN_ZERO) {
    return {
      decision: DISTRIBUTION_PROJECTION_DECISIONS.KNOWN_ZERO,
      reason: DISTRIBUTION_PROJECTION_REASONS.FINITE_SUPPORT_OUTSIDE,
    }
  }
  if (plan.decision === DISTRIBUTION_PROJECTION_DECISIONS.RECALCULATE) {
    return {
      decision: DISTRIBUTION_PROJECTION_DECISIONS.RECALCULATE,
      reason: DISTRIBUTION_PROJECTION_REASONS.RECALCULATE,
    }
  }
  return {
    decision: DISTRIBUTION_PROJECTION_DECISIONS.REUSE,
    reason: plan.reason,
  }
}

/**
 * Project a trusted canonical distribution display into a requested window.
 * Planning and projection are intentionally one operation so callers cannot
 * accidentally allocate a partial series for a missing or uncertain range.
 * The returned `values` buffer is present only for ready projections and is
 * an owned Float64Array independent of the display's explicit coefficients.
 *
 * @param {Object} display A trusted display payload from
 * `presentDistribution`.
 * @param {Object} [options] Projection mode, display window, and policy.
 * @returns {DistributionProjection}
 */
export function projectDistribution(display, options = {}) {
  const normalized = normalizeOptions(options)
  const plan = planDisplayRange(display, normalized.plannerOptions)
  const classification = classifyDecision(display, plan, normalized.mode)

  if (classification.decision === DISTRIBUTION_PROJECTION_DECISIONS.RESOURCE_REJECTED) {
    return makeNotReady(
      plan,
      normalized.mode,
      classification.decision,
      classification.reason
    )
  }
  if (classification.decision === DISTRIBUTION_PROJECTION_DECISIONS.NOT_PROJECTABLE) {
    return makeNotProjectable(plan, normalized.mode, classification.reason)
  }
  if (classification.decision === DISTRIBUTION_PROJECTION_DECISIONS.RECALCULATE) {
    return makeNotReady(
      plan,
      normalized.mode,
      classification.decision,
      classification.reason,
      classification.reason
        === DISTRIBUTION_PROJECTION_REASONS.EXACT_OVERFLOW_OVERLAP
        && plan.coverage.missingSegments.length === 0
        ? 'not-projectable'
        : 'not-ready'
    )
  }

  const values = createValues(display, plan, normalized.mode)
  return makeReady(
    plan,
    normalized.mode,
    values,
    classification.decision
  )
}
