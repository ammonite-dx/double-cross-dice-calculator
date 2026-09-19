import type {
  DefenceDamageInput,
  ReactionMode,
} from './CalculationInputs'
import type { ScoreResolution } from './ScoreResolution'
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

export function deriveEvasionScoreValue(
  dice: number,
  skill: number,
  label = 'evasion.score',
): number {
  // Do the arithmetic in BigInt.  Two individually safe operands can have an
  // unsafe intermediate product while their mathematical sum is safe.
  const converted = BigInt(dice) * 2n + BigInt(skill)
  const min = BigInt(Number.MIN_SAFE_INTEGER)
  const max = BigInt(Number.MAX_SAFE_INTEGER)
  if (converted < min || converted > max) {
    throw new RangeError(`${label} exceeds the safe integer range`)
  }
  return Math.max(0, Number(converted))
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
  readonly score: ScoreResolution
  readonly damage: DefenceDamageInput
}

function normalizeReactionScore(
  input: unknown,
  label: string,
): ScoreResolution {
  const source = object(input, label)
  const dice = assertNonNegativeSafeInteger(source.dice, `${label}.dice`)
  const skill = assertSafeInteger(source.skill ?? 0, `${label}.skill`)
  return {
    kind: 'fixed-score',
    value: deriveEvasionScoreValue(dice, skill, `${label}.skill`),
  }
}

export function normalizeReactionResolution(
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
    ? {
        kind: 'rolled-score' as const,
        params: normalizeScoreInput(source.score, `${label}.score`),
      }
    : normalizedMode === EVASION_MODE
      ? normalizeReactionScore(source.score, `${label}.score`)
      : { kind: 'forced-failure' as const }

  return {
    mode: normalizedMode,
    score,
    damage: normalizeDefenceDamageInput(source.damage, `${label}.damage`),
  }
}

/**
 * Legacy-shaped reaction snapshot for callers that still consume a score
 * coordinate object directly. Production CalculationClient code uses the
 * resolution-shaped normalizer below instead.
 */
export function normalizeReactionInput(input: unknown, label = 'reaction') {
  const normalized = normalizeReactionResolution(input, label)
  const score = normalized.score.kind === 'rolled-score'
    ? normalized.score.params
    : normalized.score.kind === 'fixed-score'
      ? {
          dice: 0,
          critical: 10,
          skill: normalized.score.value,
          yousei: 0,
          shihai: 0,
        }
      : {
          dice: 0,
          critical: 10,
          skill: 0,
          yousei: 0,
          shihai: 0,
        }
  return {
    mode: normalized.mode,
    score,
    damage: normalized.damage,
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
  readonly score: ScoreResolution
  readonly damage: NormalizedAttackDamageInput
} {
  const source = object(input, label)
  return {
    score: {
      kind: 'rolled-score',
      params: normalizeScoreInput(source.score, `${label}.score`),
    },
    damage: normalizeAttackDamageInput(source.damage, `${label}.damage`),
  }
}

export function normalizeAttackCalculationInput(
  input: unknown,
  label = 'attack',
): {
  readonly action: {
    readonly score: ScoreResolution
    readonly damage: NormalizedAttackDamageInput
  }
  readonly reaction: NormalizedReactionInput
} {
  const source = object(input, label)
  return {
    action: normalizeAttackInput(source.action, `${label}.action`),
    reaction: normalizeReactionResolution(source.reaction, `${label}.reaction`),
  }
}

export type NormalizedBacktrackInput = BacktrackParams &
  NormalizedBacktrackParams
