import type { CheckCalculationResult } from '../../../runtime/CalculationClientTypes'
import type {
  CheckInputSnapshot,
  ScoreInput,
} from '../../../domain/CalculationInputs'
import { createCheckInputSnapshot } from './CheckInputSnapshot'

export interface CheckCalculationRecord {
  readonly input: CheckInputSnapshot
  readonly result: CheckCalculationResult
}

function freezeInput(input: CheckInputSnapshot): CheckInputSnapshot {
  return Object.freeze({
    difficulty: Object.freeze({ ...input.difficulty }),
    params: Object.freeze({
      action: Object.freeze({ ...input.params.action }),
      reaction: Object.freeze({ ...input.params.reaction }),
    }),
  })
}

/**
 * Owns one validated Check calculation. The input is copied at this boundary
 * so a record never aliases mutable form state; the result remains owned by
 * the calculation client contract.
 */
export function createCheckCalculationRecord(
  input: CheckInputSnapshot,
  result: CheckCalculationResult,
): CheckCalculationRecord {
  const snapshot = createCheckInputSnapshot(input)
  return Object.freeze({
    input: freezeInput(snapshot),
    result,
  })
}

const SCORE_FIELDS: readonly (keyof ScoreInput)[] = Object.freeze([
  'dice',
  'critical',
  'skill',
  'yousei',
  'shihai',
])

function scoreInputsEqual(left: Partial<ScoreInput>, right: Partial<ScoreInput>) {
  return SCORE_FIELDS.every((field) => Object.is(left[field], right[field]))
}

/**
 * Compare only calculation inputs. Display requests and presentation state
 * are intentionally outside this identity.
 */
export function areCheckCalculationInputsEqual(
  left: CheckInputSnapshot | null | undefined,
  right: CheckInputSnapshot | null | undefined,
): boolean {
  if (left === null || left === undefined || right === null || right === undefined) {
    return false
  }
  return Object.is(left.difficulty.opposed, right.difficulty.opposed)
    && Object.is(left.difficulty.target, right.difficulty.target)
    && scoreInputsEqual(left.params.action, right.params.action)
    && scoreInputsEqual(left.params.reaction, right.params.reaction)
}
