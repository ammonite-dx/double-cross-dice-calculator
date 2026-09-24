import {
  createCalculationFeedbackState,
  markCalculationAborted,
} from '../../../runtime/CalculationFeedback'
import type {
  AttackCombo,
  AttackComboParams,
} from './AttackComboState'
import type {
  AttackCommittedRecord,
  AttackIncrementalExecution,
} from './AttackIncrementalExecutionTypes'
import type {
  AttackDisplayPresentation,
  AttackPresentation,
} from './AttackPresentationTypes'
import type {
  AttackCommittedCalculationSnapshot,
  AttackState,
  AttackStateSeed,
} from './AttackStateTypes'
import type {
  DamageInput,
  DefenceDamageInput,
  ReactionMode,
} from '../../../domain/CalculationInputs'
import type { ScoreInput } from '../../../domain/InputDomain'

/** @typedef {import('./AttackStateTypes').AttackState} AttackState */
/** @typedef {import('./AttackStateTypes').AttackStateSeed} AttackStateSeed */
/** @typedef {import('./AttackComboState').AttackCombo} AttackCombo */
/** @typedef {import('./AttackComboState').AttackComboParams} AttackComboParams */
/** @typedef {import('./AttackIncrementalExecutionTypes').AttackCommittedRecord} AttackCommittedRecord */
/** @typedef {import('./AttackCalculationRecord').AttackTotalCalculationRecord} AttackTotalCalculationRecord */
/** @typedef {import('./AttackIncrementalExecutionTypes').AttackIncrementalExecution} AttackIncrementalExecution */
/** @typedef {import('./AttackStateTypes').AttackCommittedCalculationSnapshot} AttackCommittedCalculationSnapshot */
/** @typedef {import('./AttackPresentationTypes').AttackPresentation} AttackPresentation */
/** @typedef {import('./AttackPresentationTypes').AttackDisplayPresentation} AttackDisplayPresentation */

const COMBO_DEFAULTS = Object.freeze({
  calculation: null,
})

const SCORE_PARAM_NAMES = Object.freeze([
  'dice',
  'critical',
  'skill',
  'yousei',
  'shihai',
])

const ACTION_DAMAGE_PARAM_NAMES = Object.freeze([
  'dice',
  'value',
  'kazanari',
])

const REACTION_DAMAGE_PARAM_NAMES = Object.freeze([
  'dice',
  'value',
])

function hasOwn(object: object, property: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, property)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError(`${path} must be an object`)
  }
  return value
}

function snapshotScoreParams(score: unknown, path: string): ScoreInput {
  const source = requireRecord(score, path)
  return {
    dice: source.dice as number,
    critical: source.critical as number,
    skill: source.skill as number,
    yousei: source.yousei as number,
    shihai: source.shihai as number,
  }
}

function snapshotDamageParams(
  damage: unknown,
  path: string,
  includeKazanari: boolean,
): DamageInput | (DamageInput & { kazanari: number }) {
  const source = requireRecord(damage, path)
  const snapshot: DamageInput & { kazanari?: number } = {
    dice: source.dice as number,
    value: source.value as number,
  }
  if (includeKazanari) {
    snapshot.kazanari = source.kazanari as number
  }
  return snapshot
}

/**
 * Make a plain, non-aliased snapshot of the params accepted by the attack
 * attack batch API. This deliberately copies only calculation inputs, so
 * display result arrays and presentation state never enter the request watch.
 *
 * @param {AttackComboParams} params
 * @returns {AttackComboParams}
 */
export function snapshotAttackParams(params: AttackComboParams): AttackComboParams {
  const source = requireRecord(params, 'params')
  const action = requireRecord(source.action, 'params.action')
  const reaction = requireRecord(source.reaction, 'params.reaction')

  return {
    action: {
      score: snapshotScoreParams(action.score, 'params.action.score'),
      damage: snapshotDamageParams(
        action.damage,
        'params.action.damage',
        true
      ) as DamageInput & { kazanari: number },
    },
    reaction: {
      mode: reaction.mode as ReactionMode,
      score: snapshotScoreParams(
        reaction.score,
        'params.reaction.score'
      ),
      damage: snapshotDamageParams(
        reaction.damage,
        'params.reaction.damage',
        false
      ) as DefenceDamageInput,
    },
  }
}

/**
 * Convert the current combo order into the attack batch request shape.
 * Every nested params object is copied before the caller can mutate it.
 *
 * @param {ReadonlyArray<AttackCombo>} combos
 * @returns {ReadonlyArray<import('./AttackIncrementalExecutionTypes').AttackExecutionEntry>}
 */
