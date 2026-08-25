import {
  DISPLAY_RANGE_PLANNER_VERSION,
} from './DisplayRangePlanner'
import {
  CANONICAL_DISTRIBUTION_DISPLAY_VERSION,
  DISPLAY_PROBABILITY_TOLERANCE,
} from './DistributionPresenter'

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER

export const CANONICAL_CHART_SERIES_VERSION = 1

export const CANONICAL_CHART_SERIES_MODES = Object.freeze({
  PMF: 'pmf',
  UPPER_TAIL: 'upper-tail',
})

export const CANONICAL_CHART_SERIES_ERROR_CODES = Object.freeze({
  INVALID_DISPLAY: 'invalid-display',
  INVALID_PLAN: 'invalid-plan',
  INVALID_OPTIONS: 'invalid-options',
  INVALID_MODE: 'invalid-mode',
  INVALID_SERIES: 'invalid-series',
  INVALID_MATERIALIZER_OPTIONS: 'invalid-materializer-options',
  RANGE_OVERFLOW: 'range-overflow',
  EXACT_OVERFLOW_OVERLAP: 'exact-overflow-overlap',
  UPPER_BOUND_OVERFLOW: 'upper-bound-overflow',
})

export const CANONICAL_CHART_SERIES_NOT_READY_REASONS = Object.freeze({
  RECALCULATE: 'recalculate',
  RESOURCE_REJECTED: 'resource-rejected',
})

export const CANONICAL_CHART_SERIES_NOT_PROJECTABLE_REASONS = Object.freeze({
  EXACT_OVERFLOW_OVERLAP: 'exact-overflow-overlap',
  UPPER_BOUND_OVERFLOW: 'upper-bound-overflow',
})

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property)
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

export class CanonicalChartSeriesError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'CanonicalChartSeriesError'
    this.code = code
    this.details = freezeDetails(details)
    this.canonicalChartSeries = true
  }
}

export class CanonicalChartSeriesValidationError
  extends CanonicalChartSeriesError {
  constructor(code, message, details = {}) {
    super(code, message, details)
    this.name = 'CanonicalChartSeriesValidationError'
    this.validation = true
  }
}

export function isCanonicalChartSeriesError(error) {
  return error?.canonicalChartSeries === true
    && typeof error.code === 'string'
}

export function isCanonicalChartSeriesValidationError(error) {
  return isCanonicalChartSeriesError(error) && error.validation === true
}

function fail(code, message, details = {}) {
  throw new CanonicalChartSeriesValidationError(code, message, details)
}

function getOwnDataProperty(value, property, code, path) {
  if (!hasOwn(value, property)) {
    fail(
      code,
      `${path}.${property} must be an own data property`,
      { path: `${path}.${property}`, property }
    )
  }

  let descriptor
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, property)
  } catch {
    fail(
      code,
      `${path}.${property} could not be inspected safely`,
      { path: `${path}.${property}`, property }
    )
  }
  if (!descriptor || !hasOwn(descriptor, 'value')) {
    fail(
      code,
      `${path}.${property} must be an own data property`,
      { path: `${path}.${property}`, property }
    )
  }
  return descriptor.value
}

function requirePlainRecord(value, code, path, message) {
  if (!isPlainRecord(value)) {
    fail(code, message ?? `${path} must be a plain record`, { path })
  }
  return value
}

function requireSafeNonNegativeInteger(value, code, path) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(
      code,
      `${path} must be a non-negative safe integer`,
      { path, value }
    )
  }
  return value
}

function requireFiniteNonNegativeNumber(value, code, path) {
  if (!Number.isFinite(value) || value < 0) {
    fail(
      code,
      `${path} must be a finite non-negative number`,
      { path, value }
    )
  }
  return value
}

function requireProbability(value, code, path) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    fail(
      code,
      `${path} must be a finite probability between 0 and 1`,
      { path, value }
    )
  }
  return value
}

function copySupport(value, code, path) {
  const support = requirePlainRecord(value, code, path)
  const kind = getOwnDataProperty(support, 'kind', code, path)
  if (kind === 'finite') {
    const max = getOwnDataProperty(support, 'max', code, path)
    requireSafeNonNegativeInteger(max, code, `${path}.max`)
    return { kind, max }
  }
  if (kind === 'infinite') {
    if (hasOwn(support, 'max')) {
      fail(code, `${path} must not contain max for infinite support`, {
        path: `${path}.max`,
      })
    }
    return { kind }
  }
  fail(code, `${path}.kind must be finite or infinite`, {
    path: `${path}.kind`,
    value: kind,
  })
}

