import type {
  AttackCalculationInput,
} from '../../../domain/CalculationInputs'
import type {
  AttackCalculationResult,
  DamageEnvelope,
  TotalDamageResult,
} from '../../../calculation/DistributionResultTypes'

export interface AttackCalculationRecord {
  readonly input: AttackCalculationInput
  readonly result: AttackCalculationResult
  readonly rangePlan: unknown
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

function snapshotScore(score: Record<string, unknown>) {
  return {
    dice: score.dice,
    critical: score.critical,
    skill: score.skill,
    yousei: score.yousei,
    shihai: score.shihai,
  }
}

function snapshotDamage(damage: Record<string, unknown>, kazanari: boolean) {
  return {
    dice: damage.dice,
    value: damage.value,
    ...(kazanari ? { kazanari: damage.kazanari } : {}),
  }
}

function snapshotInput(input: AttackCalculationInput): AttackCalculationInput {
  return deepFreeze({
    action: {
      score: snapshotScore(input.action.score as unknown as Record<string, unknown>),
      damage: snapshotDamage(
        input.action.damage as unknown as Record<string, unknown>,
        true
      ),
    },
    reaction: {
      mode: input.reaction.mode,
      score: snapshotScore(input.reaction.score as unknown as Record<string, unknown>),
      damage: snapshotDamage(
        input.reaction.damage as unknown as Record<string, unknown>,
        false
      ),
    },
  }) as AttackCalculationInput
}

export function createAttackCalculationRecord(
  input: AttackCalculationInput,
  result: AttackCalculationResult,
  rangePlan: unknown,
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
