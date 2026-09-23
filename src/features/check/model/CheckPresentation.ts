import {
  getCertifiedExpectedValue,
  getProbabilityMassSummary,
  isDistributionResultError,
} from '../../../calculation/DistributionResult'
import {
  DISTRIBUTION_PROJECTION_MODES,
  DISTRIBUTION_PROJECTION_DECISIONS,
  isChartSeriesError,
  isDistributionProjectionError,
  materializeChartJsData,
  isDistributionPresentationError,
  presentDistribution,
  projectDistribution,
  toChartPercentage,
} from '../../../shared/presentation'
import { getChartColor } from '../../../shared/theme/ChartPalette'
import type { CheckCalculationResult } from '../../../runtime/CalculationClientTypes'
import type {
  DisplayMode,
  DisplayRequestSnapshot,
} from '../../../domain/CalculationInputs'
import type {
  DistributionEnvelope,
  DistributionResult,
} from '../../../domain/DistributionResultTypes'
import type { ScoreEnvelope } from '../../../domain/ScoreResultTypes'
import type {
  ChartJsData,
  DistributionDisplay,
  DistributionProjection,
  DistributionProjectionDecision,
  ReadyDistributionProjection,
} from '../../../shared/presentation/DistributionProjectionTypes'
import type {
  CheckPresentation,
  CheckPresentationSide,
} from './CheckPresentationTypes'

/** @typedef {import('./CheckPresentationTypes').CheckPresentation} CheckPresentation */
/** @typedef {import('./CheckPresentationTypes').CheckPresentationSide} CheckPresentationSide */

export const CHECK_PRESENTATION_VERSION: 1 = 1

export const CHECK_PRESENTATION_MODES = Object.freeze({
  PMF: DISTRIBUTION_PROJECTION_MODES.PMF,
  UPPER_TAIL: DISTRIBUTION_PROJECTION_MODES.UPPER_TAIL,
})

// The projection owns the low-level status and decision. Check only aggregates
// the two sides so a feature cannot accidentally reinterpret overflow data.
export const CHECK_PRESENTATION_DECISIONS = DISTRIBUTION_PROJECTION_DECISIONS

