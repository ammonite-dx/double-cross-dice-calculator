import {
  createCalculationFeedbackState,
  markCalculationAborted,
} from '../../../runtime/CalculationFeedback'

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

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property)
}

function isRecord(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
}

function requireRecord(value, path) {
  if (!isRecord(value)) {
    throw new TypeError(`${path} must be an object`)
  }
  return value
}

function snapshotScoreParams(score, path) {
  const source = requireRecord(score, path)
  return {
    dice: source.dice,
    critical: source.critical,
    skill: source.skill,
    yousei: source.yousei,
    shihai: source.shihai,
  }
}

function snapshotDamageParams(damage, path, includeKazanari) {
  const source = requireRecord(damage, path)
  const snapshot = {
    dice: source.dice,
    value: source.value,
  }
  if (includeKazanari) {
    snapshot.kazanari = source.kazanari
  }
  return snapshot
}

/**
 * Make a plain, non-aliased snapshot of the params accepted by the attack
 * attack batch API. This deliberately copies only calculation inputs, so
 * legacy result arrays and presentation state never enter the request watch.
 */
export function snapshotAttackParams(params) {
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
      ),
    },
    reaction: {
      mode: reaction.mode,
      score: snapshotScoreParams(
        reaction.score,
        'params.reaction.score'
      ),
      damage: snapshotDamageParams(
        reaction.damage,
        'params.reaction.damage',
        false
      ),
    },
  }
}

/**
 * Convert the current combo order into the attack batch request shape.
 * Every nested params object is copied before the caller can mutate it.
 */
export function snapshotAttackEntries(combos) {
  if (!Array.isArray(combos)) {
    throw new TypeError('combos must be an array')
  }

  return combos.map((combo, index) => {
    const source = requireRecord(combo, `combos[${index}]`)
    const data = requireRecord(source.data, `combos[${index}].data`)
    return {
      id: source.id,
      params: snapshotAttackParams(data.params),
    }
  })
}

function sameParamRecord(left, right, names) {
  if (!isRecord(left) || !isRecord(right)) {
    return false
  }
  return names.every((name) => Object.is(left[name], right[name]))
}

function sameAttackParams(left, right) {
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

export function createComboDataState() {
  return { ...COMBO_DEFAULTS }
}

/**
 * Lazily add calculation fields to combo data created by InputForm.
 * Existing unrelated fields are not read or modified.
 */
export function ensureComboData(data) {
  const target = requireRecord(data, 'combo.data')
  for (const [property, value] of Object.entries(COMBO_DEFAULTS)) {
    if (!hasOwn(target, property)) {
      target[property] = value
    }
  }
  return target
}

export function createAttackState() {
  return {
    totalCalculation: null,
    basePresentation: null,
    // Deprecated mirrors are retained only for callers that still exercise
    // the pre-R17 runner contract. Production incremental state reads the
    // owned records above.
    totalDamage: null,
    totalDamageStatistics: null,
    totalDamagePresentation: null,
    totalDamageReady: false,
    scoreDisplayPresentation: null,
    displayPresentation: null,
    generation: 0,
    feedback: createCalculationFeedbackState(),
    scoreDisplayFeedback: createCalculationFeedbackState(),
    displayFeedback: createCalculationFeedbackState(),
  }
}

function clearResults(state) {
  state.totalCalculation = null
  state.basePresentation = null
  state.scoreDisplayPresentation = null
  state.displayPresentation = null

  // Keep compatibility fields out of the normal state shape. If a legacy
  // test double attached them dynamically, clear them without making them
  // part of the production record contract.
  for (const property of [
    'totalDamage',
    'totalDamageStatistics',
    'totalDamagePresentation',
    'totalDamageReady',
  ]) {
    if (hasOwn(state, property)) {
      state[property] = property === 'totalDamageReady' ? false : null
    }
  }

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
    for (const property of [
      'score',
      'scoreStatistics',
      'scorePresentation',
      'scoreReady',
      'damage',
      'damageStatistics',
      'damagePresentation',
      'rangePlan',
      'resultReady',
    ]) {
      data[property] = property === 'scoreReady' || property === 'resultReady'
        ? false
        : null
    }
  }
}

/**
 * Invalidate the current request and clear only calculation results.
 * The caller's latest-runner owns AbortSignal cancellation.
 */
export function invalidateAttackState(state) {
  const currentGeneration = Number.isSafeInteger(state.generation)
    ? state.generation
    : 0
  state.generation = currentGeneration + 1
  clearResults(state)
  return state.generation
}

/**
 * Disable/reset calculation state, including user-facing feedback.
 */
export function clearAttackState(state) {
  const generation = invalidateAttackState(state)
  if (state.feedback) {
    markCalculationAborted(state.feedback)
  }
  return generation
}

