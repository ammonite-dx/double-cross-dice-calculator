import {
  getExpectedValueSummary,
  getProbabilityMassSummary,
  isDistributionResultError,
} from '../../../calculation/DistributionResult'
import {
  CANONICAL_CHART_SERIES_MODES,
  CANONICAL_CHART_SERIES_NOT_PROJECTABLE_REASONS,
  CANONICAL_CHART_SERIES_NOT_READY_REASONS,
  createCanonicalChartSeries,
  isCanonicalChartSeriesError,
  materializeCanonicalChartJsData,
  isDisplayRangePlannerError,
  isDistributionPresentationError,
  planDisplayRange,
  presentCanonicalDistribution,
  toChartPercentage,
} from '../../../presentation'
import { getChartColor } from '../../../data/ColorSetter'

export const CHECK_CANONICAL_PRESENTATION_VERSION = 1

export const CHECK_CANONICAL_PRESENTATION_MODES = Object.freeze({
  PMF: CANONICAL_CHART_SERIES_MODES.PMF,
  UPPER_TAIL: CANONICAL_CHART_SERIES_MODES.UPPER_TAIL,
})

// `status` remains the low-level ready/not-ready compatibility state used by
// the existing chart boundary. `decision` is the Check-specific interpretation
// consumed by the view: exact score overflow can be recalculated, while an
// upper-bound overflow remains terminally not-projectable.
export const CHECK_CANONICAL_PRESENTATION_DECISIONS = Object.freeze({
  REUSE: 'reuse',
  KNOWN_ZERO: 'known-zero',
  RECALCULATE: 'recalculate',
  RESOURCE_REJECTED: 'resource-rejected',
  NOT_PROJECTABLE: 'not-projectable',
})

export const CHECK_CANONICAL_PRESENTATION_ERROR_CODES = Object.freeze({
  INVALID_RESULT: 'invalid-result',
  INVALID_SCORE: 'invalid-score',
  INVALID_OPTIONS: 'invalid-options',
  INVALID_MODE: 'invalid-mode',
  INVALID_OPPOSED: 'invalid-opposed',
  UNEXPECTED_ERROR: 'unexpected-error',
})

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

export class CheckCanonicalPresentationError extends Error {
  constructor(code, message, details = {}, cause) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'CheckCanonicalPresentationError'
    this.code = code
    this.details = freezeDetails(details)
    this.checkCanonicalPresentation = true
    if (cause !== undefined && this.cause === undefined) {
      this.cause = cause
    }
  }
}

export class CheckCanonicalPresentationValidationError
  extends CheckCanonicalPresentationError {
  constructor(code, message, details = {}, cause) {
    super(code, message, details, cause)
    this.name = 'CheckCanonicalPresentationValidationError'
    this.validation = true
  }
}

export function isCheckCanonicalPresentationError(error) {
  return error?.checkCanonicalPresentation === true
    && typeof error.code === 'string'
}

export function isCheckCanonicalPresentationValidationError(error) {
  return isCheckCanonicalPresentationError(error) && error.validation === true
}

function fail(code, message, details = {}) {
  throw new CheckCanonicalPresentationValidationError(code, message, details)
}

function requirePlainRecord(value, code, path, message) {
  if (!isPlainRecord(value)) {
    fail(code, message ?? `${path} must be a plain record`, { path })
  }
  return value
}

function readOwnDataProperty(
  value,
  property,
  code,
  path,
  { required = true } = {}
) {
  let descriptor
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, property)
  } catch (cause) {
    throw new CheckCanonicalPresentationValidationError(
      code,
      `${path}.${property} could not be inspected safely`,
      { path: `${path}.${property}`, property },
      cause
    )
  }

  if (descriptor === undefined) {
    if (required) {
      fail(
        code,
        `${path}.${property} must be an own data property`,
        { path: `${path}.${property}`, property }
      )
    }
    return undefined
  }

  if (
    !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    || descriptor.enumerable !== true
  ) {
    fail(
      code,
      `${path}.${property} must be an enumerable data property`,
      { path: `${path}.${property}`, property }
    )
  }
  return descriptor.value
}