export const CHECK_PRESENTATION_ERROR_CODES = Object.freeze({
  INVALID_RESULT: 'invalid-result',
  INVALID_SCORE: 'invalid-score',
  INVALID_OPTIONS: 'invalid-options',
  INVALID_MODE: 'invalid-mode',
  INVALID_OPPOSED: 'invalid-opposed',
  UNEXPECTED_ERROR: 'unexpected-error',
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
}

function freezeDetails(details: unknown): Readonly<Record<string, unknown>> {
  return Object.freeze(isRecord(details) ? { ...details } : {})
}

export class CheckPresentationError extends Error {
  readonly code: string
  readonly details: Readonly<Record<string, unknown>>
  readonly checkPresentation = true
  readonly validation: boolean = false

  constructor(
    code: string,
    message: string,
    details: unknown = {},
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'CheckPresentationError'
    this.code = code
    this.details = freezeDetails(details)
    if (cause !== undefined && this.cause === undefined) {
      this.cause = cause
    }
  }
}

export class CheckPresentationValidationError
  extends CheckPresentationError {
  override readonly validation: boolean = true

  constructor(
    code: string,
    message: string,
    details: unknown = {},
    cause?: unknown,
  ) {
    super(code, message, details, cause)
    this.name = 'CheckPresentationValidationError'
    this.validation = true
  }
}

export function isCheckPresentationError(
  error: unknown,
): error is CheckPresentationError {
  return isRecord(error)
    && error.checkPresentation === true
    && typeof error.code === 'string'
}

export function isCheckPresentationValidationError(
  error: unknown,
): error is CheckPresentationValidationError {
  return isCheckPresentationError(error) && error.validation === true
}

function fail(code: string, message: string, details: unknown = {}): never {
  throw new CheckPresentationValidationError(code, message, details)
}

interface CheckPresentationOptions {
  readonly displayWindow: Readonly<{ min: number; max: number }>
  readonly mode?: DisplayMode
  readonly opposed?: boolean
  readonly policy?: unknown
}

type CheckPresentationInput = Pick<CheckCalculationResult, 'score'>

interface NormalizedCheckPresentationOptions {
  readonly displayWindow: Readonly<{ min: number; max: number }>
  readonly mode: DisplayMode
  readonly opposed: boolean
  readonly policy?: unknown
}

function normalizeOptions(
  options: CheckPresentationOptions,
): NormalizedCheckPresentationOptions {
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

function normalizeCheckResult(
  checkResult: CheckPresentationInput,
  opposed: boolean,
): { action: ScoreEnvelope; reaction: ScoreEnvelope | null } {
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
  const reaction = opposed ? score.reaction : null
  if (opposed && (reaction === undefined || reaction === null)) {
    fail(
      CHECK_PRESENTATION_ERROR_CODES.INVALID_SCORE,
      'checkResult.score.reaction is required when opposed',
      { path: 'checkResult.score.reaction' }
    )
  }

  return { action, reaction }
}

interface ScorePresentation {
  readonly display: DistributionDisplay
  readonly projection: DistributionProjection
}

function createScorePresentation(
  envelope: ScoreEnvelope,
  displayWindow: Readonly<{ min: number; max: number }>,
  mode: DisplayMode,
  policy?: unknown,
): ScorePresentation {
  const summary = {
    mass: getProbabilityMassSummary(envelope.result),
    expectedValue: getCertifiedExpectedValue(envelope.result),
  }
  const display = presentDistribution(envelope, {
    summary,
    displayWindow,
  })
  const projectionOptions: {
    displayWindow: Readonly<{ min: number; max: number }>
    mode: DisplayMode
    policy?: unknown
  } = {
    displayWindow,
    mode,
  }
  if (policy !== undefined) {
    projectionOptions.policy = policy
  }
  const projection = projectDistribution(display, projectionOptions)

  return Object.freeze({ display, projection })
}

function getPresentationStatus(
  sides: readonly ScorePresentation[],
): 'ready' | 'not-ready' | 'not-projectable' {
  if (sides.some(({ projection }) => projection.status === 'not-projectable')) {
    return 'not-projectable'
  }
  if (sides.some(({ projection }) => projection.status === 'not-ready')) {
    return 'not-ready'
  }
  return 'ready'
}

function getPresentationDecision(
  sides: readonly ScorePresentation[],
): DistributionProjectionDecision {
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

/** @returns {CheckPresentationSide} */
function createSideState(side: ScorePresentation): CheckPresentationSide {
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

function toPercentageProjection(
  projection: ReadyDistributionProjection,
): ReadyDistributionProjection {
  const values = new Float64Array(projection.values.length)
  for (let index = 0; index < projection.values.length; index += 1) {
    // The legacy Check chart displays probability as a percentage rounded to
    // one decimal place. Keep this conversion at the Chart.js compatibility
  // boundary; the display and series remain probabilities.
    values[index] = toChartPercentage(projection.values[index])
  }

  return {
    ...projection,
    kind: 'distribution-projection',
    version: 1,
    status: 'ready',
    values,
  }
}

function materializeSideChart(
  side: ScorePresentation & { readonly projection: ReadyDistributionProjection },
  label: string,
  color: string,
  includeLabels: boolean,
): ChartJsData {
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

function createChartData(
  action: ScorePresentation & { readonly projection: ReadyDistributionProjection },
  reaction: (ScorePresentation & { readonly projection: ReadyDistributionProjection }) | null,
  opposed: boolean,
): ChartJsData {
  const actionChart = materializeSideChart(
    action,
    'アクション側',
    getChartColor(0),
    true
  )
  if (!opposed) {
    return actionChart
  }

  if (reaction === null) {
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

function isKnownTypedError(error: unknown): boolean {
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
/**
 * @param {Object} checkResult
 * @param {Object} [options]
 * @returns {CheckPresentation}
 */
export function createCheckPresentation(
  checkResult: CheckPresentationInput,
  options: CheckPresentationOptions,
): CheckPresentation {
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
          scores.reaction as ScoreEnvelope,
          normalized.displayWindow,
          normalized.mode,
          normalized.policy
        )
      : null
    const sides = reaction === null ? [action] : [action, reaction]
    const status = getPresentationStatus(sides)
    const decision = getPresentationDecision(sides)
    const actionIsReady = action.projection.status === 'ready'
    const reactionIsReady = reaction === null
      || reaction.projection.status === 'ready'
    const chart = status === 'ready' && actionIsReady && reactionIsReady
      ? createChartData(
          action as ScorePresentation & {
            readonly projection: ReadyDistributionProjection
          },
          reaction === null || reaction.projection.status !== 'ready'
            ? null
            : reaction as ScorePresentation & {
                readonly projection: ReadyDistributionProjection
              },
          normalized.opposed
        )
      : null
    const actionState = createSideState(action)
    const reactionState = reaction === null
      ? null
      : createSideState(reaction)

    const result: CheckPresentation = {
      version: CHECK_PRESENTATION_VERSION,
      kind: 'check-presentation',
      status,
      mode: normalized.mode,
      opposed: normalized.opposed,
      action: actionState,
      chart,
      decision,
    }
    return Object.freeze({
      ...result,
      ...(reactionState === null ? {} : { reaction: reactionState }),
    })
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
