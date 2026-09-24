import {
  getCertifiedExpectedValue,
  getProbabilityMassSummary,
} from '../../../calculation/DistributionResult'
import {
  DISTRIBUTION_PROJECTION_DECISIONS,
  materializeChartJsData,
  presentDistribution,
  projectDistribution,
} from '../../../shared/presentation'
import {
  createAttackDisplayRequestSnapshot,
  DEFAULT_ATTACK_DISPLAY_REQUEST,
} from './AttackDisplayRequestSnapshot'
import type { DisplayMode, DisplayRequestSnapshot } from '../../../domain/CalculationInputs'
import type { DistributionEnvelope } from '../../../domain/DistributionResultTypes'
import type { DamageEnvelope, DamageStatistics } from '../../../domain/DamageResultTypes'
import type { ScorePair, ScoreStatistics } from '../../../domain/ScoreResultTypes'
import type {
  DisplayWarning,
  DistributionDisplay,
  DistributionProjectionDecision,
} from '../../../shared/presentation/DistributionProjectionTypes'
import type {
  AttackBatchResult,
  AttackDisplayPresentation,
  AttackDisplaySide,
  AttackPresentation,
  AttackRangePlanReference,
  AttackScorePresentation,
  AttackScoreDisplaySidePresentation,
} from './AttackPresentationTypes'

/** @typedef {import('./AttackPresentationTypes').AttackPresentation} AttackPresentation */
/** @typedef {import('./AttackPresentationTypes').AttackBatchResult} AttackBatchResult */
/** @typedef {import('./AttackPresentationTypes').AttackScorePresentation} AttackScorePresentation */
/** @typedef {import('./AttackPresentationTypes').AttackDisplayPresentation} AttackDisplayPresentation */
/** @typedef {import('./AttackPresentationTypes').AttackScoreDisplaySidePresentation} AttackScoreDisplaySidePresentation */

export const ATTACK_PRESENTATION_ERROR_CODES = Object.freeze({
  INVALID_BATCH_RESULT: 'invalid-batch-result',
  INVALID_COMBO: 'invalid-combo',
  INVALID_DISPLAY_OPTIONS: 'invalid-display-options',
  INVALID_RANGE_PLAN: 'invalid-range-plan',
  INVALID_RANGE_PLANS: 'invalid-range-plans',
  RANGE_PLAN_COUNT_MISMATCH: 'range-plan-count-mismatch',
})

export const ATTACK_DISPLAY_PRESENTATION_VERSION: 1 = 1

export const ATTACK_DISPLAY_PRESENTATION_DECISIONS =
  DISTRIBUTION_PROJECTION_DECISIONS

export const ATTACK_SCORE_DISPLAY_PRESENTATION_DECISIONS =
  ATTACK_DISPLAY_PRESENTATION_DECISIONS

export class AttackPresentationError extends Error {
  readonly code: string
  readonly details: Readonly<Record<string, unknown>>
  readonly attackPresentation = true

  constructor(code: string, message: string, details: unknown = {}) {
    super(message)
    this.name = 'AttackPresentationError'
    this.code = code
    this.details = Object.freeze(
      isRecord(details) ? { ...details } : {}
    )
  }
}

export function isAttackPresentationError(error: unknown): error is AttackPresentationError {
  return isRecord(error)
    && error.attackPresentation === true
    && typeof error.code === 'string'
}

function hasOwn(value: object, property: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, property)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fail(code: string, message: string, details: unknown = {}): never {
  throw new AttackPresentationError(code, message, details)
}

function requireRecord(
  value: unknown,
  path: string,
  code: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    fail(code, `${path} must be an object`, { path })
  }
  return value
}

function requireArray(value: unknown, path: string, code: string): unknown[] {
  if (!Array.isArray(value)) {
    fail(code, `${path} must be an array`, { path })
  }
  return value
}

function requireField(
  value: Record<string, unknown>,
  property: string,
  path: string,
  code: string,
): unknown {
  if (!hasOwn(value, property)) {
    fail(code, `${path}.${property} is required`, {
      path: `${path}.${property}`,
    })
  }
  return value[property]
}

function readOptionalField(
  value: Record<string, unknown>,
  property: string,
): unknown {
  return hasOwn(value, property) ? value[property] : undefined
}

