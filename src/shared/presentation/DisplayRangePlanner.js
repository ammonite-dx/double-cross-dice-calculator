import { DISPLAY_PROBABILITY_TOLERANCE } from './DistributionPresenter'

/** @typedef {import('./DistributionProjectionTypes').DisplayRangePlan} DisplayRangePlan */
/** @typedef {import('./DistributionProjectionTypes').DisplayWindowResourcePlan} DisplayWindowResourcePlan */
/** @typedef {import('./DistributionProjectionTypes').DistributionDisplay} DistributionDisplay */

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
// may replace every limit with a route-specific policy.
export const DEFAULT_DISPLAY_RANGE_PLANNER_POLICY = Object.freeze({
  pointCount: 16_384,
  float64Bytes: 64 * 1024 * 1024,
  chartPoints: 16_384,
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
  const allowedMetrics = new Set(['pointCount', 'float64Bytes', 'chartPoints'])
  for (const property of Reflect.ownKeys(value)) {
    if (typeof property !== 'string' || !allowedMetrics.has(property)) {
      fail(
        DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_POLICY,
        `${name}.${String(property)} is not a supported display policy key`,
        { path: `${name}.${String(property)}` }
      )
    }
  }
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

  const source = supplied

  return {
    ...DEFAULT_DISPLAY_RANGE_PLANNER_POLICY,
    ...normalizeLimitRecord(source, 'policy'),
  }
}

function getInvocationOptions(display, options) {
  if (options === undefined) {
    return {
      displayWindow: display.displayWindow,
      policy: undefined,
    }
  }

  if (!isPlainRecord(options)) {
    fail(
      DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_OPTIONS,
      'display range planner options must be a plain record',
      { path: 'options' }
    )
  }

  if (hasOwn(options, 'min') || hasOwn(options, 'max')) {
    fail(
      DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_OPTIONS,
      'options.displayWindow must contain the requested window',
      { path: 'options.displayWindow' }
    )
  }
  const displayWindow = hasOwn(options, 'displayWindow')
    ? getOwnDataProperty(
        options,
        'displayWindow',
        DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_OPTIONS,
        'options'
      )
    : display.displayWindow
  const policy = hasOwn(options, 'policy')
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

function classifyCoverage(display, displayWindow) {
  // The display has already crossed the validation/copy boundary in
  // `presentDistribution`. Keep this stage O(1) in explicit coverage: use the
  // trusted metadata and validate only the new window and resource policy.
  const { offset } = display.explicit
  const { explicitMax, support, overflow } = display
  const projectionUncertainty = display.projectionUncertainty ?? null
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
    const limit = policy[metric.name]
    if (!Number.isFinite(metric.value) || metric.value > limit) {
      warnings.push({
        code: metric.code,
        severity: 'reject',
        message: `${metric.name} exceeds the hard display resource limit`,
        value: metric.value,
        limit,
        unit: metric.unit,
      })
      accepted = false
    }
  }

  return {
    accepted,
    status: accepted ? 'accepted' : 'rejected',
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
 * Plan how a distribution display can satisfy a requested window.
 *
 * The function is intentionally UI-independent. It does not project
 * probabilities, allocate a window-sized array, invoke RangePlanner, or
 * acquire a ResourceGuard lease. A caller passes `{ displayWindow, policy }`,
 * or omits the options to use the display's retained window.
 *
 * @param {DistributionDisplay} display A trusted display payload from
 * `presentDistribution`.
 * @param {Object} [options]
 * @param {{ min: number, max: number }} [options.displayWindow]
 * @param {Object} [options.policy]
 * @returns {DisplayRangePlan} A frozen coverage and resource plan.
 */
export function planDisplayRange(display, options) {
  if (arguments.length > 2) {
    fail(
      DISPLAY_RANGE_PLANNER_ERROR_CODES.INVALID_OPTIONS,
      'planDisplayRange accepts only display and options arguments',
      { path: 'arguments' }
    )
  }
  const invocation = getInvocationOptions(display, options)
  const displayWindow = normalizeDisplayWindow(invocation.displayWindow)
  const policy = normalizePolicy(invocation.policy)
  const coverage = classifyCoverage(display, displayWindow)
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
        offset: display.explicit.offset,
        max: display.explicitMax,
      },
      support: display.support,
      overflow: display.overflow,
      ...(display.projectionUncertainty === undefined
        ? {}
        : {
            projectionUncertainty: display.projectionUncertainty,
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
 * This is used before a result exists (for example when the user
 * enters a window while the previous calculation is still unavailable). It
 * deliberately does not inspect or fabricate a distribution, and therefore
 * cannot make a coverage decision. Callers should treat the returned plan as
 * a resource preflight only and use `planDisplayRange` once a
 * display is available.
 *
 * @param {{ min: number, max: number }} displayWindow
 * @param {Object} [policy]
 * @returns {DisplayWindowResourcePlan}
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