function sameId(left, right) {
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
export function areAttackEntriesEqual(leftEntries, rightEntries) {
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
export function isAttackInputCurrent(combos, expectedEntries) {
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
 */
export function getAttackCalculationRecords(combos) {
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

export function invalidateAttackComboCalculation(state, id) {
  if (!Array.isArray(state?.combos)) {
    return false
  }
  const combo = state.combos.find((candidate) => sameId(candidate?.id, id))
  if (!isRecord(combo) || !isRecord(combo.data)) {
    return false
  }
  const data = ensureComboData(combo.data)
  data.calculation = null
  for (const property of [
    'score',
    'scoreStatistics',
    'scorePresentation',
    'scoreReady',
    'damage',
    'damageStatistics',
    'damagePresentation',
    'rangePlan',
    'resultReady',
  ]) {
    if (hasOwn(data, property)) {
      data[property] = property === 'scoreReady' || property === 'resultReady'
        ? false
        : null
    }
  }
  return true
}

export function invalidateAttackTotalCalculation(state) {
  if (!state || typeof state !== 'object') {
    return false
  }
  state.totalCalculation = null
  state.basePresentation = null
  state.displayPresentation = null
  state.scoreDisplayPresentation = null
  for (const property of [
    'totalDamage',
    'totalDamageStatistics',
    'totalDamagePresentation',
    'totalDamageReady',
  ]) {
    if (hasOwn(state, property)) {
      state[property] = property === 'totalDamageReady' ? false : null
    }
  }
  return true
}

export function isAttackCalculationReady(state) {
  return (
    state?.totalCalculation !== null
    && state?.totalCalculation !== undefined
  ) || state?.totalDamageReady === true
}

function hasIncrementalExecutionShape(execution, combos) {
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
  return combos.every((combo, index) => {
    const entry = execution.records[index]
    const source = execution.totalCalculation.sources[index]
    const batchCombo = execution.batchResult.combos[index]
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
 * Atomically publish an incremental execution and its presentation. This
 * combined helper remains for compatibility callers; production incremental
 * execution uses the calculation and presentation helpers below.
 */
export function commitAttackExecution(
  state,
  generation,
  execution,
  basePresentation,
  displayPresentation,
) {
  if (generation !== state.generation
    || !Array.isArray(state.combos)
    || !hasIncrementalExecutionShape(execution, state.combos)) {
    return false
  }
  const records = state.combos.map((combo, index) => ({
    data: ensureComboData(combo.data),
    record: execution.records[index].record,
  }))

  for (const { data, record } of records) {
    data.calculation = record
  }
  state.totalCalculation = execution.totalCalculation
  state.basePresentation = basePresentation ?? null
  state.displayPresentation = displayPresentation ?? null
  state.scoreDisplayPresentation = displayPresentation?.score ?? null
  return true
}

/**
 * Atomically publish only the calculation part of an incremental execution.
 * Presentation generation is deliberately a separate commit so a presenter
 * failure cannot discard otherwise valid combo and total records.
 */
export function commitAttackCalculationExecution(
  state,
  generation,
  execution,
) {
  if (generation !== state.generation
    || !Array.isArray(state.combos)
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

function hasBatchResultShape(batchResult, presentation, combos) {
  if (!isRecord(batchResult) || !isRecord(presentation)) {
    return false
  }
  if (
    !Array.isArray(batchResult.combos)
    || !Array.isArray(presentation.combos)
    || batchResult.combos.length !== combos.length
    || presentation.combos.length !== combos.length
  ) {
    return false
  }
  const isDisplayPresentation = hasOwn(presentation, 'total')
    && hasOwn(presentation, 'displayRequest')

  if (isDisplayPresentation) {
    if (
      !hasOwn(batchResult, 'totalDamage')
      || !hasOwn(batchResult, 'totalDamageStatistics')
      || !isRecord(presentation.total)
    ) {
      return false
    }
    for (let index = 0; index < combos.length; index += 1) {
      const stateCombo = combos[index]
      const batchCombo = batchResult.combos[index]
      const presentedCombo = presentation.combos[index]
      if (
        !isRecord(stateCombo)
        || !isRecord(stateCombo.data)
        || !isRecord(batchCombo)
        || !isRecord(presentedCombo)
        || !hasOwn(batchCombo, 'id')
        || !hasOwn(batchCombo, 'damage')
        || !hasOwn(batchCombo, 'damageStatistics')
        || !hasOwn(presentedCombo, 'id')
        || !hasOwn(presentedCombo, 'display')
        || !hasOwn(presentedCombo, 'plan')
        || !sameId(batchCombo.id, stateCombo.id)
        || !sameId(presentedCombo.id, stateCombo.id)
      ) {
        return false
      }
    }
    return hasOwn(presentation.total, 'display')
      && hasOwn(presentation.total, 'plan')
  }

  if (
    !hasOwn(batchResult, 'totalDamage')
    || !hasOwn(batchResult, 'totalDamageStatistics')
    || !hasOwn(presentation, 'totalDamage')
    || !hasOwn(presentation, 'totalDamageStatistics')
    || !hasOwn(presentation, 'totalDamagePresentation')
  ) {
    return false
  }

  for (let index = 0; index < combos.length; index += 1) {
    const stateCombo = combos[index]
    const batchCombo = batchResult.combos[index]
    const presentedCombo = presentation.combos[index]
    if (
      !isRecord(stateCombo)
      || !isRecord(stateCombo.data)
      || !isRecord(batchCombo)
      || !isRecord(presentedCombo)
    ) {
      return false
    }
    if (
      !hasOwn(batchCombo, 'id')
      || !hasOwn(batchCombo, 'damage')
      || !hasOwn(batchCombo, 'damageStatistics')
      || !hasOwn(presentedCombo, 'id')
      || !hasOwn(presentedCombo, 'damagePresentation')
      || !hasOwn(presentedCombo, 'rangePlan')
      || !sameId(batchCombo.id, stateCombo.id)
      || !sameId(presentedCombo.id, stateCombo.id)
    ) {
      return false
    }
  }
  return true
}

/**
 * Atomically publish one completed batch and its presentation payload.
 * Validation happens before any combo or total field is written.
 */
export function commitAttackResult(
  state,
  generation,
  batchResult,
  presentation
) {
  if (generation !== state.generation) {
    return false
  }
  if (!Array.isArray(state.combos)) {
    return false
  }
  if (!hasBatchResultShape(batchResult, presentation, state.combos)) {
    return false
  }

  const isDisplayPresentation = hasOwn(presentation, 'total')
    && hasOwn(presentation, 'displayRequest')

  const comboValues = state.combos.map((combo, index) => {
    const data = requireRecord(combo.data, `combos[${index}].data`)
    const batchCombo = batchResult.combos[index]
    const presentedCombo = presentation.combos[index]
    return {
      data,
      score: hasOwn(presentedCombo, 'score')
        ? presentedCombo.score
        : null,
      scoreStatistics: hasOwn(presentedCombo, 'scoreStatistics')
        ? presentedCombo.scoreStatistics
        : null,
      scorePresentation: hasOwn(
        presentedCombo,
        'scorePresentation'
      )
        ? presentedCombo.scorePresentation
        : null,
      damage: batchCombo.damage,
      damageStatistics: batchCombo.damageStatistics,
      damagePresentation: isDisplayPresentation
        ? presentedCombo.display
        : presentedCombo.damagePresentation,
      rangePlan: isDisplayPresentation
        ? presentedCombo.rangePlan ?? presentedCombo.plan
        : presentedCombo.rangePlan,
    }
  })

  for (const {
    data,
    score,
    scoreStatistics,
    scorePresentation,
    damage,
    damageStatistics,
    damagePresentation,
    rangePlan,
  } of comboValues) {
    ensureComboData(data)
    data.score = score
    data.scoreStatistics = scoreStatistics
    data.scorePresentation = scorePresentation
    data.scoreReady = score !== null
      && score !== undefined
    data.damage = damage
    data.damageStatistics = damageStatistics
    data.damagePresentation = damagePresentation
    data.rangePlan = rangePlan
    data.resultReady = true
  }

  state.totalDamage = batchResult.totalDamage
  state.totalDamageStatistics = batchResult.totalDamageStatistics
  state.totalDamagePresentation = isDisplayPresentation
    ? presentation.total.display
    : presentation.totalDamagePresentation
  state.scoreDisplayPresentation = isDisplayPresentation
    ? presentation.score ?? null
    : null
  state.displayPresentation = isDisplayPresentation
    ? presentation
    : null
  state.totalDamageReady = true
  return true
}

function hasDisplayPresentationShape(presentation, combos) {
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

  return combos.every((combo, index) => {
    const presentedCombo = presentation.combos[index]
    return isRecord(combo)
      && isRecord(presentedCombo)
      && hasOwn(presentedCombo, 'id')
      && hasOwn(presentedCombo, 'display')
      && hasOwn(presentedCombo, 'plan')
      && sameId(presentedCombo.id, combo.id)
  })
}

/**
 * Publish a new chart/summary presentation for an already committed
 * calculation result. No result fields are copied or recalculated.
 */
export function commitAttackDisplayPresentation(
  state,
  generation,
  presentation
) {
  if (
    generation !== state.generation
    || (
      !isAttackCalculationReady(state)
      && state.totalDamageReady !== true
    )
    || !Array.isArray(state.combos)
    || !hasDisplayPresentationShape(presentation, state.combos)
  ) {
    return false
  }
  state.displayPresentation = presentation
  state.scoreDisplayPresentation = presentation.score ?? null
  return true
}

/**
 * Atomically publish base and display presentations for an already committed
 * incremental calculation. Calculation records are never touched here.
 */
export function commitAttackPresentation(
  state,
  generation,
  basePresentation,
  displayPresentation,
) {
  if (
    generation !== state.generation
    || !isAttackCalculationReady(state)
    || !Array.isArray(state.combos)
    || !hasDisplayPresentationShape(displayPresentation, state.combos)
  ) {
    return false
  }
  state.basePresentation = basePresentation ?? null
  state.displayPresentation = displayPresentation
  state.scoreDisplayPresentation = displayPresentation.score ?? null
  return true
}
