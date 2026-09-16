import type {
  AttackCalculationInput,
  DamageInput,
  DefenceDamageInput,
  DifficultyInput,
  ReactionMode,
} from './CalculationInputs'
import type { BacktrackParams } from './BacktrackRules'
import {
  assertCriticalValue,
  assertNonNegativeSafeInteger,
  assertRemainingLois,
  assertSafeInteger,
} from './InputDomain'

const DODGE_MODE: ReactionMode = 'ドッジ'
const EVASION_MODE: ReactionMode = '《イベイジョン》'
const GUARD_MODE: ReactionMode = 'ガード・リアクション放棄'

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function safeDoubledSkill(dice: number, skill: number, label: string): number {
  const converted = dice * 2 + skill
  if (!Number.isSafeInteger(converted)) {
    throw new RangeError(`${label} exceeds the safe integer range`)
  }
  return converted
}

export interface NormalizedScoreInput {
  readonly dice: number
  readonly critical: number
  readonly skill: number
  readonly yousei: number
  readonly shihai: number
}

/** Normalize a score while leaving feature compatibility to its own policy. */
export function normalizeScoreInput(
  input: unknown,
  label = 'score',
): NormalizedScoreInput {
  const source = object(input, label)
  return {
    dice: assertNonNegativeSafeInteger(source.dice, `${label}.dice`),
    critical: assertCriticalValue(source.critical, `${label}.critical`),
    skill: assertSafeInteger(source.skill ?? 0, `${label}.skill`),
    yousei: assertNonNegativeSafeInteger(
      source.yousei ?? 0,
      `${label}.yousei`,
    ),
    shihai: assertNonNegativeSafeInteger(
      source.shihai ?? 0,
      `${label}.shihai`,
    ),
  }
}

export interface NormalizedDifficultyInput {
  readonly opposed: boolean
  readonly target: number
}

export function normalizeDifficultyInput(
  input: unknown = {},
  label = 'difficulty',
): NormalizedDifficultyInput {
  // The legacy CalculationClient passed an omitted difficulty object as an
  // empty object to getScoreStatistics(), which means a fixed difficulty of
  // zero. Preserve that behavior while rejecting explicitly supplied values
  // of the wrong type at the public runtime boundary.
  const source = input === undefined ? {} : object(input, label)
  const opposed = source.opposed === undefined ? false : source.opposed
  if (typeof opposed !== 'boolean') {
    throw new TypeError(`${label}.opposed must be boolean`)
  }
  const target = source.target === undefined ? 0 : source.target
  return {
    opposed,
    target: assertNonNegativeSafeInteger(target, `${label}.target`),
  }
}

export interface NormalizedAttackDamageInput {
  readonly dice: number
  readonly value: number
  readonly kazanari: number
}

export function normalizeAttackDamageInput(
  input: unknown,
  label = 'attack',
): NormalizedAttackDamageInput {
  const source = object(input, label)
  return {
    dice: assertNonNegativeSafeInteger(source.dice, `${label}.dice`),
    value: assertSafeInteger(source.value, `${label}.value`),
    kazanari: assertNonNegativeSafeInteger(
      source.kazanari ?? 0,
      `${label}.kazanari`,
    ),
  }
}

export function normalizeDefenceDamageInput(
  input: unknown,
  label = 'defence',
): DefenceDamageInput {
  const source = object(input, label)
  return {
    dice: assertNonNegativeSafeInteger(source.dice, `${label}.dice`),
    value: assertSafeInteger(source.value, `${label}.value`),
  }
}

export interface NormalizedReactionInput {
  readonly mode: ReactionMode
  readonly score: NormalizedScoreInput
  readonly damage: DefenceDamageInput
}

function normalizeEvasionScore(
  input: unknown,
  label: string,
): NormalizedScoreInput {
  const source = object(input, label)
  const dice = assertNonNegativeSafeInteger(source.dice, `${label}.dice`)
  const skill = assertSafeInteger(source.skill ?? 0, `${label}.skill`)

  // A canonical evasion score has no remaining dice and explicitly carries
  // the critical-10 coordinate. Raw UI input omits critical and may retain
  // the previous score's value, so only this complete marker selects the
  // idempotent path.
  if (
    dice === 0
    && source.critical === 10
    && (source.yousei ?? 0) === 0
    && (source.shihai ?? 0) === 0
  ) {
    return normalizeScoreInput(source, label)
  }

  return {
    dice: 0,
    critical: 10,
    skill: safeDoubledSkill(dice, skill, `${label}.skill`),
    yousei: 0,
    shihai: 0,
  }
}

export function normalizeReactionInput(
  input: unknown,
  label = 'reaction',
): NormalizedReactionInput {
  const source = object(input, label)
  const mode = source.mode
  if (mode !== DODGE_MODE && mode !== EVASION_MODE && mode !== GUARD_MODE) {
    throw new RangeError(`${label}.mode is not supported`)
  }
  const normalizedMode = mode as ReactionMode

  const score = normalizedMode === DODGE_MODE
    ? normalizeScoreInput(source.score, `${label}.score`)
    : normalizedMode === EVASION_MODE
      ? normalizeEvasionScore(source.score, `${label}.score`)
      : {
          dice: 0,
          critical: 10,
          skill: 0,
          yousei: 0,
          shihai: 0,
        }

  return {
    mode: normalizedMode,
    score,
    damage: normalizeDefenceDamageInput(source.damage, `${label}.damage`),
  }
}

export interface NormalizedBacktrackParams {
  readonly encroachment: number
  readonly lois: number
  readonly elois: number
  readonly dice: number
  readonly value: number
  readonly dlois: string
}

export function normalizeBacktrackParams(
  input: unknown = {},
  label = 'backtrack',
): NormalizedBacktrackParams {
  const source = object(input, label)
  const dlois = source.dlois ?? 'なし'
  if (typeof dlois !== 'string') {
    throw new TypeError(`${label}.dlois must be a string`)
  }
  return {
    encroachment: assertSafeInteger(
      source.encroachment ?? 0,
      `${label}.encroachment`,
    ),
    lois: assertRemainingLois(source.lois ?? 0, `${label}.lois`),
    elois: assertNonNegativeSafeInteger(
      source.elois ?? 0,
      `${label}.elois`,
    ),
    dice: assertNonNegativeSafeInteger(source.dice ?? 0, `${label}.dice`),
    value: assertNonNegativeSafeInteger(source.value ?? 0, `${label}.value`),
    dlois,
  }
}

export function normalizeAttackInput(
  input: unknown,
  label = 'action',
): {
  readonly score: NormalizedScoreInput
  readonly damage: NormalizedAttackDamageInput
} {
  const source = object(input, label)
  return {
    score: normalizeScoreInput(source.score, `${label}.score`),
    damage: normalizeAttackDamageInput(source.damage, `${label}.damage`),
  }
}

export function normalizeAttackCalculationInput(
  input: unknown,
  label = 'attack',
): AttackCalculationInput {
  const source = object(input, label)
  return {
    action: normalizeAttackInput(source.action, `${label}.action`),
    reaction: normalizeReactionInput(source.reaction, `${label}.reaction`),
  }
}

export type NormalizedBacktrackInput = BacktrackParams &
  NormalizedBacktrackParams
