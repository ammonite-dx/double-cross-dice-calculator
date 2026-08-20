import {
  createCalculationFeedbackState,
  markCalculationAborted,
} from './CalculationFeedback'

const CANONICAL_COMBO_DEFAULTS = Object.freeze({
  canonicalDamage: null,
  canonicalDamageSummary: null,
  canonicalDamagePresentation: null,
  canonicalRangePlan: null,
  canonicalResultReady: false,
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
 * Make a plain, non-aliased snapshot of the params accepted by the canonical
 * attack batch API. This deliberately copies only calculation inputs, so
 * legacy result arrays and presentation state never enter the request watch.
 */
export function snapshotCanonicalAttackParams(params) {
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
 * Convert the current combo order into the canonical batch request shape.
 * Every nested params object is copied before the caller can mutate it.
 */
export function snapshotCanonicalAttackEntries(combos) {
  if (!Array.isArray(combos)) {
    throw new TypeError('combos must be an array')
  }

  return combos.map((combo, index) => {
    const source = requireRecord(combo, `combos[${index}]`)
    const data = requireRecord(source.data, `combos[${index}].data`)
    return {
      id: source.id,
      params: snapshotCanonicalAttackParams(data.params),
    }
  })
}

function sameParamRecord(left, right, names) {
  if (!isRecord(left) || !isRecord(right)) {
    return false
  }
  return names.every((name) => Object.is(left[name], right[name]))
}

function sameCanonicalAttackParams(left, right) {
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

export function createCanonicalComboDataState() {
  return { ...CANONICAL_COMBO_DEFAULTS }
}

/**
 * Lazily add canonical-only fields to combo data created by InputForm.
 * Existing legacy fields are not read or modified.
 */
export function ensureCanonicalComboData(data) {
  const target = requireRecord(data, 'combo.data')
  for (const [property, value] of Object.entries(CANONICAL_COMBO_DEFAULTS)) {
    if (!hasOwn(target, property)) {
      target[property] = value
    }
  }
  return target
}

export function createCanonicalAttackState() {
  return {
    canonicalOptIn: false,
    canonicalTotalDamage: null,
    canonicalTotalDamageSummary: null,
    canonicalTotalDamagePresentation: null,
    canonicalDisplayPresentation: null,
    canonicalTotalDamageReady: false,
    canonicalGeneration: 0,
    canonicalFeedback: createCalculationFeedbackState(),
    canonicalDisplayFeedback: createCalculationFeedbackState(),
  }
}

function clearCanonicalResults(state) {
  state.canonicalTotalDamage = null
  state.canonicalTotalDamageSummary = null
  state.canonicalTotalDamagePresentation = null
  state.canonicalDisplayPresentation = null
  state.canonicalTotalDamageReady = false

  if (state.canonicalDisplayFeedback) {
    markCalculationAborted(state.canonicalDisplayFeedback)
  }

  if (!Array.isArray(state.combos)) {
    return
  }
  for (const combo of state.combos) {
    if (!isRecord(combo) || !isRecord(combo.data)) {
      continue
    }
    const data = ensureCanonicalComboData(combo.data)
    data.canonicalDamage = null
    data.canonicalDamageSummary = null
    data.canonicalDamagePresentation = null
    data.canonicalRangePlan = null
    data.canonicalResultReady = false
  }
}

/**
 * Invalidate the current canonical request and clear only canonical results.
 * The caller's latest-runner owns AbortSignal cancellation.
 */
export function invalidateCanonicalAttackState(state) {
  const currentGeneration = Number.isSafeInteger(state.canonicalGeneration)
    ? state.canonicalGeneration
    : 0
  state.canonicalGeneration = currentGeneration + 1
  clearCanonicalResults(state)
  return state.canonicalGeneration
}

/**
 * Disable/reset canonical state, including user-facing canonical feedback.
 * Legacy result and feedback fields are intentionally outside this function.
 */
export function clearCanonicalAttackState(state) {
  const generation = invalidateCanonicalAttackState(state)
  if (state.canonicalFeedback) {
    markCalculationAborted(state.canonicalFeedback)
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
 * Compare only the ordered canonical input shape. Results and presentation
 * arrays are deliberately excluded so this remains a small commit guard.
 */
export function areCanonicalAttackEntriesEqual(leftEntries, rightEntries) {
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
      || !sameCanonicalAttackParams(leftEntry.params, rightEntry.params)
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
export function isCanonicalAttackInputCurrent(combos, expectedEntries) {
  try {
    return areCanonicalAttackEntriesEqual(
      expectedEntries,
      snapshotCanonicalAttackEntries(combos)
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
      !hasOwn(batchResult, 'canonicalTotalDamage')
      || !hasOwn(batchResult, 'canonicalTotalDamageSummary')
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
        || !hasOwn(batchCombo, 'canonicalDamage')
        || !hasOwn(batchCombo, 'canonicalDamageSummary')
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
    !hasOwn(batchResult, 'canonicalTotalDamage')
    || !hasOwn(batchResult, 'canonicalTotalDamageSummary')
    || !hasOwn(presentation, 'canonicalTotalDamage')
    || !hasOwn(presentation, 'canonicalTotalDamageSummary')
    || !hasOwn(presentation, 'canonicalTotalDamagePresentation')
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
      || !hasOwn(batchCombo, 'canonicalDamage')
      || !hasOwn(batchCombo, 'canonicalDamageSummary')
      || !hasOwn(presentedCombo, 'id')
      || !hasOwn(presentedCombo, 'canonicalDamagePresentation')
      || !hasOwn(presentedCombo, 'canonicalRangePlan')
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
export function commitCanonicalAttackResult(
  state,
  generation,
  batchResult,
  presentation
) {
  if (generation !== state.canonicalGeneration || state.canonicalOptIn !== true) {
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
      canonicalDamage: batchCombo.canonicalDamage,
      canonicalDamageSummary: batchCombo.canonicalDamageSummary,
      canonicalDamagePresentation: isDisplayPresentation
        ? presentedCombo.display
        : presentedCombo.canonicalDamagePresentation,
      canonicalRangePlan: isDisplayPresentation
        ? presentedCombo.canonicalRangePlan ?? presentedCombo.plan
        : presentedCombo.canonicalRangePlan,
    }
  })

  for (const {
    data,
    canonicalDamage,
    canonicalDamageSummary,
    canonicalDamagePresentation,
    canonicalRangePlan,
  } of comboValues) {
    ensureCanonicalComboData(data)
    data.canonicalDamage = canonicalDamage
    data.canonicalDamageSummary = canonicalDamageSummary
    data.canonicalDamagePresentation = canonicalDamagePresentation
    data.canonicalRangePlan = canonicalRangePlan
    data.canonicalResultReady = true
  }

  state.canonicalTotalDamage = batchResult.canonicalTotalDamage
  state.canonicalTotalDamageSummary = batchResult.canonicalTotalDamageSummary
  state.canonicalTotalDamagePresentation = isDisplayPresentation
    ? presentation.total.display
    : presentation.canonicalTotalDamagePresentation
  state.canonicalDisplayPresentation = isDisplayPresentation
    ? presentation
    : null
  state.canonicalTotalDamageReady = true
  return true
}

function hasCanonicalDisplayPresentationShape(presentation, combos) {
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
 * canonical result. No canonical result fields are copied or recalculated.
 */
export function commitCanonicalAttackDisplayPresentation(
  state,
  generation,
  presentation
) {
  if (
    generation !== state.canonicalGeneration
    || state.canonicalOptIn !== true
    || state.canonicalTotalDamageReady !== true
    || !Array.isArray(state.combos)
    || !hasCanonicalDisplayPresentationShape(presentation, state.combos)
  ) {
    return false
  }
  state.canonicalDisplayPresentation = presentation
  return true
}

export const createCanonicalBatchEntries = snapshotCanonicalAttackEntries
export const commitAttackCanonicalResult = commitCanonicalAttackResult