function validateId(id: unknown, path: string): asserts id is string | number {
  if (
    typeof id !== 'string'
    && !(typeof id === 'number' && Number.isFinite(id))
  ) {
    fail(
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_COMBO,
      `${path} must be a string or finite number`,
      { path }
    )
  }
}

function snapshotBatchResult(batchResult: unknown): AttackBatchResult {
  const source = requireRecord(
    batchResult,
    'batchResult',
    ATTACK_PRESENTATION_ERROR_CODES.INVALID_BATCH_RESULT
  )
  const combos = requireArray(
    requireField(
      source,
      'combos',
      'batchResult',
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_BATCH_RESULT
    ),
    'batchResult.combos',
    ATTACK_PRESENTATION_ERROR_CODES.INVALID_BATCH_RESULT
  )
  const totalDamage = requireField(
    source,
    'totalDamage',
    'batchResult',
    ATTACK_PRESENTATION_ERROR_CODES.INVALID_BATCH_RESULT
  )
  const totalDamageStatistics = requireField(
    source,
    'totalDamageStatistics',
    'batchResult',
    ATTACK_PRESENTATION_ERROR_CODES.INVALID_BATCH_RESULT
  )

  const comboSnapshots = combos.map((combo, index) => {
    const path = `batchResult.combos[${index}]`
    const value = requireRecord(
      combo,
      path,
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_COMBO
    )
    const id = requireField(
      value,
      'id',
      path,
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_COMBO
    )
    validateId(id, `${path}.id`)
    return {
      id: id as string | number,
      score: requireField(
        value,
        'score',
        path,
        ATTACK_PRESENTATION_ERROR_CODES.INVALID_COMBO
      ) as ScorePair,
      scoreStatistics: requireField(
        value,
        'scoreStatistics',
        path,
        ATTACK_PRESENTATION_ERROR_CODES.INVALID_COMBO
      ) as ScoreStatistics,
      damage: requireField(
        value,
        'damage',
        path,
        ATTACK_PRESENTATION_ERROR_CODES.INVALID_COMBO
      ) as DamageEnvelope,
      damageStatistics: requireField(
        value,
        'damageStatistics',
        path,
        ATTACK_PRESENTATION_ERROR_CODES.INVALID_COMBO
      ) as DamageStatistics,
    }
  })

  return {
    combos: comboSnapshots,
    totalDamage: totalDamage as DamageEnvelope,
    totalDamageStatistics: totalDamageStatistics as DamageStatistics,
  }
}

function snapshotRangePlans(
  rangePlans: unknown,
  comboCount: number,
): readonly { plan: AttackRangePlanReference; warnings: readonly DisplayWarning[] }[] {
  const plans = requireArray(
    rangePlans,
    'rangePlans',
    ATTACK_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLANS
  )
  if (plans.length !== comboCount) {
    fail(
      ATTACK_PRESENTATION_ERROR_CODES.RANGE_PLAN_COUNT_MISMATCH,
      'rangePlans length must match batchResult.combos length',
      { comboCount, rangePlanCount: plans.length }
    )
  }

  return plans.map((rangePlan, index) => {
    const path = `rangePlans[${index}]`
    const plan = requireRecord(
      rangePlan,
      path,
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLAN
    )
    const warnings = readOptionalField(plan, 'warnings')
    if (warnings !== undefined && !Array.isArray(warnings)) {
      fail(
        ATTACK_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLAN,
        `${path}.warnings must be an array`,
        { path: `${path}.warnings` }
      )
    }
    return {
      plan: plan as unknown as AttackRangePlanReference,
      warnings: (warnings ?? []) as DisplayWarning[],
    }
  })
}

function addEntryId(
  warning: DisplayWarning,
  entryId: string | number,
): DisplayWarning {
  return {
    ...warning,
    entryId,
  }
}

function isScoreEnvelope(value: unknown): value is DistributionEnvelope {
  return isRecord(value)
    && isRecord(value.result)
    && isRecord(value.metadata)
    && value.metadata.modeledDistribution === true
}

function createScoreSidePresentation(
  envelope: unknown,
): DistributionDisplay | null {
  if (!isScoreEnvelope(envelope)) {
    return null
  }

  const summary = {
    mass: getProbabilityMassSummary(envelope.result),
    expectedValue: getCertifiedExpectedValue(envelope.result),
  }
  return presentDistribution(envelope, { summary })
}

