import type { CalculationRangePlan } from '../../../calculation/planning/RangePlannerTypes'
import type { CalculationFeedbackState } from '../../../runtime/CalculationFeedbackTypes'
import type { DisplayFeedbackPlan } from '../../../shared/presentation/DistributionProjectionTypes'
import type { AttackTotalCalculationRecord } from './AttackCalculationRecord'
import type { AttackCombo } from './AttackComboState'
import type {
  AttackDisplayPresentation,
  AttackPresentation,
} from './AttackPresentationTypes'

/** Reactive state owned by the Attack feature model. */
export interface AttackState {
  combos: AttackCombo[]
  totalCalculation: AttackTotalCalculationRecord | null
  basePresentation: AttackPresentation | null
  displayPresentation: AttackDisplayPresentation | null
  generation: number
  feedback: CalculationFeedbackState<CalculationRangePlan>
  scoreDisplayFeedback: CalculationFeedbackState<DisplayFeedbackPlan>
  displayFeedback: CalculationFeedbackState<DisplayFeedbackPlan>
}

