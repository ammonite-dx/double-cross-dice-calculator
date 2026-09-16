import { onMounted, onUnmounted, reactive, toRefs } from 'vue'

import {
  createCalculationFeedbackState,
} from '../../../runtime/CalculationFeedback'
import type { CalculationClient } from '../../../runtime/CalculationClientTypes'
import type { CalculationFeedbackState } from '../../../runtime/CalculationFeedbackTypes'
import type { BacktrackCalculationRangePlan } from '../../../calculation/planning/RangePlannerTypes'
import type { BacktrackParams } from '../../../domain/BacktrackRules'
import { INPUT_DOMAIN } from '../../../domain/InputDomain'
import {
  createBacktrackRunner,
} from './BacktrackCalculationRunner'
import {
  createBacktrackInputSnapshot,
} from './BacktrackInputSnapshot'

interface BacktrackChartData {
  single: readonly number[]
  double: readonly number[]
  second: readonly number[]
}

interface BacktrackState {
  params: Partial<BacktrackParams>
  finalEncroachment: BacktrackChartData | null
  resultReady: boolean
  rangeFeedback: CalculationFeedbackState<BacktrackCalculationRangePlan>
}

const INITIAL_PARAMS: Partial<BacktrackParams> = {
  encroachment: 100,
  lois: INPUT_DOMAIN.remainingLois.max,
  elois: 0,
  dice: 0,
  value: 0,
  dlois: 'なし',
}

export interface UseBacktrackOptions {
  calculationClient: CalculationClient
}

export function useBacktrack({
  calculationClient,
}: UseBacktrackOptions) {
  const initialSnapshot = createBacktrackInputSnapshot({
    params: INITIAL_PARAMS,
  })
  const rangeFeedback = reactive(
    createCalculationFeedbackState()
  ) as CalculationFeedbackState<BacktrackCalculationRangePlan>
  const state = reactive<BacktrackState>({
    params: { ...initialSnapshot.params },
    finalEncroachment: null,
    resultReady: false,
    rangeFeedback,
  })

  const calculationRunner = createBacktrackRunner({
    state,
    feedback: rangeFeedback,
    calculationClient,
    onError: (error: unknown) => {
      console.error('Failed to update backtrack', error)
    },
  })

  const onValidated = (params: Partial<BacktrackParams>) => {
    const snapshot = createBacktrackInputSnapshot({ params })
    state.params = { ...snapshot.params }
    void calculationRunner.run(snapshot)
  }

  onMounted(() => {
    void calculationRunner.run(initialSnapshot)
  })
  onUnmounted(() => calculationRunner.dispose())

  const stateRefs = toRefs(state)
  return {
    params: stateRefs.params,
    finalEncroachment: stateRefs.finalEncroachment,
    resultReady: stateRefs.resultReady,
    rangeFeedback: stateRefs.rangeFeedback,
    onValidated,
  }
}