export function snapshotAttackEntries(
  combos: readonly AttackCombo[],
): readonly import('./AttackIncrementalExecutionTypes').AttackExecutionEntry[] {
  if (!Array.isArray(combos)) {
    throw new TypeError('combos must be an array')
  }

  return combos.map((combo, index) => {
    const source = requireRecord(combo, `combos[${index}]`)
    const data = requireRecord(source.data, `combos[${index}].data`)
    return {
      id: source.id as string | number,
      params: snapshotAttackParams(data.params as AttackComboParams),
    }
  })
}

function sameParamRecord(
  left: unknown,
  right: unknown,
  names: readonly string[],
): boolean {
  if (!isRecord(left) || !isRecord(right)) {
    return false
  }
  return names.every((name) => Object.is(left[name], right[name]))
}

function sameAttackParams(left: unknown, right: unknown): boolean {
  if (!isRecord(left) || !isRecord(right)) {
    return false
  }
  const leftAction = left.action
  const rightAction = right.action
  const leftReaction = left.reaction
  const rightReaction = right.reaction
  if (
    !isRecord(leftAction)
    || !isRecord(rightAction)
    || !isRecord(leftReaction)
    || !isRecord(rightReaction)
    || !Object.is(leftReaction.mode, rightReaction.mode)
  ) {
    return false
  }
  return sameParamRecord(
    leftAction.score,
    rightAction.score,
    SCORE_PARAM_NAMES
  )
    && sameParamRecord(
      leftAction.damage,
      rightAction.damage,
      ACTION_DAMAGE_PARAM_NAMES
    )
    && sameParamRecord(
      leftReaction.score,
      rightReaction.score,
      SCORE_PARAM_NAMES
    )
    && sameParamRecord(
      leftReaction.damage,
      rightReaction.damage,
      REACTION_DAMAGE_PARAM_NAMES
    )
}

export function createComboDataState(): { calculation: null } {
  return { ...COMBO_DEFAULTS }
}

/**
 * Lazily add calculation fields to combo data created by InputForm.
 * Existing unrelated fields are not read or modified.
 */
export function ensureComboData<T extends { calculation?: unknown }>(
  data: T,
): T & { calculation: unknown } {
  const target = data as T & { calculation?: unknown }
  const targetRecord = target as Record<string, unknown>
  for (const [property, value] of Object.entries(COMBO_DEFAULTS)) {
    if (!hasOwn(targetRecord, property)) {
      targetRecord[property] = value
    }
  }
  return target as T & { calculation: unknown }
}

/** @returns {AttackStateSeed} */
export function createAttackState(): AttackStateSeed {
  return {
    totalCalculation: null,
    basePresentation: null,
    displayPresentation: null,
    feedback: createCalculationFeedbackState(),
    scoreDisplayFeedback: createCalculationFeedbackState(),
    displayFeedback: createCalculationFeedbackState(),
  }
}

function clearResults(state: AttackState): void {
  state.totalCalculation = null
  state.basePresentation = null
  state.displayPresentation = null

  if (state.displayFeedback) {
    markCalculationAborted(state.displayFeedback)
  }
  if (state.scoreDisplayFeedback) {
    markCalculationAborted(state.scoreDisplayFeedback)
  }

  if (!Array.isArray(state.combos)) {
    return
  }
  for (const combo of state.combos) {
    if (!isRecord(combo) || !isRecord(combo.data)) {
      continue
    }
    const data = ensureComboData(combo.data)
    data.calculation = null
  }
}

/**
 * Invalidate the current request and clear only calculation results.
 * The caller's latest-runner owns AbortSignal cancellation.
 */
export function invalidateAttackState(state: AttackState): void {
  clearResults(state)
}

/**
 * Disable/reset calculation state, including user-facing feedback.
 */
export function clearAttackState(state: AttackState): void {
  invalidateAttackState(state)
  if (state.feedback) {
    markCalculationAborted(state.feedback)
  }
}

function sameId(left: unknown, right: unknown): boolean {
  return left === right
    || (typeof left === 'number'
      && typeof right === 'number'
      && Object.is(left, -0)
      && Object.is(right, 0))
    || (typeof left === 'number'
      && typeof right === 'number'
      && Object.is(left, 0)
    && Object.is(right, -0))
}

/**
 * Compare only the ordered input shape. Results and presentation
 * arrays are deliberately excluded so this remains a small commit guard.
 */
