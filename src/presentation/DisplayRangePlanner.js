import {
  CANONICAL_DISTRIBUTION_DISPLAY_VERSION,
  DISPLAY_PROBABILITY_TOLERANCE,
} from './DistributionPresenter'

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER
const FLOAT64_BYTES_PER_POINT = Float64Array.BYTES_PER_ELEMENT

export const DISPLAY_RANGE_PLANNER_VERSION = 1

export const DISPLAY_RANGE_PLANNER_ERROR_CODES = Object.freeze({
  INVALID_DISPLAY: 'invalid-display',
  INVALID_DISPLAY_WINDOW: 'invalid-display-window',
  INVALID_OPTIONS: 'invalid-options',
  INVALID_POLICY: 'invalid-policy',
  RANGE_OVERFLOW: 'range-overflow',
  ESTIMATE_OVERFLOW: 'estimate-overflow',
})

// These are resource budgets, not display-input limits. In particular, the
// legacy 999/1000 boundary is intentionally not reused here. Applications
// may replace every threshold with a device- or route-specific policy.
export const DEFAULT_DISPLAY_RANGE_PLANNER_POLICY = Object.freeze({
  warning: Object.freeze({
    pointCount: 4_096,
    float64Bytes: 32 * 1024 * 1024,
    chartPoints: 4_096,
  }),
  hard: Object.freeze({
    pointCount: 16_384,
    float64Bytes: 64 * 1024 * 1024,
    chartPoints: 16_384,
  }),
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

export class DisplayRangePlannerError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'DisplayRangePlannerError'
    this.code = code
    this.details = freezeDetails(details)
    this.displayRangePlanner = true
  }
}

export class DisplayRangePlannerValidationError
  extends DisplayRangePlannerError {
  constructor(code, message, details = {}) {
    super(code, message, details)
    this.name = 'DisplayRangePlannerValidationError'
    this.validation = true
  }
}

export function isDisplayRangePlannerError(error) {
  return error?.displayRangePlanner === true
    && typeof error.code === 'string'
}

export function isDisplayRangePlannerValidationError(error) {
  return isDisplayRangePlannerError(error) && error.validation === true
}

function fail(code, message, details = {}) {
  throw new DisplayRangePlannerValidationError(code, message, details)
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

function requireNonNegativeSafeInteger(value, code, message, path) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(code, message, { path, value })
  }
  return value
}

function requireFiniteNonNegativeNumber(value, code, message, path) {
  if (!Number.isFinite(value) || value < 0) {
    fail(code, message, { path, value })
  }
  return value
}

function requireProbability(value, path) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    fail(
      DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
      `${path} must be a finite probability between 0 and 1`,
      { path, value }
    )
  }
  return value
}

// `presentCanonicalDistribution` validates every coefficient before exposing
// this versioned display contract. Planning a new window must therefore stay
// O(1) in explicit.length: verify only the container kind, its length, and
// the derived endpoint. Do not inspect coefficient values or array density.
function validateExplicitProbabilityContainer(values) {
  const isArray = Array.isArray(values)
  const isFloat64Array = values instanceof Float64Array
  if (!isArray && !isFloat64Array) {
    fail(
      DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
      'display.explicit.probabilities must be an Array or Float64Array',
      { path: 'display.explicit.probabilities' }
    )
  }

  const valuesLength = values.length
  if (!Number.isSafeInteger(valuesLength) || valuesLength < 0) {
    fail(
      DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
      'display.explicit.probabilities.length must be a safe non-negative integer',
      { path: 'display.explicit.probabilities.length', value: valuesLength }
    )
  }
  return valuesLength
}

function copySupport(support) {
  const kind = getOwnDataProperty(
    support,
    'kind',
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display.support'
  )
  if (kind === 'finite') {
    const max = getOwnDataProperty(
      support,
      'max',
      DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
      'display.support'
    )
    requireNonNegativeSafeInteger(
      max,
      DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
      'display.support.max must be a non-negative safe integer',
      'display.support.max'
    )
    return { kind, max }
  }
  if (kind === 'infinite') {
    if (hasOwn(support, 'max')) {
      fail(
        DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
        'infinite display.support must not contain max',
        { path: 'display.support.max' }
      )
    }
    return { kind }
  }
  fail(
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display.support.kind must be finite or infinite',
    { path: 'display.support.kind', kind }
  )
}

