import type { ComputedRef, Ref } from 'vue'

import type { CheckCalculationRangePlan } from '../../../calculation/planning/RangePlannerTypes'
import type { DifficultyInput, DisplayRequestSnapshot, ScoreInput } from '../../../domain/CalculationInputs'
import type { CheckCalculationResult } from '../../../runtime/CalculationClientTypes'
import type { CalculationFeedbackState } from '../../../runtime/CalculationFeedbackTypes'
import type { DisplayFeedbackPlan } from '../../../shared/presentation/DistributionProjectionTypes'
import type { CheckCalculationRecord } from './CheckCalculationRecord'
import type {
  CheckAdvancedSettingsChange,
  CheckAdvancedSettingsEnabled,
  CheckScoreSide,
} from './CheckAdvancedSettings'
import type { CheckPresentation } from './CheckPresentationTypes'
import type { DraftValidation } from '../../../shared/validation/DraftValidation'

export interface CheckScoreParams {
  action: Partial<ScoreInput>
  reaction: Partial<ScoreInput>
}

/** Public state and actions exposed by the Check feature controller. */
export interface CheckController {
  readonly difficulty: Ref<DifficultyInput>
  readonly scoreParams: Ref<CheckScoreParams>
  readonly advancedSettingsEnabled: Ref<CheckAdvancedSettingsEnabled>
  readonly calculationRecord: ComputedRef<CheckCalculationRecord | null>
  readonly score: ComputedRef<CheckCalculationResult['score'] | null>
  readonly scoreStatistics: ComputedRef<CheckCalculationResult['scoreStatistics'] | null>
  readonly resultReady: ComputedRef<boolean>
  readonly displayRequest: Ref<DisplayRequestSnapshot>
  readonly presentation: ComputedRef<CheckPresentation | null>
  readonly rangeFeedback: Ref<CalculationFeedbackState<CheckCalculationRangePlan>>
  readonly displayFeedback: Ref<CalculationFeedbackState<DisplayFeedbackPlan>>
  readonly onDifficultyValidationState: (
    state: DraftValidation<DifficultyInput>,
  ) => void
  readonly onScoreValidationState: (payload: {
    side: CheckScoreSide
    state: DraftValidation<Partial<ScoreInput>>
  }) => void
  readonly onAdvancedSettingsChanged: (
    change: CheckAdvancedSettingsChange,
  ) => void
  readonly onDisplayValidated: (request: DisplayRequestSnapshot) => void
}