function copyOverflow(value, code, path) {
  if (value === null) {
    return null
  }
  const overflow = requirePlainRecord(value, code, path)
  const kind = getOwnDataProperty(overflow, 'kind', code, path)
  const lowerBound = getOwnDataProperty(overflow, 'lowerBound', code, path)
  const errorBound = getOwnDataProperty(overflow, 'errorBound', code, path)
  requireSafeNonNegativeInteger(lowerBound, code, `${path}.lowerBound`)
  requireFiniteNonNegativeNumber(errorBound, code, `${path}.errorBound`)

  if (kind === 'exact') {
    const probability = getOwnDataProperty(overflow, 'probability', code, path)
    requireProbability(probability, code, `${path}.probability`)
    return { kind, lowerBound, probability, errorBound }
  }
  if (kind === 'upper-bound') {
    const probabilityUpperBound = getOwnDataProperty(
      overflow,
      'probabilityUpperBound',
      code,
      path
    )
    requireProbability(
      probabilityUpperBound,
      code,
      `${path}.probabilityUpperBound`
    )
    return { kind, lowerBound, probabilityUpperBound, errorBound }
  }
  fail(code, `${path}.kind must be exact or upper-bound`, {
    path: `${path}.kind`,
    value: kind,
  })
}

function hasPotentialOverflowMass(overflow) {
  if (overflow === null) {
    return false
  }
  return overflow.errorBound > 0
    || (overflow.kind === 'exact'
      ? overflow.probability > 0
      : overflow.probabilityUpperBound > 0)
}

function copyProjectionUncertainty(value, code, path) {
  if (value === undefined) {
    return null
  }
  const uncertainty = requirePlainRecord(value, code, path)
  const positionUnknownProbabilityUpperBound = getOwnDataProperty(
    uncertainty,
    'positionUnknownProbabilityUpperBound',
    code,
    path
  )
  requireProbability(
    positionUnknownProbabilityUpperBound,
    code,
    `${path}.positionUnknownProbabilityUpperBound`
  )
  const copied = { positionUnknownProbabilityUpperBound }
  if (hasOwn(uncertainty, 'outputOverflowLowerBound')) {
    const outputOverflowLowerBound = getOwnDataProperty(
      uncertainty,
      'outputOverflowLowerBound',
      code,
      path
    )
    if (outputOverflowLowerBound !== null) {
      requireSafeNonNegativeInteger(
        outputOverflowLowerBound,
        code,
        `${path}.outputOverflowLowerBound`
      )
    }
    copied.outputOverflowLowerBound = outputOverflowLowerBound
  }
  return copied
}

function validateProbabilityContainer(values, path) {
  if (!Array.isArray(values) && !(values instanceof Float64Array)) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
      `${path} must be an Array or Float64Array`,
      { path }
    )
  }
  if (!Number.isSafeInteger(values.length) || values.length < 0) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
      `${path}.length must be a non-negative safe integer`,
      { path: `${path}.length`, value: values.length }
    )
  }
  if (values.length > Math.floor(MAX_SAFE_INTEGER / Float64Array.BYTES_PER_ELEMENT)) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.RANGE_OVERFLOW,
      `${path} is too large for a Float64Array copy`,
      { path, length: values.length }
    )
  }
  return values
}