/**
 * Keep the complete score display separate from the selected chart window.
 * The action side is the side currently shown by Attack's score chart; the
 * reaction side is retained for the same batch and future consumers.
 */
/** @returns {AttackScorePresentation|null} */
function createScorePresentation(
  score: unknown,
): AttackScorePresentation | null {
  if (!isRecord(score)) {
    return null
  }

  const action = createScoreSidePresentation(score.action)
  if (action === null) {
    return null
  }
  const reaction = createScoreSidePresentation(score.reaction)
  return Object.freeze({
    action,
    ...(reaction === null ? {} : { reaction }),
  })
}

export const createAttackScorePresentation = createScorePresentation

interface NormalizedAttackDisplayOptions {
  readonly displayRequest: DisplayRequestSnapshot
  readonly scoreDisplayRequest: DisplayRequestSnapshot
  readonly rangePlans: readonly unknown[]
  readonly policy?: unknown
}

function normalizeAttackDisplayOptions(
  options: unknown,
): NormalizedAttackDisplayOptions {
  const source = requireRecord(
    options,
    'options',
    ATTACK_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_OPTIONS
  )
  const rawDisplayRequest = readOptionalField(source, 'displayRequest')
  const rawScoreDisplayRequest = readOptionalField(
    source,
    'scoreDisplayRequest'
  )
  const rangePlans = readOptionalField(source, 'rangePlans')
  const policy = readOptionalField(source, 'policy')

  // An own undefined value keeps the existing optional-property semantics;
  // null is an explicit value and must not silently become an omission.
  if (rawDisplayRequest === null) {
    fail(
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_OPTIONS,
      'options.displayRequest must not be null',
      { path: 'options.displayRequest' }
    )
  }
  if (rawScoreDisplayRequest === null) {
    fail(
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_OPTIONS,
      'options.scoreDisplayRequest must not be null',
      { path: 'options.scoreDisplayRequest' }
    )
  }
  if (rangePlans === null) {
    fail(
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_OPTIONS,
      'options.rangePlans must not be null',
      { path: 'options.rangePlans' }
    )
  }
  if (policy === null) {
    fail(
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_OPTIONS,
      'options.policy must not be null',
      { path: 'options.policy' }
    )
  }

  const displayRequest = rawDisplayRequest === undefined
    ? DEFAULT_ATTACK_DISPLAY_REQUEST
    : rawDisplayRequest
  const scoreDisplayRequest = rawScoreDisplayRequest === undefined
    ? displayRequest
    : rawScoreDisplayRequest
  return {
    displayRequest: createAttackDisplayRequestSnapshot(displayRequest),
    scoreDisplayRequest: createAttackDisplayRequestSnapshot(
      scoreDisplayRequest
    ),
    rangePlans: rangePlans === undefined ? [] : rangePlans as unknown[],
    policy,
  }
}

function getAttackDisplayStatus(
  sides: readonly AttackDisplaySide[],
): AttackDisplaySide['status'] {
  if (sides.some(({ projection }) => projection.status === 'not-projectable')) {
    return 'not-projectable'
  }
  if (sides.some(({ projection }) => projection.status === 'not-ready')) {
    return 'not-ready'
  }
  return 'ready'
}

function getAttackDisplayDecision(
  sides: readonly AttackDisplaySide[],
): DistributionProjectionDecision {
  const decisions = sides.map(({ projection }) => projection.decision)
  if (decisions.includes(
    ATTACK_DISPLAY_PRESENTATION_DECISIONS.NOT_PROJECTABLE
  )) {
    return ATTACK_DISPLAY_PRESENTATION_DECISIONS.NOT_PROJECTABLE
  }
  if (decisions.includes(
    ATTACK_DISPLAY_PRESENTATION_DECISIONS.RESOURCE_REJECTED
  )) {
    return ATTACK_DISPLAY_PRESENTATION_DECISIONS.RESOURCE_REJECTED
  }
  if (decisions.includes(
    ATTACK_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
  )) {
    return ATTACK_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
  }
  if (decisions.every((decision) => (
    decision === ATTACK_DISPLAY_PRESENTATION_DECISIONS.KNOWN_ZERO
  ))) {
    return ATTACK_DISPLAY_PRESENTATION_DECISIONS.KNOWN_ZERO
  }
  return ATTACK_DISPLAY_PRESENTATION_DECISIONS.REUSE
}

