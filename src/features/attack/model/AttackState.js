import {
  createCalculationFeedbackState,
  markCalculationAborted,
} from '../../../runtime/CalculationFeedback'

const COMBO_DEFAULTS = Object.freeze({
  score: null,
  scoreSummary: null,
  scorePresentation: null,
  scoreReady: false,
  damage: null,
  damageSummary: null,
  damagePresentation: null,
  rangePlan: null,
  resultReady: false,
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
    scoreDisplayPresentation: null,
    totalDamage: null,
    totalDamageSummary: null,
    totalDamagePresentation: null,
    displayPresentation: null,
    totalDamageReady: false,
    generation: 0,
    feedback: createCalculationFeedbackState(),
    scoreDisplayFeedback: createCalculationFeedbackState(),
    displayFeedback: createCalculationFeedbackState(),
  }
}

function clearResults(state) {
  state.scoreDisplayPresentation = null
  state.totalDamage = null
  state.totalDamageSummary = null
  state.totalDamagePresentation = null
  state.displayPresentation = null
  state.totalDamageReady = false

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
    data.score = null
    data.scoreSummary = null
    data.scorePresentation = null
    data.scoreReady = false
    data.damage = null
    data.damageSummary = null
    data.damagePresentation = null
    data.rangePlan = null
    data.resultReady = false
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
      || !hasOwn(batchResult, 'totalDamageSummary')
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
        || !hasOwn(batchCombo, 'damageSummary')
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
    || !hasOwn(batchResult, 'totalDamageSummary')
    || !hasOwn(presentation, 'totalDamage')
    || !hasOwn(presentation, 'totalDamageSummary')
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
      || !hasOwn(batchCombo, 'damageSummary')
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
      scoreSummary: hasOwn(presentedCombo, 'scoreSummary')
        ? presentedCombo.scoreSummary
        : null,
      scorePresentation: hasOwn(
        presentedCombo,
        'scorePresentation'
      )
        ? presentedCombo.scorePresentation
        : null,
      damage: batchCombo.damage,
      damageSummary: batchCombo.damageSummary,
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
    scoreSummary,
    scorePresentation,
    damage,
    damageSummary,
    damagePresentation,
    rangePlan,
  } of comboValues) {
    ensureComboData(data)
    data.score = score
    data.scoreSummary = scoreSummary
    data.scorePresentation = scorePresentation
    data.scoreReady = score !== null
      && score !== undefined
    data.damage = damage
    data.damageSummary = damageSummary
    data.damagePresentation = damagePresentation
    data.rangePlan = rangePlan
    data.resultReady = true
  }

  state.totalDamage = batchResult.totalDamage
  state.totalDamageSummary = batchResult.totalDamageSummary
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
    || state.totalDamageReady !== true
    || !Array.isArray(state.combos)
    || !hasDisplayPresentationShape(presentation, state.combos)
  ) {
    return false
  }
  state.displayPresentation = presentation
  state.scoreDisplayPresentation = presentation.score ?? null
  return true
}