function normalizeOptions(options) {
  requirePlainRecord(
    options,
    CHECK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_OPTIONS,
    'options',
    'Check canonical presentation options must be a plain record'
  )

  const displayWindow = readOwnDataProperty(
    options,
    'displayWindow',
    CHECK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_OPTIONS,
    'options'
  )

  const optionMode = readOwnDataProperty(
    options,
    'mode',
    CHECK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_OPTIONS,
    'options',
    { required: false }
  )
  const optionOpposed = readOwnDataProperty(
    options,
    'opposed',
    CHECK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_OPTIONS,
    'options',
    { required: false }
  )
  const optionPolicy = readOwnDataProperty(
    options,
    'policy',
    CHECK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_OPTIONS,
    'options',
    { required: false }
  )

  const mode = optionMode ?? CHECK_CANONICAL_PRESENTATION_MODES.PMF
  if (
    mode !== CHECK_CANONICAL_PRESENTATION_MODES.PMF
    && mode !== CHECK_CANONICAL_PRESENTATION_MODES.UPPER_TAIL
  ) {
    fail(
      CHECK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_MODE,
      'options.mode must be pmf or upper-tail',
      { mode }
    )
  }

  const opposed = optionOpposed ?? true
  if (typeof opposed !== 'boolean') {
    fail(
      CHECK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_OPPOSED,
      'options.opposed must be boolean',
      { opposed }
    )
  }

  return {
    displayWindow,
    mode,
    opposed,
    policy: optionPolicy,
  }
}

function normalizeCheckResult(checkResult, opposed) {
  requirePlainRecord(
    checkResult,
    CHECK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_RESULT,
    'checkResult',
    'calculateCheckCanonical result must be a plain record'
  )
  const score = readOwnDataProperty(
    checkResult,
    'score',
    CHECK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_RESULT,
    'checkResult'
  )
  requirePlainRecord(
    score,
    CHECK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_SCORE,
    'checkResult.score',
    'checkResult.score must be a plain record'
  )

  const action = readOwnDataProperty(
    score,
    'action',
    CHECK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_SCORE,
    'checkResult.score'
  )
  const reaction = opposed
    ? readOwnDataProperty(
        score,
        'reaction',
        CHECK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_SCORE,
        'checkResult.score'
      )
    : undefined

  return { action, reaction }
}

function createScorePresentation(envelope, displayWindow, mode, policy) {
  const summary = {
    mass: getProbabilityMassSummary(envelope.result),
    expectedValue: getExpectedValueSummary(envelope.result),
  }
  const display = presentCanonicalDistribution(envelope, {
    summary,
    displayWindow,
  })
  const plannerOptions = { displayWindow }
  if (policy !== undefined) {
    plannerOptions.policy = policy
  }
  const plan = planDisplayRange(display, plannerOptions)
  const series = createCanonicalChartSeries(display, plan, { mode })

  return Object.freeze({ display, plan, series })
}

function getPresentationStatus(sides) {
  if (sides.some(({ series }) => series.status === 'not-projectable')) {
    return 'not-projectable'
  }
  if (sides.some(({ series }) => series.status === 'not-ready')) {
    return 'not-ready'
  }
  return 'ready'
}

function hasPotentialUpperBoundOverflow(overflow) {
  return overflow?.kind === 'upper-bound'
    && (overflow.errorBound > 0 || overflow.probabilityUpperBound > 0)
}

function hasTerminalUpperBoundEvidence(side) {
  if (
    side.plan.status === 'resource-rejected'
    || side.plan.decision === 'known-zero'
  ) {
    return false
  }
  const overflow = side.plan.coverage.overflow
  if (!hasPotentialUpperBoundOverflow(overflow)) {
    return false
  }
  return side.series.mode === CHECK_CANONICAL_PRESENTATION_MODES.UPPER_TAIL
    || overflow.lowerBound <= side.plan.displayWindow.max
}

function getSideDecision(side) {
  if (side.plan.status === 'resource-rejected') {
    return CHECK_CANONICAL_PRESENTATION_DECISIONS.RESOURCE_REJECTED
  }
  if (hasTerminalUpperBoundEvidence(side)) {
    return CHECK_CANONICAL_PRESENTATION_DECISIONS.NOT_PROJECTABLE
  }
  if (side.series.status === 'not-projectable') {
    if (
      side.series.reason
      === CANONICAL_CHART_SERIES_NOT_PROJECTABLE_REASONS.EXACT_OVERFLOW_OVERLAP
    ) {
      return CHECK_CANONICAL_PRESENTATION_DECISIONS.RECALCULATE
    }
    return CHECK_CANONICAL_PRESENTATION_DECISIONS.NOT_PROJECTABLE
  }
  if (
    side.series.status === 'not-ready'
    && side.series.reason
      === CANONICAL_CHART_SERIES_NOT_READY_REASONS.RECALCULATE
  ) {
    return CHECK_CANONICAL_PRESENTATION_DECISIONS.RECALCULATE
  }
  if (side.plan.decision === 'known-zero') {
    return CHECK_CANONICAL_PRESENTATION_DECISIONS.KNOWN_ZERO
  }
  return CHECK_CANONICAL_PRESENTATION_DECISIONS.REUSE
}

function getSideReason(side) {
  if (hasTerminalUpperBoundEvidence(side)) {
    return CANONICAL_CHART_SERIES_NOT_PROJECTABLE_REASONS.UPPER_BOUND_OVERFLOW
  }
  return side.series.reason ?? null
}