function normalizeDisplay(display) {
  requirePlainRecord(
    display,
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
    'display',
    'display must be a plain canonical distribution display record'
  )

  const kind = getOwnDataProperty(
    display,
    'kind',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
    'display'
  )
  if (kind !== 'canonical-distribution-display') {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
      'display.kind must be canonical-distribution-display',
      { path: 'display.kind', value: kind }
    )
  }

  const version = getOwnDataProperty(
    display,
    'version',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
    'display'
  )
  if (version !== CANONICAL_DISTRIBUTION_DISPLAY_VERSION) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
      `display.version must be ${CANONICAL_DISTRIBUTION_DISPLAY_VERSION}`,
      {
        path: 'display.version',
        value: version,
        expected: CANONICAL_DISTRIBUTION_DISPLAY_VERSION,
      }
    )
  }

  const explicit = requirePlainRecord(
    getOwnDataProperty(
      display,
      'explicit',
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
      'display'
    ),
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
    'display.explicit'
  )
  const offset = getOwnDataProperty(
    explicit,
    'offset',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
    'display.explicit'
  )
  requireSafeNonNegativeInteger(
    offset,
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
    'display.explicit.offset'
  )
  const probabilities = validateProbabilityContainer(
    getOwnDataProperty(
      explicit,
      'probabilities',
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
      'display.explicit'
    ),
    'display.explicit.probabilities'
  )
  if (probabilities.length > MAX_SAFE_INTEGER - offset) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.RANGE_OVERFLOW,
      'display explicit coverage exceeds the safe integer range',
      { offset, valuesLength: probabilities.length }
    )
  }
  const explicitMax = getOwnDataProperty(
    display,
    'explicitMax',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
    'display'
  )
  const derivedExplicitMax = probabilities.length === 0
    ? null
    : offset + probabilities.length - 1
  if (explicitMax !== derivedExplicitMax) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
      'display.explicitMax must match explicit coverage',
      { explicitMax, derivedExplicitMax }
    )
  }

  const support = copySupport(
    getOwnDataProperty(
      display,
      'support',
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
      'display'
    ),
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
    'display.support'
  )
  if (support.kind === 'finite' && explicitMax !== null && support.max < explicitMax) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
      'display.support.max must not be below explicitMax',
      { supportMax: support.max, explicitMax }
    )
  }

  const overflow = copyOverflow(
    getOwnDataProperty(
      display,
      'overflow',
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
      'display'
    ),
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
    'display.overflow'
  )
  if (
    support.kind === 'finite'
    && hasPotentialOverflowMass(overflow)
    && support.max < overflow.lowerBound
  ) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
      'display.support.max must contain the potential overflow lower bound',
      { supportMax: support.max, lowerBound: overflow.lowerBound }
    )
  }

  const projectionUncertainty = copyProjectionUncertainty(
    hasOwn(display, 'projectionUncertainty')
      ? getOwnDataProperty(
          display,
          'projectionUncertainty',
          CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
          'display'
        )
      : undefined,
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
    'display.projectionUncertainty'
  )

  return {
    offset,
    probabilities,
    explicitMax,
    support,
    overflow,
    projectionUncertainty,
  }
}

function normalizeSegment(value, path) {
  const segment = requirePlainRecord(
    value,
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    path
  )
  const min = getOwnDataProperty(
    segment,
    'min',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    path
  )
  const max = getOwnDataProperty(
    segment,
    'max',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    path
  )
  const pointCount = getOwnDataProperty(
    segment,
    'pointCount',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    path
  )
  requireSafeNonNegativeInteger(
    min,
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    `${path}.min`
  )
  requireSafeNonNegativeInteger(
    max,
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    `${path}.max`
  )
  requireSafeNonNegativeInteger(
    pointCount,
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    `${path}.pointCount`
  )
  if (max < min || pointCount !== max - min + 1) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      `${path} has inconsistent bounds`,
      { min, max, pointCount }
    )
  }
  return { min, max, pointCount }
}