export function areAttackEntriesEqual(
  leftEntries: readonly unknown[],
  rightEntries: readonly unknown[],
): boolean {
  if (
    !Array.isArray(leftEntries)
    || !Array.isArray(rightEntries)
    || leftEntries.length !== rightEntries.length
  ) {
    return false
  }

  for (let index = 0; index < leftEntries.length; index += 1) {
    const leftEntry = leftEntries[index]
    const rightEntry = rightEntries[index]
    if (
      !isRecord(leftEntry)
      || !isRecord(rightEntry)
      || !sameId(leftEntry.id, rightEntry.id)
      || !sameAttackParams(leftEntry.params, rightEntry.params)
    ) {
      return false
    }
  }
  return true
}

/**
 * Snapshot and compare the current combo inputs without observing any result
 * or presentation field. Invalid current input is a non-match.
 */
export function isAttackInputCurrent(
  combos: readonly AttackCombo[],
  expectedEntries: readonly unknown[],
): boolean {
  try {
    return areAttackEntriesEqual(
      expectedEntries,
      snapshotAttackEntries(combos)
    )
  } catch {
    return false
  }
}

/**
 * Return the committed calculation records in the current combo order. The
 * returned array is a snapshot of references, so an in-flight execution can
 * never observe later input mutations.
 *
 * @param {ReadonlyArray<AttackCombo>} combos
 * @returns {ReadonlyArray<AttackCommittedRecord>}
 */
export function getAttackCalculationRecords(
  combos: readonly AttackCombo[],
): readonly AttackCommittedRecord[] {
  if (!Array.isArray(combos)) {
    return []
  }
  return combos
    .filter((combo) => isRecord(combo) && isRecord(combo.data))
    .map((combo) => ({
      id: combo.id,
      record: combo.data.calculation ?? null,
    }))
    .filter(({ record }) => record !== null)
}

/**
 * Reconstruct the complete calculation view from state-owned records.
 *
 * The runner intentionally does not retain a second copy of the batch or
 * range plans. A snapshot is complete only when every current combo has a
 * record for the current input and the aggregate records those same objects
 * in the current order. The returned batch reuses result objects; it does
 * not clone probability data.
 *
 * @param {AttackState} state
 * @returns {AttackCommittedCalculationSnapshot|null}
 */
export function getCommittedAttackCalculationSnapshot(
  state: AttackState,
): AttackCommittedCalculationSnapshot | null {
  if (!isRecord(state) || !Array.isArray(state.combos)) {
    return null
  }
  const totalCalculation = state.totalCalculation
  if (!isRecord(totalCalculation)
    || !Array.isArray(totalCalculation.sources)
    || !isRecord(totalCalculation.result)) {
    return null
  }

  let entries
  try {
    entries = snapshotAttackEntries(state.combos)
  } catch {
    return null
  }

  if (totalCalculation.sources.length !== state.combos.length) {
    return null
  }

  const records = []
  const rangePlans = []
  const batchCombos = []
  for (let index = 0; index < state.combos.length; index += 1) {
    const combo = state.combos[index]
    const source = totalCalculation.sources[index]
    const record = combo?.data?.calculation ?? null
    const entry = entries[index]
    if (!isRecord(combo)
      || !isRecord(source)
      || !isRecord(record)
      || !isRecord(record.input)
      || !isRecord(record.result)
      || !hasOwn(record, 'rangePlan')
      || !sameId(combo.id, entry.id)
      || !sameId(source.id, entry.id)
      || source.record !== record
      || !areAttackEntriesEqual(
        [{ id: entry.id, params: entry.params }],
        [{ id: entry.id, params: record.input }]
      )) {
      return null
    }
    records.push({ id: entry.id, record })
    rangePlans.push(record.rangePlan)
    batchCombos.push({ ...record.result, id: entry.id })
  }

  const totalResult = totalCalculation.result
  if (!hasOwn(totalResult, 'totalDamage')
    || !hasOwn(totalResult, 'totalDamageStatistics')) {
    return null
  }
  return {
    entries,
    records,
    rangePlans,
    totalCalculation,
    batchResult: {
      combos: batchCombos,
      totalDamage: totalResult.totalDamage,
      totalDamageStatistics: totalResult.totalDamageStatistics,
    },
  }
}

export function invalidateAttackComboCalculation(
  state: AttackState,
  id: unknown,
): boolean {
  if (!Array.isArray(state?.combos)) {
    return false
  }
  const combo = state.combos.find((candidate) => sameId(candidate?.id, id))
  if (!isRecord(combo) || !isRecord(combo.data)) {
    return false
  }
  const data = ensureComboData(combo.data)
  data.calculation = null
  return true
}

export function invalidateAttackTotalCalculation(state: AttackState): boolean {
  if (!state || typeof state !== 'object') {
    return false
  }
  state.totalCalculation = null
  state.basePresentation = null
  state.displayPresentation = null
  return true
}