function getPresentationDecision(sides) {
  const decisions = sides.map(getSideDecision)
  if (decisions.includes(CHECK_CANONICAL_PRESENTATION_DECISIONS.NOT_PROJECTABLE)) {
    return CHECK_CANONICAL_PRESENTATION_DECISIONS.NOT_PROJECTABLE
  }
  if (decisions.includes(CHECK_CANONICAL_PRESENTATION_DECISIONS.RESOURCE_REJECTED)) {
    return CHECK_CANONICAL_PRESENTATION_DECISIONS.RESOURCE_REJECTED
  }
  if (decisions.includes(CHECK_CANONICAL_PRESENTATION_DECISIONS.RECALCULATE)) {
    return CHECK_CANONICAL_PRESENTATION_DECISIONS.RECALCULATE
  }
  if (decisions.every((decision) =>
    decision === CHECK_CANONICAL_PRESENTATION_DECISIONS.KNOWN_ZERO
  )) {
    return CHECK_CANONICAL_PRESENTATION_DECISIONS.KNOWN_ZERO
  }
  return CHECK_CANONICAL_PRESENTATION_DECISIONS.REUSE
}

function createSideState(side) {
  const state = {
    plan: side.plan,
    status: side.series.status,
    reason: getSideReason(side),
    decision: getSideDecision(side),
  }
  return Object.freeze(state)
}

function toPercentageSeries(series) {
  const values = new Float64Array(series.values.length)
  for (let index = 0; index < series.values.length; index += 1) {
    // The legacy Check chart displays probability as a percentage rounded to
    // one decimal place. Keep this conversion at the Chart.js compatibility
    // boundary; the canonical display and series remain probabilities.
    values[index] = toChartPercentage(series.values[index])
  }

  return {
    kind: series.kind,
    version: series.version,
    status: series.status,
    mode: series.mode,
    displayWindow: series.displayWindow,
    values,
  }
}

function materializeSideChart(side, label, color, includeLabels) {
  return materializeCanonicalChartJsData(
    toPercentageSeries(side.series),
    {
      includeLabels,
      label,
      backgroundColor: color,
      borderColor: color,
    }
  )
}

function createChartData(action, reaction, opposed) {
  const actionChart = materializeSideChart(
    action,
    'アクション側',
    getChartColor(0),
    true
  )
  if (!opposed) {
    return actionChart
  }

  const reactionChart = materializeSideChart(
    reaction,
    'リアクション側',
    getChartColor(1),
    false
  )
  return Object.freeze({
    labels: actionChart.labels,
    datasets: Object.freeze([
      actionChart.datasets[0],
      reactionChart.datasets[0],
    ]),
  })
}

function isKnownTypedError(error) {
  return isCheckCanonicalPresentationError(error)
    || isDistributionResultError(error)
    || isDistributionPresentationError(error)
    || isDisplayRangePlannerError(error)
    || isCanonicalChartSeriesError(error)
}

/**
 * Connect a calculateCheckCanonical result to the shared display and Chart.js
 * contracts. The second argument is
 * `{ displayWindow, mode, opposed, policy }`.
 */
export function createCheckCanonicalPresentation(
  checkResult,
  options = {}
) {
  try {
    if (arguments.length !== 2) {
      fail(
        CHECK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_OPTIONS,
        'createCheckCanonicalPresentation expects checkResult and options',
        { path: 'arguments' }
      )
    }
    const normalized = normalizeOptions(options)
    const scores = normalizeCheckResult(checkResult, normalized.opposed)
    const action = createScorePresentation(
      scores.action,
      normalized.displayWindow,
      normalized.mode,
      normalized.policy
    )
    const reaction = normalized.opposed
      ? createScorePresentation(
          scores.reaction,
          normalized.displayWindow,
          normalized.mode,
          normalized.policy
        )
      : null
    const sides = reaction === null ? [action] : [action, reaction]
    const status = getPresentationStatus(sides)
    const decision = getPresentationDecision(sides)
    const chart = status === 'ready'
      ? createChartData(action, reaction, normalized.opposed)
      : null
    const actionState = createSideState(action)
    const reactionState = reaction === null
      ? null
      : createSideState(reaction)

    const result = {
      version: CHECK_CANONICAL_PRESENTATION_VERSION,
      kind: 'check-canonical-presentation',
      status,
      mode: normalized.mode,
      opposed: normalized.opposed,
      action: actionState,
      chart,
      decision,
    }
    if (reactionState !== null) {
      result.reaction = reactionState
    }
    return Object.freeze(result)
  } catch (error) {
    if (isKnownTypedError(error)) {
      throw error
    }
    throw new CheckCanonicalPresentationError(
      CHECK_CANONICAL_PRESENTATION_ERROR_CODES.UNEXPECTED_ERROR,
      'Check canonical presentation failed unexpectedly',
      {},
      error
    )
  }
}