function normalizePlan(plan) {
  requirePlainRecord(
    plan,
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan',
    'plan must be a display-range-plan record'
  )
  const version = getOwnDataProperty(
    plan,
    'version',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan'
  )
  if (version !== DISPLAY_RANGE_PLANNER_VERSION) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'plan.version is not supported',
      { version, expected: DISPLAY_RANGE_PLANNER_VERSION }
    )
  }
  const kind = getOwnDataProperty(
    plan,
    'kind',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan'
  )
  if (kind !== 'display-range-plan') {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'plan.kind must be display-range-plan',
      { kind }
    )
  }
  const accepted = getOwnDataProperty(
    plan,
    'accepted',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan'
  )
  const status = getOwnDataProperty(
    plan,
    'status',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan'
  )
  const decision = getOwnDataProperty(
    plan,
    'decision',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan'
  )
  if (typeof accepted !== 'boolean') {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'plan.accepted must be boolean',
      { accepted }
    )
  }
  if (status !== 'ready' && status !== 'resource-rejected') {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'plan.status must be ready or resource-rejected',
      { status }
    )
  }
  if (accepted !== (status === 'ready')) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'plan.accepted and plan.status disagree',
      { accepted, status }
    )
  }
  if (!['reuse', 'known-zero', 'recalculate'].includes(decision)) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'plan.decision is not supported',
      { decision }
    )
  }

  const displayWindow = normalizeSegment(
    getOwnDataProperty(
      plan,
      'displayWindow',
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'plan'
    ),
    'plan.displayWindow'
  )
  const coverage = requirePlainRecord(
    getOwnDataProperty(
      plan,
      'coverage',
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'plan'
    ),
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan.coverage'
  )
  const explicit = requirePlainRecord(
    getOwnDataProperty(
      coverage,
      'explicit',
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'plan.coverage'
    ),
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan.coverage.explicit'
  )
  const explicitOffset = getOwnDataProperty(
    explicit,
    'offset',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan.coverage.explicit'
  )
  const explicitMax = getOwnDataProperty(
    explicit,
    'max',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan.coverage.explicit'
  )
  requireSafeNonNegativeInteger(
    explicitOffset,
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan.coverage.explicit.offset'
  )
  if (
    explicitMax !== null
    && (!Number.isSafeInteger(explicitMax) || explicitMax < explicitOffset)
  ) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'plan.coverage.explicit.max is invalid',
      { explicitOffset, explicitMax }
    )
  }
  const support = copySupport(
    getOwnDataProperty(
      coverage,
      'support',
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'plan.coverage'
    ),
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan.coverage.support'
  )
  const overflow = copyOverflow(
    getOwnDataProperty(
      coverage,
      'overflow',
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'plan.coverage'
    ),
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'plan.coverage.overflow'
  )
  const projectionUncertainty = copyProjectionUncertainty(
    hasOwn(coverage, 'projectionUncertainty')
      ? getOwnDataProperty(
          coverage,
          'projectionUncertainty',
          CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
          'plan.coverage'
        )
      : undefined,
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan.coverage.projectionUncertainty'
  )
  const missingSegments = getOwnDataProperty(
    coverage,
    'missingSegments',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan.coverage'
  )
  if (!Array.isArray(missingSegments)) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'plan.coverage.missingSegments must be an Array',
      { path: 'plan.coverage.missingSegments' }
    )
  }
  const copiedMissingSegments = missingSegments.map((segment, index) => (
    normalizeSegment(segment, `plan.coverage.missingSegments[${index}]`)
  ))
  const knownZero = requirePlainRecord(
    getOwnDataProperty(
      coverage,
      'knownZero',
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'plan.coverage'
    ),
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan.coverage.knownZero'
  )
  const knownZeroKind = getOwnDataProperty(
    knownZero,
    'kind',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan.coverage.knownZero'
  )
  const knownZeroPointCount = getOwnDataProperty(
    knownZero,
    'pointCount',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan.coverage.knownZero'
  )
  requireSafeNonNegativeInteger(
    knownZeroPointCount,
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan.coverage.knownZero.pointCount'
  )
  let copiedKnownZero
  if (knownZeroKind === 'none') {
    if (knownZeroPointCount !== 0 || getOwnDataProperty(
      knownZero,
      'right',
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'plan.coverage.knownZero'
    ) !== null) {
      fail(
        CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
        'empty known-zero coverage is inconsistent',
        { path: 'plan.coverage.knownZero' }
      )
    }
    copiedKnownZero = { kind: 'none', pointCount: 0, right: null }
  } else if (knownZeroKind === 'finite-support-outside') {
    const right = normalizeSegment(
      getOwnDataProperty(
        knownZero,
        'right',
        CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
        'plan.coverage.knownZero'
      ),
      'plan.coverage.knownZero.right'
    )
    if (right.pointCount !== knownZeroPointCount) {
      fail(
        CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
        'known-zero pointCount does not match right segment',
        { knownZeroPointCount, rightPointCount: right.pointCount }
      )
    }
    copiedKnownZero = {
      kind: knownZeroKind,
      pointCount: knownZeroPointCount,
      right,
    }
  } else {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'plan.coverage.knownZero.kind is not supported',
      { kind: knownZeroKind }
    )
  }

  const estimates = requirePlainRecord(
    getOwnDataProperty(
      plan,
      'estimates',
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'plan'
    ),
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan.estimates'
  )
  const pointCount = getOwnDataProperty(
    estimates,
    'pointCount',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan.estimates'
  )
  const float64Bytes = getOwnDataProperty(
    estimates,
    'float64Bytes',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan.estimates'
  )
  const chartPoints = getOwnDataProperty(
    estimates,
    'chartPoints',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan.estimates'
  )
  requireSafeNonNegativeInteger(
    pointCount,
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan.estimates.pointCount'
  )
  requireSafeNonNegativeInteger(
    float64Bytes,
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan.estimates.float64Bytes'
  )
  requireSafeNonNegativeInteger(
    chartPoints,
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
    'plan.estimates.chartPoints'
  )
  if (pointCount !== displayWindow.pointCount) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'plan.estimates.pointCount must match displayWindow.pointCount',
      { pointCount, displayPointCount: displayWindow.pointCount }
    )
  }

  const rejectionReasons = hasOwn(plan, 'rejectionReasons')
    ? getOwnDataProperty(
        plan,
        'rejectionReasons',
        CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
        'plan'
      )
    : []
  if (!Array.isArray(rejectionReasons)) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'plan.rejectionReasons must be an Array',
      { path: 'plan.rejectionReasons' }
    )
  }
  const copiedRejectionReasons = rejectionReasons.map((reason, index) => {
    if (typeof reason !== 'string') {
      fail(
        CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
        `plan.rejectionReasons[${index}] must be a string`,
        { index, reason }
      )
    }
    return reason
  })

  return {
    accepted,
    status,
    decision,
    reason: getOwnDataProperty(
      plan,
      'reason',
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'plan'
    ),
    displayWindow,
    coverage: {
      explicit: { offset: explicitOffset, max: explicitMax },
      support,
      overflow,
      projectionUncertainty,
      missingSegments: copiedMissingSegments,
      knownZero: copiedKnownZero,
    },
    estimates: { pointCount, float64Bytes, chartPoints },
    rejectionReasons: copiedRejectionReasons,
  }
}

