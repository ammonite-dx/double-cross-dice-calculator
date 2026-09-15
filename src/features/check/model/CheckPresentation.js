import {
  getCertifiedExpectedValue,
  getProbabilityMassSummary,
  isDistributionResultError,
} from '../../../calculation/DistributionResult'
import {
  DISTRIBUTION_PROJECTION_MODES,
  isChartSeriesError,
  isDistributionProjectionError,
  materializeChartJsData,
  isDistributionPresentationError,
  presentDistribution,
  projectDistribution,
  toChartPercentage,
} from '../../../shared/presentation'
import { getChartColor } from '../../../shared/theme/ChartPalette'

export const CHECK_PRESENTATION_VERSION = 1

export const CHECK_PRESENTATION_MODES = Object.freeze({
  PMF: DISTRIBUTION_PROJECTION_MODES.PMF,
  UPPER_TAIL: DISTRIBUTION_PROJECTION_MODES.UPPER_TAIL,
})

// The projection owns the low-level status and decision. Check only aggregates
// the two sides so a feature cannot accidentally reinterpret overflow data.
export const CHECK_PRESENTATION_DECISIONS = Object.freeze({
  REUSE: 'reuse',
  KNOWN_ZERO: 'known-zero',
  RECALCULATE: 'recalculate',
  RESOURCE_REJECTED: 'resource-rejected',
  NOT_PROJECTABLE: 'not-projectable',
})

export const CHECK_PRESENTATION_ERROR_CODES = Object.freeze({
  INVALID_RESULT: 'invalid-result',
  INVALID_SCORE: 'invalid-score',
  INVALID_OPTIONS: 'invalid-options',
  INVALID_MODE: 'invalid-mode',
  INVALID_OPPOSED: 'invalid-opposed',
  UNEXPECTED_ERROR: 'unexpected-error',
})

function isRecord(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
}

function freezeDetails(details) {
  return Object.freeze(isRecord(details) ? { ...details } : {})
}

export class CheckPresentationError extends Error {
  constructor(code, message, details = {}, cause) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'CheckPresentationError'
    this.code = code
    this.details = freezeDetails(details)
    this.checkPresentation = true
    if (cause !== undefined && this.cause === undefined) {
      this.cause = cause
    }
  }
}

export class CheckPresentationValidationError
  extends CheckPresentationError {
  constructor(code, message, details = {}, cause) {
    super(code, message, details, cause)
    this.name = 'CheckPresentationValidationError'
    this.validation = true
  }
}

export function isCheckPresentationError(error) {
  return error?.checkPresentation === true
    && typeof error.code === 'string'
}

export function isCheckPresentationValidationError(error) {
  return isCheckPresentationError(error) && error.validation === true
}

function fail(code, message, details = {}) {
  throw new CheckPresentationValidationError(code, message, details)
}

