import type {
  AttackCalculationInput,
} from '../../../domain/CalculationInputs'
import type {
  AttackCalculationResult,
  TotalDamageResult,
} from '../../../domain/CalculationResultTypes'
import type { DamageEnvelope } from '../../../domain/DamageResultTypes'
import type { AttackRangePlanReference } from './AttackPresentationTypes'

export interface AttackCalculationRecord {
  readonly input: AttackCalculationInput
  readonly result: AttackCalculationResult
  readonly rangePlan: AttackRangePlanReference
}

export interface AttackTotalCalculationRecord {
  readonly sources: readonly {
    readonly id: string | number
    readonly record: AttackCalculationRecord
  }[]
  readonly result: TotalDamageResult
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object') {
    return value
  }
  const object = value as object
  if (seen.has(object)) {
    return value
  }
  seen.add(object)
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen)
  }
  return Object.freeze(value)
}

function snapshotScore(
  score: AttackCalculationInput['action']['score'],
): AttackCalculationInput['action']['score'] {
  return {
    dice: score.dice,
    critical: score.critical,
    skill: score.skill,
    yousei: score.yousei,
    shihai: score.shihai,
  }
}

function snapshotActionDamage(
  damage: AttackCalculationInput['action']['damage'],
): AttackCalculationInput['action']['damage'] {
  return {
    dice: damage.dice,
    value: damage.value,
    kazanari: damage.kazanari,
  }
}

function snapshotReactionDamage(
  damage: AttackCalculationInput['reaction']['damage'],
): AttackCalculationInput['reaction']['damage'] {
  return {
    dice: damage.dice,
    value: damage.value,
  }
}

function snapshotInput(input: AttackCalculationInput): AttackCalculationInput {
  const snapshot: AttackCalculationInput = {
    action: {
      score: snapshotScore(input.action.score),
      damage: snapshotActionDamage(input.action.damage),
    },
    reaction: {
      mode: input.reaction.mode,
      score: snapshotScore(input.reaction.score),
      damage: snapshotReactionDamage(input.reaction.damage),
    },
  }
  return deepFreeze(snapshot)
}

export function createAttackCalculationRecord(
  input: AttackCalculationInput,
  result: AttackCalculationResult,
  rangePlan: AttackRangePlanReference,
): AttackCalculationRecord {
  return Object.freeze({
    input: snapshotInput(input),
    result,
    rangePlan,
  })
}

export function createAttackTotalCalculationRecord(
  sources: readonly { id: string | number; record: AttackCalculationRecord }[],
  result: TotalDamageResult,
): AttackTotalCalculationRecord {
  const sourceSnapshot = sources.map(({ id, record }) =>
    Object.freeze({ id, record }))
  return Object.freeze({
    sources: Object.freeze(sourceSnapshot),
    result,
  })
}

export function areAttackCalculationInputsEqual(
  left: AttackCalculationInput | null | undefined,
  right: AttackCalculationInput | null | undefined,
): boolean {
  if (left === null || left === undefined || right === null || right === undefined) {
    return false
  }
  const scoreEqual = (a: unknown, b: unknown) => {
    if (a === null || typeof a !== 'object' || b === null || typeof b !== 'object') {
      return false
    }
    const leftScore = a as Record<string, unknown>
    const rightScore = b as Record<string, unknown>
    return ['dice', 'critical', 'skill', 'yousei', 'shihai']
      .every((key) => Object.is(leftScore[key], rightScore[key]))
  }
  const damageEqual = (a: unknown, b: unknown, includeKazanari: boolean) => {
    if (a === null || typeof a !== 'object' || b === null || typeof b !== 'object') {
      return false
    }
    const leftDamage = a as Record<string, unknown>
    const rightDamage = b as Record<string, unknown>
    const fields = includeKazanari
      ? ['dice', 'value', 'kazanari']
      : ['dice', 'value']
    return fields.every((key) => Object.is(leftDamage[key], rightDamage[key]))
  }
  return left.reaction.mode === right.reaction.mode
    && scoreEqual(left.action.score, right.action.score)
    && damageEqual(left.action.damage, right.action.damage, true)
    && scoreEqual(left.reaction.score, right.reaction.score)
    && damageEqual(left.reaction.damage, right.reaction.damage, false)
}

export type AttackCalculationDamageSource = {
  readonly id: string | number
  readonly record: AttackCalculationRecord
  readonly damage: DamageEnvelope
}