function overflowEquals(left, right) {
  if (left === null || right === null) {
    return left === right
  }
  if (left.kind !== right.kind || left.lowerBound !== right.lowerBound) {
    return false
  }
  if (left.errorBound !== right.errorBound) {
    return false
  }
  return left.kind === 'exact'
    ? left.probability === right.probability
    : left.probabilityUpperBound === right.probabilityUpperBound
}

function supportEquals(left, right) {
  return left.kind === right.kind
    && (left.kind === 'infinite' || left.max === right.max)
}

function projectionUncertaintyEquals(left, right) {
  const leftValue = left ?? null
  const rightValue = right ?? null
  if (leftValue === null || rightValue === null) {
    return leftValue === rightValue
  }
  return leftValue.positionUnknownProbabilityUpperBound ===
      rightValue.positionUnknownProbabilityUpperBound
    && (leftValue.outputOverflowLowerBound ?? null) ===
      (rightValue.outputOverflowLowerBound ?? null)
}

function assertPlanMatchesDisplay(plan, display) {
  if (
    plan.coverage.explicit.offset !== display.offset
    || plan.coverage.explicit.max !== display.explicitMax
    || !supportEquals(plan.coverage.support, display.support)
    || !overflowEquals(plan.coverage.overflow, display.overflow)
    || !projectionUncertaintyEquals(
      plan.coverage.projectionUncertainty,
      display.projectionUncertainty
    )
  ) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'plan coverage does not match display coverage',
      { path: 'plan.coverage' }
    )
  }
  if (plan.coverage.missingSegments.length !== 0) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'a ready chart series plan must have no missing coverage segments',
      { missingSegments: plan.coverage.missingSegments }
    )
  }
  if (plan.decision === 'known-zero') {
    if (
      display.support.kind !== 'finite'
      || plan.displayWindow.min <= display.support.max
      || plan.coverage.knownZero.kind !== 'finite-support-outside'
    ) {
      fail(
        CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
        'known-zero plan must be entirely outside finite support',
        { path: 'plan.decision' }
      )
    }
  }
  if (plan.decision === 'reuse' && plan.coverage.knownZero.kind === 'none') {
    if (
      display.explicitMax === null
      || plan.displayWindow.min < display.offset
      || plan.displayWindow.max > display.explicitMax
    ) {
      fail(
        CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
        'reuse plan must be contained by explicit coverage',
        { path: 'plan.coverage' }
      )
    }
  }
}

function readProbability(probabilities, index, path) {
  const property = String(index)
  let descriptor
  try {
    descriptor = Object.getOwnPropertyDescriptor(probabilities, property)
  } catch {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
      `${path}[${index}] could not be inspected safely`,
      { path: `${path}[${index}]` }
    )
  }
  if (!descriptor || !hasOwn(descriptor, 'value')) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
      `${path}[${index}] must be an own data property`,
      { path: `${path}[${index}]` }
    )
  }
  const value = descriptor.value
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_DISPLAY,
      `${path}[${index}] must be a finite probability between 0 and 1`,
      { path: `${path}[${index}]`, value }
    )
  }
  return value
}

function copyWindow(window) {
  return Object.freeze({
    min: window.min,
    max: window.max,
    pointCount: window.pointCount,
  })
}

function makeNotReady(plan, mode, reason) {
  return Object.freeze({
    kind: 'not-ready',
    version: CANONICAL_CHART_SERIES_VERSION,
    status: 'not-ready',
    mode,
    reason,
    displayWindow: copyWindow(plan.displayWindow),
    plannerStatus: plan.status,
    decision: plan.decision,
    rejectionReasons: Object.freeze([...plan.rejectionReasons]),
  })
}

function makeNotProjectable(plan, mode, reason, overflow) {
  return Object.freeze({
    kind: 'not-projectable',
    version: CANONICAL_CHART_SERIES_VERSION,
    status: 'not-projectable',
    mode,
    reason,
    displayWindow: copyWindow(plan.displayWindow),
    overflow: overflow === null ? null : Object.freeze({ ...overflow }),
  })
}