/** @returns {import('./AttackPresentationTypes').AttackDisplaySide} */
function createAttackDisplaySide(
  display: DistributionDisplay,
  displayRequest: DisplayRequestSnapshot,
  policy?: unknown,
  id?: string | number,
): AttackDisplaySide {
  const projectionOptions: {
    displayWindow: { min: number; max: number }
    mode: DisplayMode
    policy?: unknown
  } = {
    displayWindow: {
      min: displayRequest.min,
      max: displayRequest.max,
    },
    mode: displayRequest.mode,
  }
  if (policy !== undefined) {
    projectionOptions.policy = policy
  }

  const projection = projectDistribution(display, projectionOptions)
  const chart = projection.status === 'ready'
    ? materializeChartJsData(projection)
    : null
  const side = {
    ...(id === undefined ? {} : { id }),
    display,
    projection,
    plan: projection.plan,
    chart,
    status: projection.status,
    reason: projection.status === 'ready'
      ? null
      : projection.reason ?? null,
    decision: projection.decision,
  }
  return Object.freeze(side)
}

/** @returns {AttackScoreDisplaySidePresentation|null} */
function createAttackScoreDisplayPresentation(
  scorePresentation: AttackScorePresentation | null,
  displayRequest: DisplayRequestSnapshot,
  policy?: unknown,
): AttackScoreDisplaySidePresentation | null {
  if (
    !isRecord(scorePresentation)
    || !isRecord(scorePresentation.action)
  ) {
    return null
  }

  const action = createAttackDisplaySide(
    scorePresentation.action,
    displayRequest,
    policy
  )
  if (action === null) {
    return null
  }
  const reaction = !isRecord(scorePresentation.reaction)
    ? null
    : createAttackDisplaySide(
        scorePresentation.reaction,
        displayRequest,
        policy
      )

  // Attack's existing score chart displays the action side only. Retain the
  // reaction side in the atomic payload without making it drive that chart.
  const displayedSides = [action]
  return Object.freeze({
    version: ATTACK_DISPLAY_PRESENTATION_VERSION,
    kind: 'attack-score-display-presentation',
    status: getAttackDisplayStatus(displayedSides),
    decision: getAttackDisplayDecision(displayedSides),
    mode: displayRequest.mode,
    displayRequest,
    action,
    reaction,
  })
}

function copyRangePlan(
  rangePlan: AttackRangePlanReference,
  warnings: readonly DisplayWarning[],
): AttackRangePlanReference {
  return Object.freeze({
    ...rangePlan,
    warnings,
  })
}

/**
 * Build one UI-independent presentation payload for an attack batch.
 * Calculation-owned score, damage, and statistics are reused by reference;
 * only the mutable probability arrays are copied by presentDistribution.
 * @param {AttackBatchResult} batchResult
 * @param {ReadonlyArray<Object>} [rangePlans]
 * @returns {AttackPresentation}
 */
export function createAttackPresentation(
  batchResult: AttackBatchResult,
  rangePlans: readonly unknown[] = [],
): AttackPresentation {
  const snapshot = snapshotBatchResult(batchResult)
  const planSnapshots = snapshotRangePlans(rangePlans, snapshot.combos.length)
  const combos = []
  const totalWarnings = []

  for (let index = 0; index < snapshot.combos.length; index += 1) {
    const combo = snapshot.combos[index]
    const rangePlan = planSnapshots[index]
    const damagePresentation = presentDistribution(
      combo.damage,
      {
        summary: combo.damageStatistics,
        warnings: rangePlan.warnings,
      }
    )

    for (const warning of damagePresentation.warnings) {
      totalWarnings.push(addEntryId(warning, combo.id))
    }

    const scorePresentation = createScorePresentation(combo.score)
    combos.push(Object.freeze({
      id: combo.id,
      score: combo.score,
      scoreStatistics: combo.scoreStatistics,
      scorePresentation,
      damage: combo.damage,
      damageStatistics: combo.damageStatistics,
      damagePresentation,
      rangePlan: copyRangePlan(
        rangePlan.plan,
        damagePresentation.warnings
      ),
    }))
  }

  const totalDamagePresentation = presentDistribution(
    snapshot.totalDamage,
    {
      summary: snapshot.totalDamageStatistics,
      warnings: totalWarnings,
    }
  )

  return Object.freeze({
    combos: Object.freeze(combos),
    totalDamage: snapshot.totalDamage,
    totalDamageStatistics: snapshot.totalDamageStatistics,
    totalDamagePresentation,
  })
}

