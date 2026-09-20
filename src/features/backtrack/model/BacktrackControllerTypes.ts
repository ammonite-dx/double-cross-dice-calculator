import type { Ref } from 'vue'

import type { BacktrackCalculationRangePlan } from '../../../calculation/planning/RangePlannerTypes'
import type { BacktrackParams } from '../../../domain/BacktrackRules'
import type { CalculationFeedbackState } from '../../../runtime/CalculationFeedbackTypes'
import type { BacktrackPresentation } from './BacktrackPresentation'

/** Public state and actions exposed by the Backtrack feature controller. */
export interface BacktrackController {
  readonly params: Ref<Partial<BacktrackParams>>
  readonly presentation: Ref<BacktrackPresentation | null>
  readonly resultReady: Ref<boolean>
  readonly rangeFeedback: Ref<CalculationFeedbackState<BacktrackCalculationRangePlan>>
  readonly onValidated: (params: Partial<BacktrackParams>) => void
}