function assertOverflowDoesNotOverlapWindow(
  plan,
  mode,
  overflow,
  projectionUncertainty
) {
  if (!hasPotentialOverflowMass(overflow)) {
    return null
  }

  const hasProjectionDescriptor = projectionUncertainty !== null
    && projectionUncertainty !== undefined
  const positionUnknownProbabilityUpperBound =
    projectionUncertainty?.positionUnknownProbabilityUpperBound
  const positionUnknownWithinTolerance = hasProjectionDescriptor
    && positionUnknownProbabilityUpperBound <= DISPLAY_PROBABILITY_TOLERANCE
  const hasOutputOverflowLowerBound = hasProjectionDescriptor
    && hasOwn(projectionUncertainty, 'outputOverflowLowerBound')
    && projectionUncertainty.outputOverflowLowerBound !== null
  const outputOverflowLowerBound = hasOutputOverflowLowerBound
    ? projectionUncertainty.outputOverflowLowerBound
    : null

  if (hasProjectionDescriptor && !positionUnknownWithinTolerance) {
    return makeNotProjectable(
      plan,
      mode,
      overflow.kind === 'exact'
        ? CANONICAL_CHART_SERIES_NOT_PROJECTABLE_REASONS.EXACT_OVERFLOW_OVERLAP
        : CANONICAL_CHART_SERIES_NOT_PROJECTABLE_REASONS.UPPER_BOUND_OVERFLOW,
      overflow
    )
  }

  // An upper-bound output tail cannot be inserted into an upper-tail series:
  // its probability is not an exact value. A bounded score-position tail is
  // the exception only when its display effect is below the tolerance and
  // there is no separate output tail.
  if (
    overflow.kind === 'upper-bound'
    && mode === CANONICAL_CHART_SERIES_MODES.UPPER_TAIL
    && (!positionUnknownWithinTolerance || hasOutputOverflowLowerBound)
  ) {
    return makeNotProjectable(
      plan,
      mode,
      CANONICAL_CHART_SERIES_NOT_PROJECTABLE_REASONS.UPPER_BOUND_OVERFLOW,
      overflow
    )
  }

  const lowerBound = hasProjectionDescriptor
    ? outputOverflowLowerBound
    : overflow.lowerBound
  if (lowerBound !== null && lowerBound <= plan.displayWindow.max) {
    return makeNotProjectable(
      plan,
      mode,
      overflow.kind === 'exact'
        ? CANONICAL_CHART_SERIES_NOT_PROJECTABLE_REASONS.EXACT_OVERFLOW_OVERLAP
        : CANONICAL_CHART_SERIES_NOT_PROJECTABLE_REASONS.UPPER_BOUND_OVERFLOW,
      overflow
    )
  }
  return null
}

function fillPmf(seriesValues, display, plan) {
  const { min, max } = plan.displayWindow
  const { offset, probabilities, explicitMax, support } = display
  for (let value = min, index = 0; value <= max; value += 1, index += 1) {
    if (explicitMax !== null && value >= offset && value <= explicitMax) {
      seriesValues[index] = readProbability(
        probabilities,
        value - offset,
        'display.explicit.probabilities'
      )
      continue
    }
    if (support.kind === 'finite' && value > support.max) {
      seriesValues[index] = 0
      continue
    }
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'ready plan does not cover a requested PMF coordinate',
      { value }
    )
  }
}

function fillUpperTail(seriesValues, display, plan) {
  const { min, max } = plan.displayWindow
  const { offset, probabilities, explicitMax, support, overflow } = display
  let tail

  if (offset === 0) {
    tail = 1
    for (let value = 0; value < min; value += 1) {
      if (explicitMax !== null && value <= explicitMax) {
        tail -= readProbability(
          probabilities,
          value,
          'display.explicit.probabilities'
        )
      } else if (support.kind === 'finite' && value > support.max) {
        tail = 0
      } else {
        fail(
          CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
          'ready plan does not cover a requested upper-tail prefix',
          { value }
        )
      }
    }
  } else {
    if (explicitMax === null || min < offset || min > explicitMax) {
      fail(
        CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
        'offset chart upper-tail projection requires explicit coverage at min',
        { offset, explicitMax, min }
      )
    }
    tail = 0
    for (
      let explicitIndex = min - offset;
      explicitIndex < probabilities.length;
      explicitIndex += 1
    ) {
      tail += readProbability(
        probabilities,
        explicitIndex,
        'display.explicit.probabilities'
      )
    }
    if (overflow?.kind === 'exact' && hasPotentialOverflowMass(overflow)) {
      tail += overflow.probability
    }
  }

  for (let value = min, index = 0; value <= max; value += 1, index += 1) {
    if (explicitMax !== null && value >= offset && value <= explicitMax) {
      seriesValues[index] = tail
      tail -= readProbability(
        probabilities,
        value - offset,
        'display.explicit.probabilities'
      )
      continue
    }
    if (support.kind === 'finite' && value > support.max) {
      seriesValues[index] = 0
      tail = 0
      continue
    }
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_PLAN,
      'ready plan does not cover a requested upper-tail coordinate',
      { value }
    )
  }
}

