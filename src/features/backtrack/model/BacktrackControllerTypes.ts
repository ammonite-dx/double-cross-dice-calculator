import type { Ref } from 'vue'

import type { BacktrackCalculationRangePlan } from '../../../calculation/planning/RangePlannerTypes'
import type { BacktrackParams } from '../../../domain/BacktrackRules'
import type { CalculationFeedbackState } from '../../../runtime/CalculationFeedbackTypes'

export interface BacktrackChartData {
  readonly single: readonly number[]
  readonly double: readonly number[]
  readonly second: readonly number[]
}

/** Public state and actions exposed by the Backtrack feature controller. */
export interface BacktrackController {
  readonly params: Ref<Partial<BacktrackParams>>
  readonly finalEncroachment: Ref<BacktrackChartData | null>
  readonly resultReady: Ref<boolean>
  readonly rangeFeedback: Ref<CalculationFeedbackState<BacktrackCalculationRangePlan>>
  readonly onValidated: (params: Partial<BacktrackParams>) => void
}