/**
 * Connect a completed Attack batch to the shared dynamic display contract.
 * This combines already calculated display state without recalculating it.
 */
function buildAttackDisplayPresentationFrom(
  presentation: AttackPresentation,
  normalized: NormalizedAttackDisplayOptions,
): AttackDisplayPresentation {
  const scoreCombos = presentation.combos.map((combo) => {
    const scorePresentation = createAttackScoreDisplayPresentation(
      combo.scorePresentation,
      normalized.scoreDisplayRequest,
      normalized.policy
    )
    if (scorePresentation === null) {
      return null
    }
    return Object.freeze({
      id: combo.id,
      scoreStatistics: combo.scoreStatistics,
      ...scorePresentation,
    })
  })
  const combos = presentation.combos.map((combo, index) => {
    const side = createAttackDisplaySide(
      combo.damagePresentation,
      normalized.displayRequest,
      normalized.policy,
      combo.id
    )
    return Object.freeze({
      ...side,
      id: combo.id,
      // Keep the calculation plan available to the application feedback lane
      // while `plan` remains the display-window plan.
      rangePlan: combo.rangePlan,
      score: combo.score ?? null,
      scoreStatistics: combo.scoreStatistics ?? null,
      scorePresentation: combo.scorePresentation ?? null,
      scoreDisplay: scoreCombos[index],
    })
  })
  const total = createAttackDisplaySide(
    presentation.totalDamagePresentation,
    normalized.displayRequest,
    normalized.policy,
  )
  const sides = [...combos, total]
  const scoreSides = scoreCombos
    .filter((score) => score !== null)
    .map((score) => score.action)
  const hasMissingScore = scoreCombos.some((score) => score === null)
  const score = scoreSides.length === 0
    ? null
    : Object.freeze({
        version: ATTACK_DISPLAY_PRESENTATION_VERSION,
        kind: 'attack-score-display-presentation',
        status: hasMissingScore
          ? 'not-ready'
          : getAttackDisplayStatus(scoreSides),
        decision: hasMissingScore
          ? ATTACK_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
          : getAttackDisplayDecision(scoreSides),
        mode: normalized.scoreDisplayRequest.mode,
        displayRequest: normalized.scoreDisplayRequest,
        combos: Object.freeze(scoreCombos),
      })

  return Object.freeze({
    version: ATTACK_DISPLAY_PRESENTATION_VERSION,
    kind: 'attack-display-presentation',
    status: getAttackDisplayStatus(sides),
    decision: getAttackDisplayDecision(sides),
    mode: normalized.displayRequest.mode,
    displayRequest: normalized.displayRequest,
    combos: Object.freeze(combos),
    total,
    score,
  })
}

/**
 * Re-plan an already presented Attack result for a new display window or
 * mode. The distribution presenter owns the explicit probability copy; this
 * function only creates window-sized chart series.
 * @param {AttackPresentation} presentation
 * @param {Object} [options]
 * @returns {AttackDisplayPresentation}
 */
export function createAttackDisplayPresentationFrom(
  presentation: AttackPresentation,
  options: unknown = {},
): AttackDisplayPresentation {
  const normalized = normalizeAttackDisplayOptions(options)
  if (
    !isRecord(presentation)
    || !Array.isArray(presentation.combos)
  ) {
    fail(
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_BATCH_RESULT,
      'attack presentation must contain a combos array',
      { path: 'presentation.combos' }
    )
  }
  if (!hasOwn(presentation, 'totalDamagePresentation')) {
    fail(
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_BATCH_RESULT,
      'attack presentation must contain a total damage presentation',
      { path: 'presentation.totalDamagePresentation' }
    )
  }
  return buildAttackDisplayPresentationFrom(
    presentation,
    normalized
  )
}

/**
 * @param {AttackBatchResult} batchResult
 * @param {Object} [options]
 * @returns {AttackDisplayPresentation}
 */
export function createAttackDisplayPresentation(
  batchResult: AttackBatchResult,
  options: unknown = {},
): AttackDisplayPresentation {
  const normalized = normalizeAttackDisplayOptions(options)
  const presentation = createAttackPresentation(
    batchResult,
    normalized.rangePlans
  )
  return buildAttackDisplayPresentationFrom(
    presentation,
    normalized
  )
}