function copyOverflow(overflow) {
  if (overflow === null) {
    return null
  }
  requirePlainRecord(
    overflow,
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display.overflow',
    'display.overflow must be null or a plain record'
  )
  const kind = getOwnDataProperty(
    overflow,
    'kind',
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display.overflow'
  )
  const lowerBound = getOwnDataProperty(
    overflow,
    'lowerBound',
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display.overflow'
  )
  const errorBound = getOwnDataProperty(
    overflow,
    'errorBound',
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display.overflow'
  )
  requireNonNegativeSafeInteger(
    lowerBound,
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display.overflow.lowerBound must be a non-negative safe integer',
    'display.overflow.lowerBound'
  )
  requireFiniteNonNegativeNumber(
    errorBound,
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display.overflow.errorBound must be a finite non-negative number',
    'display.overflow.errorBound'
  )

  if (kind === 'exact') {
    const probability = getOwnDataProperty(
      overflow,
      'probability',
      DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
      'display.overflow'
    )
    requireProbability(probability, 'display.overflow.probability')
    return { kind, lowerBound, probability, errorBound }
  }
  if (kind === 'upper-bound') {
    const probabilityUpperBound = getOwnDataProperty(
      overflow,
      'probabilityUpperBound',
      DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
      'display.overflow'
    )
    requireProbability(
      probabilityUpperBound,
      'display.overflow.probabilityUpperBound'
    )
    return { kind, lowerBound, probabilityUpperBound, errorBound }
  }
  fail(
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display.overflow.kind must be exact or upper-bound',
    { path: 'display.overflow.kind', kind }
  )
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

function copyProjectionUncertainty(display) {
  if (!hasOwn(display, 'projectionUncertainty')) {
    return null
  }

  const value = getOwnDataProperty(
    display,
    'projectionUncertainty',
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display'
  )
  requirePlainRecord(
    value,
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display.projectionUncertainty',
    'display.projectionUncertainty must be a plain record'
  )
  const positionUnknownProbabilityUpperBound = getOwnDataProperty(
    value,
    'positionUnknownProbabilityUpperBound',
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display.projectionUncertainty'
  )
  if (
    !Number.isFinite(positionUnknownProbabilityUpperBound)
    || positionUnknownProbabilityUpperBound < 0
    || positionUnknownProbabilityUpperBound > 1
  ) {
    fail(
      DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
      'display.projectionUncertainty.positionUnknownProbabilityUpperBound must be between 0 and 1',
      { path: 'display.projectionUncertainty.positionUnknownProbabilityUpperBound' }
    )
  }

  const copied = { positionUnknownProbabilityUpperBound }
  if (hasOwn(value, 'outputOverflowLowerBound')) {
    const outputOverflowLowerBound = getOwnDataProperty(
      value,
      'outputOverflowLowerBound',
      DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
      'display.projectionUncertainty'
    )
    if (
      outputOverflowLowerBound !== null
      && (!Number.isSafeInteger(outputOverflowLowerBound)
        || outputOverflowLowerBound < 0)
    ) {
      fail(
        DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
        'display.projectionUncertainty.outputOverflowLowerBound must be null or a non-negative safe integer',
        { path: 'display.projectionUncertainty.outputOverflowLowerBound' }
      )
    }
    copied.outputOverflowLowerBound = outputOverflowLowerBound
  }
  return copied
}

function normalizeDisplay(display) {
  requirePlainRecord(
    display,
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display',
    'display must be a plain canonical distribution display record'
  )

  const displayKind = getOwnDataProperty(
    display,
    'kind',
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display'
  )
  if (displayKind !== 'canonical-distribution-display') {
    fail(
      DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
      'display.kind must be canonical-distribution-display',
      { path: 'display.kind', kind: displayKind }
    )
  }

  const displayVersion = getOwnDataProperty(
    display,
    'version',
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display'
  )
  if (displayVersion !== CANONICAL_DISTRIBUTION_DISPLAY_VERSION) {
    fail(
      DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
      `display.version must be ${CANONICAL_DISTRIBUTION_DISPLAY_VERSION}`,
      {
        path: 'display.version',
        version: displayVersion,
        expected: CANONICAL_DISTRIBUTION_DISPLAY_VERSION,
      }
    )
  }

  const explicit = getOwnDataProperty(
    display,
    'explicit',
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display'
  )
  requirePlainRecord(
    explicit,
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display.explicit',
    'display.explicit must be a plain record'
  )
  const offset = getOwnDataProperty(
    explicit,
    'offset',
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display.explicit'
  )
  requireNonNegativeSafeInteger(
    offset,
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display.explicit.offset must be a non-negative safe integer',
    'display.explicit.offset'
  )
  const values = getOwnDataProperty(
    explicit,
    'probabilities',
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display.explicit'
  )
  const valuesLength = validateExplicitProbabilityContainer(values)
  if (valuesLength > MAX_SAFE_INTEGER - offset) {
    fail(
      DISPLAY_RANGE_PLANNER_ERROR_CODES.RANGE_OVERFLOW,
      'display explicit coverage index would exceed the safe integer range',
      { offset, valuesLength }
    )
  }
  const derivedExplicitMax = valuesLength === 0
    ? null
    : offset + valuesLength - 1

  const explicitMax = getOwnDataProperty(
    display,
    'explicitMax',
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display'
  )
  if (
    explicitMax !== null
    && (!Number.isSafeInteger(explicitMax) || explicitMax < 0)
  ) {
    fail(
      DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
      'display.explicitMax must be null or a non-negative safe integer',
      { path: 'display.explicitMax', explicitMax }
    )
  }
  if (explicitMax !== derivedExplicitMax) {
    fail(
      DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
      'display.explicitMax must match explicit.offset and probabilities.length',
      { explicitMax, derivedExplicitMax }
    )
  }

  const supportInput = getOwnDataProperty(
    display,
    'support',
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display'
  )
  requirePlainRecord(
    supportInput,
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display.support',
    'display.support must be a plain record'
  )
  const support = copySupport(supportInput)
  if (support.kind === 'finite' && explicitMax !== null) {
    if (support.max < explicitMax) {
      fail(
        DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
        'display.support.max must not be below display.explicitMax',
        { supportMax: support.max, explicitMax }
      )
    }
  }

  const overflow = copyOverflow(getOwnDataProperty(
    display,
    'overflow',
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
    'display'
  ))
  if (
    support.kind === 'finite'
    && hasPotentialOverflowMass(overflow)
    && support.max < overflow.lowerBound
  ) {
    fail(
      DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY,
      'display.support.max must contain the potential overflow lower bound',
      { supportMax: support.max, lowerBound: overflow.lowerBound }
    )
  }

  return {
    offset,
    explicitMax,
    support,
    overflow,
    projectionUncertainty: copyProjectionUncertainty(display),
  }
}

function normalizeDisplayWindow(windowInput) {
  requirePlainRecord(
    windowInput,
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY_WINDOW,
    'displayWindow',
    'displayWindow must be a plain record'
  )
  const min = getOwnDataProperty(
    windowInput,
    'min',
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY_WINDOW,
    'displayWindow'
  )
  const max = getOwnDataProperty(
    windowInput,
    'max',
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY_WINDOW,
    'displayWindow'
  )
  requireNonNegativeSafeInteger(
    min,
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY_WINDOW,
    'displayWindow.min must be a non-negative safe integer',
    'displayWindow.min'
  )
  requireNonNegativeSafeInteger(
    max,
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY_WINDOW,
    'displayWindow.max must be a non-negative safe integer',
    'displayWindow.max'
  )
  if (max < min) {
    fail(
      DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY_WINDOW,
      'displayWindow.max must be greater than or equal to displayWindow.min',
      { min, max }
    )
  }

  const difference = max - min
  if (difference >= MAX_SAFE_INTEGER) {
    fail(
      DISPLAY_RANGE_PLANNER_ERROR_CODES.RANGE_OVERFLOW,
      'displayWindow.max - min + 1 must be a safe integer',
      { min, max, difference }
    )
  }
  const pointCount = difference + 1
  if (pointCount > Math.floor(MAX_SAFE_INTEGER / FLOAT64_BYTES_PER_POINT)) {
    fail(
      DISPLAY_RANGE_PLANNER_ERROR_CODES.ESTIMATE_OVERFLOW,
      'displayWindow Float64Array memory estimate must be a safe integer',
      { min, max, pointCount, bytesPerPoint: FLOAT64_BYTES_PER_POINT }
    )
  }
  const float64Bytes = pointCount * FLOAT64_BYTES_PER_POINT
  if (!Number.isSafeInteger(float64Bytes)) {
    fail(
      DISPLAY_RANGE_PLANNER_ERROR_CODES.ESTIMATE_OVERFLOW,
      'displayWindow Float64Array memory estimate must be a safe integer',
      { min, max, pointCount, float64Bytes }
    )
  }

  return {
    min,
    max,
    pointCount,
    float64Bytes,
    chartPoints: pointCount,
  }
}

function normalizeLimitRecord(value, name) {
  if (value === undefined) {
    return {}
  }
  requirePlainRecord(
    value,
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_POLICY,
    name,
    `${name} must be a plain record`
  )
  const normalized = {}
  for (const metric of ['pointCount', 'float64Bytes', 'chartPoints']) {
    if (!hasOwn(value, metric)) {
      continue
    }
    const threshold = getOwnDataProperty(
      value,
      metric,
      DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_POLICY,
      name
    )
    if (!Number.isSafeInteger(threshold) || threshold < 0) {
      fail(
        DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_POLICY,
        `${name}.${metric} must be a non-negative safe integer`,
        { path: `${name}.${metric}`, value: threshold }
      )
    }
    normalized[metric] = threshold
  }
  return normalized
}

function normalizePolicy(policy) {
  const supplied = policy === undefined ? {} : policy
  requirePlainRecord(
    supplied,
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_POLICY,
    'policy',
    'display range planner policy must be a plain record'
  )

  // `limits` is accepted as a descriptive alias so the policy can be passed
  // beside RangePlanner policies without changing the canonical metric names.
  const source = hasOwn(supplied, 'limits')
    ? getOwnDataProperty(
        supplied,
        'limits',
        DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_POLICY,
        'policy'
      )
    : supplied
  requirePlainRecord(
    source,
    DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_POLICY,
    'policy.limits',
    'policy.limits must be a plain record'
  )

  const warningInput = hasOwn(source, 'warning')
    ? getOwnDataProperty(
        source,
        'warning',
        DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_POLICY,
        'policy.limits'
      )
    : undefined
  const hardInput = hasOwn(source, 'hard')
    ? getOwnDataProperty(
        source,
        'hard',
        DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_POLICY,
        'policy.limits'
      )
    : undefined
  const warning = {
    ...DEFAULT_DISPLAY_RANGE_PLANNER_POLICY.warning,
    ...normalizeLimitRecord(warningInput, 'policy.warning'),
  }
  const hard = {
    ...DEFAULT_DISPLAY_RANGE_PLANNER_POLICY.hard,
    ...normalizeLimitRecord(hardInput, 'policy.hard'),
  }

  for (const metric of ['pointCount', 'float64Bytes', 'chartPoints']) {
    if (warning[metric] > hard[metric]) {
      fail(
        DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_POLICY,
        `policy.warning.${metric} must not exceed policy.hard.${metric}`,
        {
          warning: warning[metric],
          hard: hard[metric],
          metric,
        }
      )
    }
  }

  return { warning, hard }
}

function getInvocationOptions(display, options, policyOverride) {
  if (options === undefined) {
    return {
      displayWindow: hasOwn(display, 'displayWindow')
        ? getOwnDataProperty(
            display,
            'displayWindow',
            DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY_WINDOW,
            'display'
          )
        : undefined,
      policy: policyOverride,
    }
  }

  if (!isPlainRecord(options)) {
    fail(
      DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_OPTIONS,
      'display range planner options must be a plain record',
      { path: 'options' }
    )
  }

  const isDirectWindow = hasOwn(options, 'min') || hasOwn(options, 'max')
  const displayWindow = hasOwn(options, 'displayWindow')
    ? getOwnDataProperty(
        options,
        'displayWindow',
        DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_OPTIONS,
        'options'
      )
    : isDirectWindow
      ? options
      : hasOwn(display, 'displayWindow')
        ? getOwnDataProperty(
            display,
            'displayWindow',
            DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_DISPLAY_WINDOW,
            'display'
          )
        : undefined
  const policy = policyOverride !== undefined
    ? policyOverride
    : hasOwn(options, 'policy')
      ? getOwnDataProperty(
          options,
          'policy',
          DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_OPTIONS,
          'options'
        )
      : undefined
  return { displayWindow, policy }
}

function makeSegment(min, max) {
  if (min > max) {
    return null
  }
  return {
    min,
    max,
    pointCount: max - min + 1,
  }
}

function classifyCoverage(
  { offset, explicitMax, support, overflow, projectionUncertainty },
  displayWindow
) {
  const { min, max } = displayWindow
  const finiteSupport = support.kind === 'finite'
  const entirelyAboveFiniteSupport = finiteSupport && min > support.max
  const hasOverflow = hasPotentialOverflowMass(overflow)
  const positionUnknownProbabilityUpperBound =
    projectionUncertainty?.positionUnknownProbabilityUpperBound
  const positionUnknownExceedsTolerance =
    positionUnknownProbabilityUpperBound !== undefined
      && positionUnknownProbabilityUpperBound > DISPLAY_PROBABILITY_TOLERANCE
  const hasOutputOverflowLowerBound = projectionUncertainty !== null
    && Object.prototype.hasOwnProperty.call(
      projectionUncertainty,
      'outputOverflowLowerBound'
    )
  const outputOverflowLowerBound = hasOutputOverflowLowerBound
    ? projectionUncertainty.outputOverflowLowerBound
    : null
  const overflowLowerBound = projectionUncertainty === null
    ? overflow?.lowerBound
    : outputOverflowLowerBound
  const overflowOverlapsWindow = !entirelyAboveFiniteSupport
    && hasOverflow
    && (
      positionUnknownExceedsTolerance
      || (
        overflowLowerBound !== null
        && overflowLowerBound !== undefined
        && overflowLowerBound <= max
      )
    )

  let lowerMissing = null
  let upperMissing = null
  if (!entirelyAboveFiniteSupport) {
    if (min < offset) {
      lowerMissing = makeSegment(min, Math.min(max, offset - 1))
    }

    const coverageMax = explicitMax === null ? offset - 1 : explicitMax
    if (max > coverageMax) {
      const missingStart = Math.max(
        min,
        explicitMax === null ? offset : explicitMax + 1
      )
      const missingEnd = finiteSupport
        ? Math.min(max, support.max)
        : max
      upperMissing = makeSegment(missingStart, missingEnd)
    }
  }

  const missingSegments = [lowerMissing, upperMissing]
    .filter((segment) => segment !== null)
  const decision = entirelyAboveFiniteSupport
    ? 'known-zero'
    : missingSegments.length > 0 || overflowOverlapsWindow
      ? 'recalculate'
      : 'reuse'

  const knownZeroRight = finiteSupport && max > support.max
    ? makeSegment(Math.max(min, support.max + 1), max)
    : null
  const knownZero = knownZeroRight === null
    ? {
        kind: 'none',
        pointCount: 0,
        right: null,
      }
    : {
        kind: 'finite-support-outside',
        pointCount: knownZeroRight.pointCount,
        right: knownZeroRight,
      }

  const reason = decision === 'known-zero'
    ? 'finite-support-outside'
    : decision === 'reuse'
      ? knownZeroRight === null
        ? 'explicit-coverage'
        : 'explicit-coverage-with-known-zero'
      : missingSegments.length === 2
        ? 'lower-and-upper-coverage'
        : lowerMissing !== null
          ? 'lower-coverage'
          : 'support-coverage'

  return {
    decision,
    reason,
    missingSegments,
    knownZero,
  }
}

function classifyResources(estimates, policy) {
  const warnings = []
  let accepted = true
  const metrics = [
    // These currently have the same worst-case value because one requested
    // coordinate maps to one prospective chart point. They remain separate
    // budgets: array length and renderer load can acquire different limits.
    {
      name: 'pointCount',
      code: 'display-point-count',
      value: estimates.pointCount,
      unit: 'points',
    },
    {
      name: 'float64Bytes',
      code: 'display-float64-memory',
      value: estimates.float64Bytes,
      unit: 'bytes',
    },
    {
      name: 'chartPoints',
      code: 'chart-point-count',
      value: estimates.chartPoints,
      unit: 'points',
    },
  ]

  for (const metric of metrics) {
    const warningLimit = policy.warning[metric.name]
    const hardLimit = policy.hard[metric.name]
    if (metric.value > hardLimit) {
      warnings.push({
        code: metric.code,
        severity: 'reject',
        message: `${metric.name} exceeds the hard display resource limit`,
        value: metric.value,
        limit: hardLimit,
        unit: metric.unit,
      })
      accepted = false
    } else if (metric.value > warningLimit) {
      warnings.push({
        code: metric.code,
        severity: 'warning',
        message: `${metric.name} exceeds the warning display resource limit`,
        value: metric.value,
        limit: warningLimit,
        unit: metric.unit,
      })
    }
  }

  return {
    accepted,
    status: accepted
      ? warnings.length > 0 ? 'warning' : 'accepted'
      : 'rejected',
    warnings,
    rejectionReasons: warnings
      .filter((warning) => warning.severity === 'reject')
      .map((warning) => warning.code),
  }
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

/**
 * Plan how a canonical distribution display can satisfy a requested window.
 *
 * The function is intentionally UI-independent. It does not project
 * probabilities, allocate a window-sized array, invoke RangePlanner, or
 * acquire a ResourceGuard lease. A caller may pass a window as
 * `{ displayWindow, policy }`, as `{ min, max, policy }`, or use the
 * `displayWindow` retained by `presentCanonicalDistribution`.
 *
 * @param {Object} display A canonical-distribution-display payload.
 * @param {Object} [options]
 * @param {{ min: number, max: number }} [options.displayWindow]
 * @param {Object} [options.policy]
 * @param {Object} [policyOverride] Optional third-argument policy overload.
 * @returns {Object} A frozen coverage and resource plan.
 */
export function planDisplayRange(display, options, policyOverride) {
  const normalizedDisplay = normalizeDisplay(display)
  const invocation = getInvocationOptions(display, options, policyOverride)
  const displayWindow = normalizeDisplayWindow(invocation.displayWindow)
  const policy = normalizePolicy(invocation.policy)
  const coverage = classifyCoverage(normalizedDisplay, displayWindow)
  const estimates = {
    pointCount: displayWindow.pointCount,
    float64Bytes: displayWindow.float64Bytes,
    chartPoints: displayWindow.chartPoints,
  }
  const resource = classifyResources(estimates, policy)
  const warnings = resource.warnings
  const rejectionReasons = resource.rejectionReasons

  return deepFreeze({
    version: DISPLAY_RANGE_PLANNER_VERSION,
    kind: 'display-range-plan',
    status: resource.accepted ? 'ready' : 'resource-rejected',
    accepted: resource.accepted,
    decision: coverage.decision,
    reason: coverage.reason,
    displayWindow: {
      min: displayWindow.min,
      max: displayWindow.max,
      pointCount: displayWindow.pointCount,
    },
    coverage: {
      explicit: {
        offset: normalizedDisplay.offset,
        max: normalizedDisplay.explicitMax,
      },
      support: { ...normalizedDisplay.support },
      overflow: normalizedDisplay.overflow === null
        ? null
        : { ...normalizedDisplay.overflow },
      ...(normalizedDisplay.projectionUncertainty === null
        ? {}
        : {
            projectionUncertainty: {
              ...normalizedDisplay.projectionUncertainty,
            },
          }),
      missingSegments: coverage.missingSegments,
      knownZero: coverage.knownZero,
    },
    estimates,
    warnings,
    rejectionReasons,
  })
}

/**
 * Plan only the resource cost of a display window.
 *
 * This is used before a canonical result exists (for example when the user
 * enters a window while the previous calculation is still unavailable). It
 * deliberately does not inspect or fabricate a distribution, and therefore
 * cannot make a coverage decision. Callers should treat the returned plan as
 * a resource preflight only and use `planDisplayRange` once a canonical
 * display is available.
 */
export function planDisplayWindowResources(displayWindow, policy) {
  const normalizedWindow = normalizeDisplayWindow(displayWindow)
  const normalizedPolicy = normalizePolicy(policy)
  const estimates = {
    pointCount: normalizedWindow.pointCount,
    float64Bytes: normalizedWindow.float64Bytes,
    chartPoints: normalizedWindow.chartPoints,
  }
  const resource = classifyResources(estimates, normalizedPolicy)

  return deepFreeze({
    version: DISPLAY_RANGE_PLANNER_VERSION,
    kind: 'display-window-resource-plan',
    status: resource.accepted ? 'ready' : 'resource-rejected',
    accepted: resource.accepted,
    decision: 'recalculate',
    reason: 'resource-preflight',
    displayWindow: {
      min: normalizedWindow.min,
      max: normalizedWindow.max,
      pointCount: normalizedWindow.pointCount,
    },
    estimates,
    warnings: resource.warnings,
    rejectionReasons: resource.rejectionReasons,
  })
}

/**
 * Create a small policy-bound planner facade for callers that plan multiple
 * windows against the same resource budget.
 */
export function createDisplayRangePlanner(policy = {}) {
  const normalizedPolicy = normalizePolicy(policy)
  return Object.freeze({
    policy: deepFreeze({
      warning: { ...normalizedPolicy.warning },
      hard: { ...normalizedPolicy.hard },
    }),
    plan(display, options) {
      if (options === undefined) {
        return planDisplayRange(display, {
          policy: normalizedPolicy,
        })
      }
      if (!isPlainRecord(options)) {
        fail(
          DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_OPTIONS,
          'display range planner options must be a plain record',
          { path: 'options' }
        )
      }
      return planDisplayRange(display, {
        ...options,
        policy: normalizedPolicy,
      })
    },
  })
}
