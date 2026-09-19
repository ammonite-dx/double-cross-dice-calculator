import {
  normalizeReactionInput,
} from '../../../domain/CalculationInputNormalization'

const SCORE_FIELDS = Object.freeze([
  'dice',
  'critical',
  'skill',
  'yousei',
  'shihai',
])

const ATTACK_DAMAGE_FIELDS = Object.freeze([
  'dice',
  'value',
  'kazanari',
])

const DEFENCE_DAMAGE_FIELDS = Object.freeze([
  'dice',
  'value',
])

function copyFields(source = {}, fields) {
  const copied = {}
  for (const field of fields) {
    copied[field] = source[field]
  }
  return copied
}

function copyScoreDraft(score = {}) {
  return copyFields(score, SCORE_FIELDS)
}

function copyAttackDamageDraft(damage = {}) {
  return copyFields(damage, ATTACK_DAMAGE_FIELDS)
}

function copyDefenceDamageDraft(damage = {}) {
  return copyFields(damage, DEFENCE_DAMAGE_FIELDS)
}

/**
 * Copy the fields owned by AttackForm without applying calculation
 * normalization. The form owns validation; this boundary owns shape and
 * alias-free snapshots.
 */
export function normalizeAttackInputDraft(draft = {}) {
  return {
    score: copyScoreDraft(draft.score),
    damage: copyAttackDamageDraft(draft.damage),
  }
}

export function createAttackInputSnapshot(draft = {}) {
  const normalized = normalizeAttackInputDraft(draft)
  return {
    score: { ...normalized.score },
    damage: { ...normalized.damage },
  }
}

/**
 * Copy DefenceForm's editable draft. Its score is intentionally kept in the
 * UI coordinate system.  Calculation normalization is deliberately deferred
 * until the CalculationClient boundary.
 */
export function createDefenceInputDraftSnapshot(draft = {}) {
  return {
    mode: draft.mode,
    score: copyScoreDraft(draft.score),
    damage: copyDefenceDamageDraft(draft.damage),
  }
}

/**
 * Snapshot a validated DefenceForm value without converting its coordinates.
 * Evasion's dice and skill remain user input until CalculationClient creates a
 * fixed-score resolution.
 */
export function createDefenceInputSnapshot(draft = {}) {
  return createDefenceInputDraftSnapshot(draft)
}

/**
 * Compatibility helper for callers that still request the historical
 * coordinate-normalized reaction object.  Production UI uses
 * createDefenceInputSnapshot() and never installs this result in state.
 */
export function normalizeDefenceInputDraft(draft = {}) {
  const source = draft ?? {}
  if (
    source.mode !== 'ドッジ'
    && source.mode !== '《イベイジョン》'
    && source.mode !== 'ガード・リアクション放棄'
  ) {
    return null
  }
  return normalizeReactionInput({
    mode: source.mode,
    score: source.score ?? {},
    damage: source.damage ?? {},
  })
}

/**
 * Clone a validated side snapshot before installing it in combo params.
 * Defence snapshots are already normalized, so this deliberately copies
 * rather than normalizes them a second time.
 */
export function cloneAttackSideSnapshot(side, snapshot) {
  if (side === 'action') {
    return createAttackInputSnapshot(snapshot)
  }
  if (side === 'reaction') {
    return {
      mode: snapshot.mode,
      score: { ...copyScoreDraft(snapshot.score) },
      damage: { ...copyDefenceDamageDraft(snapshot.damage) },
    }
  }
  throw new TypeError(`unsupported Attack side: ${side}`)
}

/**
 * Replace one combo side atomically and return the installed snapshot.
 */
export function replaceAttackSideSnapshot(params, side, snapshot) {
  if (params === null || typeof params !== 'object') {
    throw new TypeError('Attack params must be an object')
  }
  const nextSnapshot = cloneAttackSideSnapshot(side, snapshot)
  params[side] = nextSnapshot
  return nextSnapshot
}
