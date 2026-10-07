import type { CheckCalculationResult } from '../../../runtime/CalculationClientTypes'
import type {
  CheckCalculationInput,
} from '../../../domain/CalculationInputs'
import { snapshotCheckCalculationInput } from './CheckInputSnapshot'

export interface CheckCalculationRecord {
  readonly input: CheckCalculationInput
  readonly result: CheckCalculationResult
}

function freezeInput(input: CheckCalculationInput): CheckCalculationInput {
  const snapshot = snapshotCheckCalculationInput(input)
  if (snapshot.kind === 'opposed') {
    return Object.freeze({
      kind: 'opposed',
      action: Object.freeze({ ...snapshot.action }),
      reaction: Object.freeze({ ...snapshot.reaction }),
    })
  }
  return Object.freeze({
    kind: 'fixed',
    action: Object.freeze({ ...snapshot.action }),
    target: snapshot.target,
  })
}

/**
 * Owns one validated Check calculation. The input is copied at this boundary
 * so a record never aliases mutable form state; the result remains owned by
 * the calculation client contract.
 */
export function createCheckCalculationRecord(
  input: CheckCalculationInput,
  result: CheckCalculationResult,
): CheckCalculationRecord {
  if (input.kind !== result.kind) {
    throw new TypeError('Check calculation input and result kinds must match')
  }
  return Object.freeze({
    input: freezeInput(input),
    result,
  })
}

function scoresEqual(
  left: CheckCalculationInput['action'],
  right: CheckCalculationInput['action'],
) {
  return Object.keys(left).every((field) =>
    Object.is(left[field as keyof typeof left], right[field as keyof typeof right])
  )
}

/**
 * Compare only calculation inputs. Display requests and presentation state
 * are intentionally outside this identity.
 */
export function areCheckCalculationInputsEqual(
  left: CheckCalculationInput | null | undefined,
  right: CheckCalculationInput | null | undefined,
): boolean {
  if (left === null || left === undefined || right === null || right === undefined) {
    return false
  }
  if (left.kind !== right.kind || !scoresEqual(left.action, right.action)) {
    return false
  }
  return left.kind === 'fixed'
    ? right.kind === 'fixed' && Object.is(left.target, right.target)
    : right.kind === 'opposed' && scoresEqual(left.reaction, right.reaction)
}
