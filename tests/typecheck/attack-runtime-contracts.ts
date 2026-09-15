import { createAttackRunner } from '../../src/features/attack/model/AttackRunner'
import {
  executeAttackIncrementally,
  planAttackExecution,
} from '../../src/features/attack/model/AttackIncrementalExecution'
import type {
  AttackIncrementalExecutionRequest,
  AttackExecutionPlanItem,
} from '../../src/features/attack/model/AttackIncrementalExecutionTypes'
import type {
  AttackRunner,
  AttackRunnerOptions,
} from '../../src/features/attack/model/AttackRunnerTypes'
import type { ComboSideValidation } from '../../src/features/attack/model/useAttack'
import type { AttackComboParams } from '../../src/features/attack/model/AttackComboState'

declare const runnerOptions: AttackRunnerOptions
declare const request: AttackIncrementalExecutionRequest
declare const comboParams: AttackComboParams

const runner: AttackRunner = createAttackRunner(runnerOptions)
const execution = executeAttackIncrementally(request)
const plan: readonly AttackExecutionPlanItem[] = planAttackExecution(
  request.entries,
  request.committedRecords ?? [],
)

runner.run({ forceAll: true })
execution.then((result) => result.batchResult.combos[0]?.damage)
plan[0]?.action

// The execution plan is deliberately a two-state discriminated union.
const invalidPlanItem: AttackExecutionPlanItem = {
  id: 'invalid',
  entry: request.entries[0],
  // @ts-expect-error: unknown execution actions must not enter the coordinator.
  action: 'skip',
  record: null,
}

void invalidPlanItem

const actionValidation: ComboSideValidation = {
  id: 'action',
  side: 'action',
  snapshot: comboParams.action,
}
const reactionValidation: ComboSideValidation = {
  id: 'reaction',
  side: 'reaction',
  snapshot: comboParams.reaction,
}

// The side discriminator must keep the validated snapshot on the same side.
// @ts-expect-error: reaction snapshots must not be accepted for action events.
const invalidSideValidation: ComboSideValidation = {
  id: 'mismatch',
  side: 'action',
  snapshot: comboParams.reaction,
}

void actionValidation
void reactionValidation
void invalidSideValidation
