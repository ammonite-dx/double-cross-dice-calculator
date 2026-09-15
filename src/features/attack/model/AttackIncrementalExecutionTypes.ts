import type { AttackCalculationOptions, CalculationClient } from '../../../runtime/CalculationClientTypes'
import type {
  AttackCalculationRangePlan,
  CalculationRangePlan,
} from '../../../calculation/planning/RangePlannerTypes'
import type { AttackCalculationRecord, AttackTotalCalculationRecord } from './AttackCalculationRecord'
import type { AttackComboParams } from './AttackComboState'
import type {
  AttackBatchResult,
  AttackRangePlanReference,
} from './AttackPresentationTypes'

export interface AttackExecutionEntry {
  readonly id: string | number
  readonly params: AttackComboParams
}

export interface AttackCommittedRecord {
  readonly id: string | number
  readonly record: AttackCalculationRecord
}

export type AttackExecutionAction = 'reuse' | 'calculate'

export interface AttackExecutionPlanItem {
  readonly id: string | number
  readonly entry: AttackExecutionEntry
  readonly action: AttackExecutionAction
  readonly record: AttackCalculationRecord | null
}

export interface AttackIncrementalExecutionRequest {
  readonly entries: readonly AttackExecutionEntry[]
  readonly committedRecords?: readonly AttackCommittedRecord[]
  readonly calculationClient: CalculationClient
  readonly options?: AttackCalculationOptions
  readonly onRangePlan?: (
    plan: CalculationRangePlan,
    context?: Readonly<{ entryId: string | number }>,
  ) => void
  readonly forceAll?: boolean
}

export interface AttackIncrementalExecution {
  readonly entries: readonly AttackExecutionEntry[]
  readonly records: readonly AttackCommittedRecord[]
  readonly rangePlans: readonly AttackRangePlanReference[]
  readonly totalCalculation: AttackTotalCalculationRecord
  readonly batchResult: AttackBatchResult
}

export type AttackCalculationRangePlanCallback = (
  plan: AttackCalculationRangePlan,
) => void