function normalizeModeOptions(options) {
  const supplied = options === undefined ? {} : options
  requirePlainRecord(
    supplied,
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_OPTIONS,
    'options',
    'chart series options must be a plain record'
  )
  const mode = hasOwn(supplied, 'mode')
    ? getOwnDataProperty(
        supplied,
        'mode',
        CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_OPTIONS,
        'options'
      )
    : CANONICAL_CHART_SERIES_MODES.PMF
  if (
    mode !== CANONICAL_CHART_SERIES_MODES.PMF
    && mode !== CANONICAL_CHART_SERIES_MODES.UPPER_TAIL
  ) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_MODE,
      'options.mode must be pmf or upper-tail',
      { mode }
    )
  }
  return mode
}

function makeReadySeries(plan, mode, values) {
  return Object.freeze({
    kind: 'canonical-chart-series',
    version: CANONICAL_CHART_SERIES_VERSION,
    status: 'ready',
    mode,
    displayWindow: copyWindow(plan.displayWindow),
    values,
  })
}

/**
 * Project an accepted display-range plan into a dense integer-coordinate
 * series. This is intentionally not a Chart.js data object: it allocates one
 * new Float64Array and copies the selected display probabilities into it;
 * that buffer is independent of the input display and does not allocate
 * labels or `{x, y}` point objects. The returned outer record is frozen, but
 * JavaScript typed arrays are not frozen; callers must treat `values` as a
 * read-only view after creation.
 *
 * `plan` must be the result of `planDisplayRange(display, ...)`. A plan with
 * `recalculate` or `resource-rejected` is returned as `not-ready`; it never
 * receives invented probabilities. A plan with `known-zero` is projected to
 * zero values using finite support as the proof of zero.
 */
export function createCanonicalChartSeries(display, plan, options = {}) {
  const mode = normalizeModeOptions(options)
  const normalizedPlan = normalizePlan(plan)

  if (normalizedPlan.status === 'resource-rejected') {
    return makeNotReady(
      normalizedPlan,
      mode,
      CANONICAL_CHART_SERIES_NOT_READY_REASONS.RESOURCE_REJECTED
    )
  }
  const normalizedDisplay = normalizeDisplay(display)
  if (normalizedPlan.decision === 'recalculate') {
    // A range plan can be marked for recalculation solely because an
    // upper-bound/exact overflow overlaps a fully covered window. Repeating
    // the same calculation cannot place position-unknown mass safely, so
    // preserve the typed not-projectable result for that case.
    if (normalizedPlan.coverage.missingSegments.length === 0) {
      assertPlanMatchesDisplay(normalizedPlan, normalizedDisplay)
      const overflowResult = assertOverflowDoesNotOverlapWindow(
        normalizedPlan,
        mode,
        normalizedDisplay.overflow,
        normalizedDisplay.projectionUncertainty
      )
      if (overflowResult !== null) {
        return overflowResult
      }
    }
    return makeNotReady(
      normalizedPlan,
      mode,
      CANONICAL_CHART_SERIES_NOT_READY_REASONS.RECALCULATE
    )
  }

  assertPlanMatchesDisplay(normalizedPlan, normalizedDisplay)
  const overflowResult = normalizedPlan.decision === 'known-zero'
    ? null
      : assertOverflowDoesNotOverlapWindow(
        normalizedPlan,
        mode,
        normalizedDisplay.overflow,
        normalizedDisplay.projectionUncertainty
      )
  if (overflowResult !== null) {
    return overflowResult
  }

  const values = new Float64Array(normalizedPlan.displayWindow.pointCount)
  if (normalizedPlan.decision === 'known-zero') {
    return makeReadySeries(normalizedPlan, mode, values)
  }

  if (mode === CANONICAL_CHART_SERIES_MODES.PMF) {
    fillPmf(values, normalizedDisplay, normalizedPlan)
  } else {
    fillUpperTail(values, normalizedDisplay, normalizedPlan)
  }
  return makeReadySeries(normalizedPlan, mode, values)
}

