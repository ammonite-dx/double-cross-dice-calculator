import type { CalculationRangePlan } from '../../../calculation/planning/RangePlannerTypes'
import type { CalculationFeedbackState } from '../../../runtime/CalculationFeedbackTypes'
import type { DisplayFeedbackPlan } from '../../../shared/presentation/DistributionProjectionTypes'
import type { AttackCombo } from './AttackComboState'
import type {
  AttackDisplayPresentation,
  AttackBatchResult,
  AttackRangePlanReference,
  AttackPresentation,
} from './AttackPresentationTypes'
import type {
  AttackTotalCalculationRecord,
} from './AttackCalculationRecord'
import type {
  AttackCommittedRecord,
  AttackExecutionEntry,
} from './AttackIncrementalExecutionTypes'

/** Reactive state owned by the Attack feature model. */
export interface AttackState {
  combos: AttackCombo[]
  totalCalculation: AttackTotalCalculationRecord | null
  basePresentation: AttackPresentation | null
  displayPresentation: AttackDisplayPresentation | null
  feedback: CalculationFeedbackState<CalculationRangePlan>
  scoreDisplayFeedback: CalculationFeedbackState<DisplayFeedbackPlan>
  displayFeedback: CalculationFeedbackState<DisplayFeedbackPlan>
}

/**
 * A read-only view reconstructed from the committed calculation records.
 * Presentation code must use this value instead of a runner-local batch
 * cache so that a refresh remains possible after the runner has been
 * interrupted or its presentation attempt has failed.
 */
export interface AttackCommittedCalculationSnapshot {
  readonly entries: readonly AttackExecutionEntry[]
  readonly records: readonly AttackCommittedRecord[]
  readonly rangePlans: readonly AttackRangePlanReference[]
  readonly totalCalculation: AttackTotalCalculationRecord
  readonly batchResult: AttackBatchResult
}

export type AttackStateSeed = Omit<AttackState, 'combos'>
