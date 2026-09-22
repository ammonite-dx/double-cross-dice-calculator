import type {
  DamageInput,
  DefenceDamageInput,
  ReactionMode,
} from '../../../domain/CalculationInputs'
import type { ScoreInput } from '../../../domain/InputDomain'

type DraftRecord = Record<string, unknown>
type ScoreDraft = Partial<ScoreInput>
type ActionDamageDraft = Partial<DamageInput> & { kazanari?: number }
type DefenceDamageDraft = Partial<DefenceDamageInput>
type AttackDraft = {
  score?: ScoreDraft
  damage?: ActionDamageDraft
}
type DefenceDraft = {
  mode?: ReactionMode
  score?: ScoreDraft
  damage?: DefenceDamageDraft
}

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

function asRecord(value: unknown): DraftRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as DraftRecord
    : {}
}

function copyFields(source: unknown, fields: readonly string[]): DraftRecord {
  const copied: DraftRecord = {}
  const record = asRecord(source)
  for (const field of fields) {
    copied[field] = record[field]
  }
  return copied
}

function copyScoreDraft(score: unknown = {}): ScoreDraft {
  return copyFields(score, SCORE_FIELDS) as ScoreDraft
}

function copyAttackDamageDraft(damage: unknown = {}): ActionDamageDraft {
  return copyFields(damage, ATTACK_DAMAGE_FIELDS) as ActionDamageDraft
}

function copyDefenceDamageDraft(damage: unknown = {}): DefenceDamageDraft {
  return copyFields(damage, DEFENCE_DAMAGE_FIELDS) as DefenceDamageDraft
}

/**
 * Copy the fields owned by AttackForm without applying calculation
 * normalization. The form owns validation; this boundary owns shape and
 * alias-free snapshots.
 */
export function normalizeAttackInputDraft(draft: AttackDraft = {}): {
  score: ScoreDraft
  damage: ActionDamageDraft
} {
  return {
    score: copyScoreDraft(draft.score),
    damage: copyAttackDamageDraft(draft.damage),
  }
}

export function createAttackInputSnapshot(draft: AttackDraft = {}): {
  score: ScoreDraft
  damage: ActionDamageDraft
} {
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
export function createDefenceInputDraftSnapshot(draft: DefenceDraft = {}): {
  mode?: ReactionMode
  score: ScoreDraft
  damage: DefenceDamageDraft
} {
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
export function createDefenceInputSnapshot(draft: DefenceDraft = {}) {
  return createDefenceInputDraftSnapshot(draft)
}

/**
 * Clone a validated side snapshot before installing it in combo params.
 * Defence snapshots remain in raw editable coordinates, so this deliberately
 * copies rather than normalizes them at the feature-state boundary.
 */
export function cloneAttackSideSnapshot(
  side: 'action' | 'reaction',
  snapshot: AttackDraft | DefenceDraft,
): {
  score: ScoreDraft
  damage: ActionDamageDraft | DefenceDamageDraft
  mode?: ReactionMode
} {
  if (side === 'action') {
    return createAttackInputSnapshot(snapshot)
  }
  if (side === 'reaction') {
    const defenceSnapshot = snapshot as DefenceDraft
    return {
      mode: defenceSnapshot.mode,
      score: { ...copyScoreDraft(defenceSnapshot.score) },
      damage: { ...copyDefenceDamageDraft(defenceSnapshot.damage) },
    }
  }
  throw new TypeError(`unsupported Attack side: ${side}`)
}

/**
 * Replace one combo side atomically and return the installed snapshot.
 */
export function replaceAttackSideSnapshot(
  params: { action: unknown; reaction: unknown },
  side: 'action' | 'reaction',
  snapshot: AttackDraft | DefenceDraft,
) {
  if (params === null || typeof params !== 'object') {
    throw new TypeError('Attack params must be an object')
  }
  const nextSnapshot = cloneAttackSideSnapshot(side, snapshot)
  params[side] = nextSnapshot
  return nextSnapshot
}
