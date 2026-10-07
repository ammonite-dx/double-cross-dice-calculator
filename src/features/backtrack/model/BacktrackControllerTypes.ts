import type { Ref } from 'vue'

import type { BacktrackCalculationRangePlan } from '../../../calculation/planning/RangePlannerTypes'
import type { BacktrackParams } from '../../../domain/BacktrackRules'
import type { CalculationFeedbackState } from '../../../runtime/CalculationFeedbackTypes'
import type { BacktrackPresentation } from './BacktrackPresentation'
import type { DraftValidation } from '../../../shared/validation/DraftValidation'

export interface BacktrackState {
  params: Partial<BacktrackParams>
  presentation: BacktrackPresentation | null
  resultReady: boolean
  rangeFeedback: CalculationFeedbackState<BacktrackCalculationRangePlan>
}

/** Public state and actions exposed by the Backtrack feature controller. */
export interface BacktrackController {
  readonly params: Ref<Partial<BacktrackParams>>
  readonly presentation: Ref<BacktrackPresentation | null>
  readonly resultReady: Ref<boolean>
  readonly rangeFeedback: Ref<CalculationFeedbackState<BacktrackCalculationRangePlan>>
  readonly onValidationState: (
    state: DraftValidation<Partial<BacktrackParams>>,
  ) => void
}