export function isAttackCalculationReady(state: AttackState): boolean {
  return state?.totalCalculation !== null
    && state?.totalCalculation !== undefined
}

function hasIncrementalExecutionShape(
  execution: unknown,
  combos: readonly AttackCombo[],
): execution is AttackIncrementalExecution {
  if (!isRecord(execution)
    || !Array.isArray(execution.records)
    || execution.records.length !== combos.length
    || !Array.isArray(execution.rangePlans)
    || execution.rangePlans.length !== combos.length
    || !isRecord(execution.totalCalculation)
    || !Array.isArray(execution.totalCalculation.sources)
    || execution.totalCalculation.sources.length !== combos.length
    || !isRecord(execution.totalCalculation.result)
    || !isRecord(execution.batchResult)
    || !Array.isArray(execution.batchResult.combos)
    || execution.batchResult.combos.length !== combos.length) {
    return false
  }
  const candidate = execution as unknown as AttackIncrementalExecution
  return combos.every((combo, index) => {
    const entry = candidate.records[index]
    const source = candidate.totalCalculation.sources[index]
    const batchCombo = candidate.batchResult.combos[index]
    const inputMatches = (() => {
      try {
        return areAttackEntriesEqual(
          [{ id: combo?.id, params: snapshotAttackParams(combo?.data?.params) }],
          [{ id: entry?.id, params: entry?.record?.input }]
        )
      } catch {
        return false
      }
    })()
    return isRecord(combo)
      && isRecord(entry)
      && sameId(combo.id, entry.id)
      && isRecord(entry.record)
      && isRecord(entry.record.input)
      && isRecord(entry.record.result)
      && isRecord(batchCombo)
      && hasOwn(batchCombo, 'id')
      && sameId(batchCombo.id, combo.id)
      && isRecord(source)
      && sameId(source.id, combo.id)
      && source.record === entry.record
      && inputMatches
  })
}

/**
 * Atomically publish only the calculation part of an incremental execution.
 * Presentation generation is deliberately a separate commit so a presenter
 * failure cannot discard otherwise valid combo and total records.
 *
 * @param {AttackState} state
 * @param {AttackIncrementalExecution} execution
 * @returns {boolean}
 */
export function commitAttackCalculationExecution(
  state: AttackState,
  execution: AttackIncrementalExecution,
): boolean {
  if (!Array.isArray(state.combos)
    || !hasIncrementalExecutionShape(execution, state.combos)) {
    return false
  }

  // Validate every data container before writing the first record. The shape
  // check above already validates the execution payload; this pass keeps the
  // state-side mutation atomic even for malformed test doubles.
  const records = state.combos.map((combo, index) => ({
    data: requireRecord(combo.data, `combos[${index}].data`),
    record: execution.records[index].record,
  }))

  for (const { data, record } of records) {
    data.calculation = record
  }
  state.totalCalculation = execution.totalCalculation
  return true
}

function hasDisplayPresentationShape(
  presentation: unknown,
  combos: readonly AttackCombo[],
): presentation is AttackDisplayPresentation {
  if (
    !isRecord(presentation)
    || !hasOwn(presentation, 'total')
    || !hasOwn(presentation, 'displayRequest')
    || !Array.isArray(presentation.combos)
    || presentation.combos.length !== combos.length
    || !isRecord(presentation.total)
    || !hasOwn(presentation.total, 'display')
    || !hasOwn(presentation.total, 'plan')
  ) {
    return false
  }
  const candidate = presentation as unknown as AttackDisplayPresentation

  return combos.every((combo, index) => {
    const presentedCombo = candidate.combos[index]
    return isRecord(combo)
      && isRecord(presentedCombo)
      && hasOwn(presentedCombo, 'id')
      && hasOwn(presentedCombo, 'display')
      && hasOwn(presentedCombo, 'plan')
      && sameId(presentedCombo.id, combo.id)
  })
}

/**
 * Atomically publish base and display presentations for an already committed
 * incremental calculation. Calculation records are never touched here.
 *
 * @param {AttackState} state
 * @param {AttackPresentation|null} basePresentation
 * @param {AttackDisplayPresentation} displayPresentation
 * @returns {boolean}
 */
export function commitAttackPresentation(
  state: AttackState,
  basePresentation: AttackPresentation | null,
  displayPresentation: AttackDisplayPresentation,
): boolean {
  if (
    !isAttackCalculationReady(state)
    || !Array.isArray(state.combos)
    || !hasDisplayPresentationShape(displayPresentation, state.combos)
  ) {
    return false
  }
  state.basePresentation = basePresentation ?? null
  state.displayPresentation = displayPresentation
  return true
}