function normalizeSeries(series) {
  requirePlainRecord(
    series,
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_SERIES,
    'series',
    'series must be a canonical-chart-series record'
  )
  if (getOwnDataProperty(
    series,
    'kind',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_SERIES,
    'series'
  ) !== 'canonical-chart-series') {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_SERIES,
      'series.kind must be canonical-chart-series',
      { path: 'series.kind' }
    )
  }
  if (getOwnDataProperty(
    series,
    'version',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_SERIES,
    'series'
  ) !== CANONICAL_CHART_SERIES_VERSION) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_SERIES,
      'series.version is not supported',
      { path: 'series.version' }
    )
  }
  if (getOwnDataProperty(
    series,
    'status',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_SERIES,
    'series'
  ) !== 'ready') {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_SERIES,
      'only ready chart series can be materialized',
      { path: 'series.status' }
    )
  }
  const mode = getOwnDataProperty(
    series,
    'mode',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_SERIES,
    'series'
  )
  if (
    mode !== CANONICAL_CHART_SERIES_MODES.PMF
    && mode !== CANONICAL_CHART_SERIES_MODES.UPPER_TAIL
  ) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_SERIES,
      'series.mode is not supported',
      { mode }
    )
  }
  const displayWindow = normalizeSegment(
    getOwnDataProperty(
      series,
      'displayWindow',
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_SERIES,
      'series'
    ),
    'series.displayWindow'
  )
  const values = getOwnDataProperty(
    series,
    'values',
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_SERIES,
    'series'
  )
  if (!(values instanceof Float64Array)) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_SERIES,
      'series.values must be a Float64Array',
      { path: 'series.values' }
    )
  }
  if (values.length !== displayWindow.pointCount) {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_SERIES,
      'series displayWindow.pointCount and values.length disagree',
      {
        pointCount: displayWindow.pointCount,
        valuesLength: values.length,
      }
    )
  }
  return { mode, displayWindow, values }
}

function normalizeMaterializerOptions(options) {
  const supplied = options === undefined ? {} : options
  requirePlainRecord(
    supplied,
    CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_MATERIALIZER_OPTIONS,
    'options',
    'Chart.js materializer options must be a plain record'
  )
  const includeLabels = hasOwn(supplied, 'includeLabels')
    ? getOwnDataProperty(
        supplied,
        'includeLabels',
        CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_MATERIALIZER_OPTIONS,
        'options'
      )
    : true
  if (typeof includeLabels !== 'boolean') {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_MATERIALIZER_OPTIONS,
      'options.includeLabels must be boolean',
      { includeLabels }
    )
  }
  const label = hasOwn(supplied, 'label')
    ? getOwnDataProperty(
        supplied,
        'label',
        CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_MATERIALIZER_OPTIONS,
        'options'
      )
    : undefined
  if (label !== undefined && typeof label !== 'string') {
    fail(
      CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_MATERIALIZER_OPTIONS,
      'options.label must be a string when supplied',
      { label }
    )
  }
  const backgroundColor = hasOwn(supplied, 'backgroundColor')
    ? getOwnDataProperty(
        supplied,
        'backgroundColor',
        CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_MATERIALIZER_OPTIONS,
        'options'
      )
    : undefined
  const borderColor = hasOwn(supplied, 'borderColor')
    ? getOwnDataProperty(
        supplied,
        'borderColor',
        CANONICAL_CHART_SERIES_ERROR_CODES.INVALID_MATERIALIZER_OPTIONS,
        'options'
      )
    : undefined
  return { includeLabels, label, backgroundColor, borderColor }
}

/**
 * Materialize a ready canonical series at the Chart.js boundary.
 *
 * Chart.js 4.5's local implementation recognizes typed arrays as arrays and
 * its default primitive parser consumes numeric dataset values with a
 * CategoryScale label array. The materializer therefore keeps the owned
 * Float64Array as dataset data, enables parsing, and allocates numeric labels
 * only here. `dataset.data` intentionally references the same `series.values`
 * buffer as a read-only view to avoid a second copy; it is not an alias to the
 * input display probabilities. Chart.js is expected to read the numeric
 * entries without changing them, so callers must not mutate `series.values`
 * while the chart uses the materialized data. The canonical series itself
 * never contains those labels.
 */
export function materializeCanonicalChartJsData(series, options = {}) {
  const normalizedSeries = normalizeSeries(series)
  const materializerOptions = normalizeMaterializerOptions(options)
  const dataset = {
    data: normalizedSeries.values,
    parsing: true,
  }
  if (materializerOptions.label !== undefined) {
    dataset.label = materializerOptions.label
  }
  if (materializerOptions.backgroundColor !== undefined) {
    dataset.backgroundColor = materializerOptions.backgroundColor
  }
  if (materializerOptions.borderColor !== undefined) {
    dataset.borderColor = materializerOptions.borderColor
  }

  const result = { datasets: Object.freeze([Object.freeze(dataset)]) }
  if (materializerOptions.includeLabels) {
    const labels = Array.from(
      { length: normalizedSeries.displayWindow.pointCount },
      (_, index) => normalizedSeries.displayWindow.min + index
    )
    result.labels = Object.freeze(labels)
  }
  return Object.freeze(result)
}
