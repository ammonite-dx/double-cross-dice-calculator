import type { ComputedRef } from 'vue'

import type { CalculationRangePlan } from '../../../calculation/planning/RangePlannerTypes'
import type { DisplayRequestSnapshot } from '../../../domain/CalculationInputs'
import type { CalculationFeedbackState } from '../../../runtime/CalculationFeedbackTypes'
import type { DisplayFeedbackPlan } from '../../../shared/presentation/DistributionProjectionTypes'
import type { AttackAdvancedSettingsChange } from './AttackAdvancedSettings'
import type { AttackComboParams, AttackComboSide } from './AttackComboState'
import type {
  AttackDisplayPresentation,
  AttackScoreDisplayBatchPresentation,
} from './AttackPresentationTypes'

export interface AttackUiCombo {
  readonly id: number | string
  readonly name: string
  readonly show: boolean
  readonly advancedSettingsEnabled: Readonly<{
    action: boolean
    reaction: boolean
  }>
  readonly params: AttackComboParams
}

export type ComboSideValidation =
  | {
      readonly id: number | string
      readonly side: 'action'
      readonly snapshot: AttackComboParams['action']
    }
  | {
      readonly id: number | string
      readonly side: 'reaction'
      readonly snapshot: AttackComboParams['reaction']
    }

/** Public state and actions exposed by the Attack feature controller. */
export interface AttackController {
  readonly combos: ComputedRef<AttackUiCombo[]>
  readonly displayRequest: DisplayRequestSnapshot
  readonly scoreDisplayRequest: DisplayRequestSnapshot
  readonly displayPresentation: ComputedRef<AttackDisplayPresentation | null>
  readonly scoreDisplayPresentation: ComputedRef<AttackScoreDisplayBatchPresentation | null>
  readonly displayFeedback: ComputedRef<CalculationFeedbackState<DisplayFeedbackPlan>>
  readonly scoreDisplayFeedback: ComputedRef<CalculationFeedbackState<DisplayFeedbackPlan>>
  readonly summaryReady: ComputedRef<boolean>
  readonly feedbackNotice: ComputedRef<CalculationFeedbackState<CalculationRangePlan>>
  readonly onDisplayValidated: (request: DisplayRequestSnapshot) => void
  readonly onScoreDisplayValidated: (request: DisplayRequestSnapshot) => void
  readonly addCombo: () => void
  readonly duplicateCombo: (id: number | string) => void
  readonly removeCombo: (id: number | string) => void
  readonly onComboNameChanged: (change: {
    id: number | string
    name: string
  }) => void
  readonly onComboVisibilityChanged: (change: {
    id: number | string
    show: boolean
  }) => void
  readonly onComboAdvancedSettingsChanged: (
    change: AttackAdvancedSettingsChange,
  ) => void
  readonly onComboSideValidated: (change: ComboSideValidation) => void
  readonly dispose: () => void
}

export type { AttackComboSide }