function normalizeOptions(options) {
  if (!isRecord(options)) {
    fail(
      CHECK_PRESENTATION_ERROR_CODES.INVALID_OPTIONS,
      'Check presentation options must be an object',
      { path: 'options' }
    )
  }

  const displayWindow = options.displayWindow
  if (displayWindow === undefined || displayWindow === null) {
    fail(
      CHECK_PRESENTATION_ERROR_CODES.INVALID_OPTIONS,
      'options.displayWindow is required',
      { path: 'options.displayWindow' }
    )
  }

  const optionMode = options.mode
  const optionOpposed = options.opposed
  const optionPolicy = options.policy

  const mode = optionMode ?? CHECK_PRESENTATION_MODES.PMF
  if (
    mode !== CHECK_PRESENTATION_MODES.PMF
    && mode !== CHECK_PRESENTATION_MODES.UPPER_TAIL
  ) {
    fail(
      CHECK_PRESENTATION_ERROR_CODES.INVALID_MODE,
      'options.mode must be pmf or upper-tail',
      { mode }
    )
  }

  const opposed = optionOpposed ?? true
  if (typeof opposed !== 'boolean') {
    fail(
      CHECK_PRESENTATION_ERROR_CODES.INVALID_OPPOSED,
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
  if (!isRecord(checkResult)) {
    fail(
      CHECK_PRESENTATION_ERROR_CODES.INVALID_RESULT,
      'calculateCheck result must be an object',
      { path: 'checkResult' }
    )
  }
  const score = checkResult.score
  if (!isRecord(score)) {
    fail(
      CHECK_PRESENTATION_ERROR_CODES.INVALID_SCORE,
      'checkResult.score must be an object',
      { path: 'checkResult.score' }
    )
  }

  const action = score.action
  if (action === undefined || action === null) {
    fail(
      CHECK_PRESENTATION_ERROR_CODES.INVALID_SCORE,
      'checkResult.score.action is required',
      { path: 'checkResult.score.action' }
    )
  }
  const reaction = opposed ? score.reaction : undefined
  if (opposed && (reaction === undefined || reaction === null)) {
    fail(
      CHECK_PRESENTATION_ERROR_CODES.INVALID_SCORE,
      'checkResult.score.reaction is required when opposed',
      { path: 'checkResult.score.reaction' }
    )
  }

  return { action, reaction }
}

function createScorePresentation(envelope, displayWindow, mode, policy) {
  const summary = {
    mass: getProbabilityMassSummary(envelope.result),
    expectedValue: getCertifiedExpectedValue(envelope.result),
  }
  const display = presentDistribution(envelope, {
    summary,
    displayWindow,
  })
  const projectionOptions = {
    displayWindow,
    mode,
  }
  if (policy !== undefined) {
    projectionOptions.policy = policy
  }
  const projection = projectDistribution(display, projectionOptions)

  return Object.freeze({ display, projection })
}

function getPresentationStatus(sides) {
  if (sides.some(({ projection }) => projection.status === 'not-projectable')) {
    return 'not-projectable'
  }
  if (sides.some(({ projection }) => projection.status === 'not-ready')) {
    return 'not-ready'
  }
  return 'ready'
}

function getPresentationDecision(sides) {
  const decisions = sides.map(({ projection }) => projection.decision)
  if (decisions.includes(CHECK_PRESENTATION_DECISIONS.NOT_PROJECTABLE)) {
    return CHECK_PRESENTATION_DECISIONS.NOT_PROJECTABLE
  }
  if (decisions.includes(CHECK_PRESENTATION_DECISIONS.RESOURCE_REJECTED)) {
    return CHECK_PRESENTATION_DECISIONS.RESOURCE_REJECTED
  }
  if (decisions.includes(CHECK_PRESENTATION_DECISIONS.RECALCULATE)) {
    return CHECK_PRESENTATION_DECISIONS.RECALCULATE
  }
  if (decisions.every((decision) =>
    decision === CHECK_PRESENTATION_DECISIONS.KNOWN_ZERO
  )) {
    return CHECK_PRESENTATION_DECISIONS.KNOWN_ZERO
  }
  return CHECK_PRESENTATION_DECISIONS.REUSE
}

function createSideState(side) {
  const state = {
    plan: side.projection.plan,
    status: side.projection.status,
    reason: side.projection.status === 'ready'
      ? null
      : side.projection.reason ?? null,
    decision: side.projection.decision,
  }
  return Object.freeze(state)
}

function toPercentageProjection(projection) {
  const values = new Float64Array(projection.values.length)
  for (let index = 0; index < projection.values.length; index += 1) {
    // The legacy Check chart displays probability as a percentage rounded to
    // one decimal place. Keep this conversion at the Chart.js compatibility
  // boundary; the display and series remain probabilities.
    values[index] = toChartPercentage(projection.values[index])
  }

  return {
    ...projection,
    kind: 'canonical-distribution-projection',
    version: 1,
    status: 'ready',
    values,
  }
}

function materializeSideChart(side, label, color, includeLabels) {
  return materializeChartJsData(
    toPercentageProjection(side.projection),
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
  return isCheckPresentationError(error)
    || isDistributionResultError(error)
    || isDistributionPresentationError(error)
    || isDistributionProjectionError(error)
    || isChartSeriesError(error)
}

/**
 * Connect a calculateCheck result to the shared display and Chart.js
 * contracts. The second argument is
 * `{ displayWindow, mode, opposed, policy }`.
 */
export function createCheckPresentation(
  checkResult,
  options = {}
) {
  try {
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
      version: CHECK_PRESENTATION_VERSION,
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
    throw new CheckPresentationError(
      CHECK_PRESENTATION_ERROR_CODES.UNEXPECTED_ERROR,
    'Check presentation failed unexpectedly',
      {},
      error
    )
  }
}
