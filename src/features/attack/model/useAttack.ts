import {
  computed,
  onMounted,
  onUnmounted,
  reactive,
  type ComputedRef,
} from 'vue'

import type { CalculationClient } from '../../../runtime/CalculationClientTypes'
import type { CalculationFeedbackState } from '../../../runtime/CalculationFeedbackTypes'
import type { CalculationRangePlan } from '../../../calculation/planning/RangePlannerTypes'
import type {
  AttackDisplayPresentation,
  AttackScoreDisplayBatchPresentation,
  AttackBatchResult,
  AttackRangePlanReference,
} from './AttackPresentationTypes'
import type {
  AttackRunnerCalculationRequest,
  AttackRunnerDisplayContext,
} from './AttackRunnerTypes'
import type { AttackState } from './AttackStateTypes'
import type {
  DisplayFeedbackPlan,
} from '../../../shared/presentation/DistributionProjectionTypes'
import { createAttackRunner } from './AttackRunner'
import {
  createAttackDisplayFeedback,
  createAttackScoreDisplayFeedback,
} from './AttackDisplayFeedback'
import {
  clearAttackState,
  createAttackState,
  ensureComboData,
  invalidateAttackComboCalculation,
  invalidateAttackTotalCalculation,
  isAttackCalculationReady,
} from './AttackState'
import { executeAttackIncrementally } from './AttackIncrementalExecution'
import { replaceAttackSideSnapshot } from './AttackInputSnapshot'
import {
  applyAttackAdvancedSettingsPolicy,
  hasAttackAdvancedSettingsValue,
} from './AttackAdvancedSettings'
import type { AttackAdvancedSettingsChange } from './AttackAdvancedSettings'
import {
  DEFAULT_ATTACK_DISPLAY_REQUEST,
  createAttackRangePolicy as createRawAttackRangePolicy,
  createAttackDisplayRequestSnapshot as createRawAttackDisplayRequestSnapshot,
} from './AttackDisplayRequestSnapshot'
import {
  createAttackPresentation,
  createAttackDisplayPresentation,
  createAttackDisplayPresentationFrom,
} from './AttackPresentation'
import {
  DEFAULT_DISPLAY_RANGE_PLANNER_POLICY,
  planDisplayWindowResources,
} from '../../../shared/presentation'
import type { DisplayRequestSnapshot } from '../../../domain/CalculationInputs'
import {
  cloneAttackCombo,
  createAttackCombo,
} from './AttackComboState'
import type {
  AttackController,
  AttackUiCombo,
  ComboSideValidation,
} from './AttackControllerTypes'

export type { AttackUiCombo, ComboSideValidation } from './AttackControllerTypes'

export interface UseAttackOptions {
  calculationClient: CalculationClient
}

const createAttackDisplayRequestSnapshot =
  createRawAttackDisplayRequestSnapshot

const createAttackRangePolicy = createRawAttackRangePolicy

function createState(): AttackState {
  return reactive({
    combos: [createAttackCombo(0)],
    ...createAttackState(),
  }) as AttackState
}

function toUiCombos(state: AttackState): AttackUiCombo[] {
  return state.combos.map((combo) => ({
    id: combo.id,
    name: combo.name,
    show: combo.show,
    advancedSettingsEnabled: {
      action: combo.advancedSettingsEnabled.action,
      reaction: combo.advancedSettingsEnabled.reaction,
    },
    params: combo.data.params,
  }))
}

export function useAttack({ calculationClient }: UseAttackOptions): AttackController {
  const client = calculationClient
  const supportsIncrementalExecution = client !== null
    && typeof client === 'object'
    && typeof client.calculateAttack === 'function'
    && typeof client.calculateTotalDamage === 'function'
  if (!supportsIncrementalExecution) {
    throw new TypeError('useAttack requires calculateAttack and calculateTotalDamage')
  }

  const displayRangePolicy = DEFAULT_DISPLAY_RANGE_PLANNER_POLICY
  const displayRequest = reactive(
    {
      ...createAttackDisplayRequestSnapshot(DEFAULT_ATTACK_DISPLAY_REQUEST),
    }
  ) as DisplayRequestSnapshot
  const scoreDisplayRequest = reactive(
    {
      ...createAttackDisplayRequestSnapshot(DEFAULT_ATTACK_DISPLAY_REQUEST),
    }
  ) as DisplayRequestSnapshot
  const state = createState()

  function publishDisplayFeedback(
    presentation: AttackDisplayPresentation | null,
    metadata: { scoreDisplaySuppressed?: boolean } = {},
  ) {
    Object.assign(
      state.displayFeedback,
      createAttackDisplayFeedback(presentation)
    )
    if (metadata.scoreDisplaySuppressed !== true) {
      const scorePresentation = presentation?.score ?? null
      Object.assign(
        state.scoreDisplayFeedback,
        createAttackScoreDisplayFeedback(scorePresentation)
      )
    }
  }

  function publishDisplayRejection(
    presentation: AttackDisplayPresentation | null
  ) {
    Object.assign(
      state.displayFeedback,
      createAttackDisplayFeedback(presentation)
    )
    state.scoreDisplayFeedback.status = 'idle'
    state.scoreDisplayFeedback.plan = null
    state.scoreDisplayFeedback.error = null
  }

  const calculationRunner = createAttackRunner({
    state,
    executeCalculation: ({
        entries,
        committedRecords,
        calculationOptions,
        signal,
        onRangePlan,
        scoreDisplayRequest,
        forceAll,
      }: AttackRunnerCalculationRequest) => executeAttackIncrementally({
        entries,
        committedRecords,
        calculationClient: client,
        options: {
          ...calculationOptions,
          signal,
          scoreDisplayRequest: scoreDisplayRequest ?? undefined,
        },
        onRangePlan,
        forceAll,
    }),
    createBasePresentation: (
      batchResult: AttackBatchResult,
      rangePlans: readonly AttackRangePlanReference[] = [],
    ) => createAttackPresentation(batchResult, rangePlans),
    createPresentation: (
      batchResult: AttackBatchResult,
      rangePlans: readonly AttackRangePlanReference[] = [],
      request?: DisplayRequestSnapshot,
      scoreRequest?: DisplayRequestSnapshot,
    ) => createAttackDisplayPresentation(batchResult, {
      displayRequest: request ?? createAttackDisplayRequestSnapshot(displayRequest),
      scoreDisplayRequest: scoreRequest
        ?? createAttackDisplayRequestSnapshot(scoreDisplayRequest),
      rangePlans,
      policy: displayRangePolicy,
    }),
    createDisplayPresentation: ({
      state: currentState,
      basePresentation,
      displayRequest: request,
      scoreDisplayRequest: scoreRequest,
    }: AttackRunnerDisplayContext) => {
      return createAttackDisplayPresentationFrom(
        (basePresentation ?? currentState.basePresentation)!,
        {
          displayRequest: request
            ?? createAttackDisplayRequestSnapshot(displayRequest),
          scoreDisplayRequest: scoreRequest
            ?? createAttackDisplayRequestSnapshot(scoreDisplayRequest),
          policy: displayRangePolicy,
        }
      )
    },
    onPresentation: publishDisplayFeedback,
    onDisplayRejected: publishDisplayRejection,
    onError: (error: unknown) => {
      state.displayPresentation = null
      state.displayFeedback.status = 'error'
      state.displayFeedback.plan = null
      state.displayFeedback.error = error
      console.error('Failed to update attack', error)
    },
  })

  function publishDisplayResourceRejection(plan: DisplayFeedbackPlan) {
    state.displayPresentation = null
    state.displayFeedback.status = 'rejected'
    state.displayFeedback.plan = plan
    state.displayFeedback.error = null
    state.scoreDisplayFeedback.status = 'idle'
    state.scoreDisplayFeedback.plan = null
    state.scoreDisplayFeedback.error = null
  }

  function clearDisplayPresentation() {
    state.displayPresentation = null
  }

  function publishDisplayError(error: unknown) {
    state.displayPresentation = null
    state.displayFeedback.status = 'error'
    state.displayFeedback.plan = null
    state.displayFeedback.error = error
    state.scoreDisplayFeedback.status = 'error'
    state.scoreDisplayFeedback.plan = null
    state.scoreDisplayFeedback.error = error
  }

  function publishScoreDisplayResourceRejection(plan: DisplayFeedbackPlan) {
    state.scoreDisplayFeedback.status = 'rejected'
    state.scoreDisplayFeedback.plan = plan
    state.scoreDisplayFeedback.error = null
  }

  function preflightDisplay(request: DisplayRequestSnapshot) {
    try {
      const plan = planDisplayWindowResources(
        { min: request.min, max: request.max },
        displayRangePolicy
      )
      if (!plan.accepted) {
        calculationRunner.invalidate()
        clearDisplayPresentation()
        publishDisplayResourceRejection(plan)
        return false
      }
      return true
    } catch (error) {
      calculationRunner.invalidate()
      clearDisplayPresentation()
      publishDisplayError(error)
      return false
    }
  }

  function preflightScoreDisplay(request: DisplayRequestSnapshot) {
    try {
      const plan = planDisplayWindowResources(
        { min: request.min, max: request.max },
        displayRangePolicy
      )
      if (!plan.accepted) {
        calculationRunner.invalidateScoreDisplay()
        publishScoreDisplayResourceRejection(plan)
        return false
      }
      return true
    } catch (error) {
      calculationRunner.invalidateScoreDisplay()
      state.scoreDisplayFeedback.status = 'error'
      state.scoreDisplayFeedback.plan = null
      state.scoreDisplayFeedback.error = error
      return false
    }
  }

  function runCalculation(
    request: DisplayRequestSnapshot = displayRequest,
    scoreRequest: DisplayRequestSnapshot = scoreDisplayRequest,
  ): Promise<boolean> {
    const snapshot = createAttackDisplayRequestSnapshot(request)
    const scoreSnapshot = createAttackDisplayRequestSnapshot(scoreRequest)
    if (!preflightDisplay(snapshot)) {
      return Promise.resolve(false)
    }
    const scoreDisplayReady = preflightScoreDisplay(scoreSnapshot)
    if (!scoreDisplayReady) {
      return calculationRunner.run({
        displayRequest: snapshot,
        rangePolicy: createAttackRangePolicy(snapshot),
      })
    }
    return calculationRunner.run({
      displayRequest: snapshot,
      scoreDisplayRequest: scoreSnapshot,
      rangePolicy: createAttackRangePolicy(snapshot, {}, scoreSnapshot),
    })
  }

  function findCombo(id: number | string) {
    return state.combos.find((combo) => combo.id === id) ?? null
  }

  let nextComboId = state.combos.reduce(
    (maximum, combo) => Math.max(maximum, Number(combo.id)),
    -1
  ) + 1

  function allocateComboId() {
    const id = nextComboId
    nextComboId += 1
    return id
  }

  function addCombo() {
    state.combos.push(createAttackCombo(allocateComboId()))
    invalidateAttackTotalCalculation(state)
    void runCalculation()
  }

  function duplicateCombo(id: number | string) {
    const source = findCombo(id)
    if (source === null) {
      return
    }
    state.combos.push(cloneAttackCombo(source, allocateComboId()))
    invalidateAttackTotalCalculation(state)
    void runCalculation()
  }

  function removeCombo(id: number | string) {
    const index = state.combos.findIndex((combo) => combo.id === id)
    if (index < 0) {
      return
    }
    state.combos.splice(index, 1)
    invalidateAttackTotalCalculation(state)
    void runCalculation()
  }

  function onComboNameChanged({ id, name }: { id: number | string; name: string }) {
    const combo = findCombo(id)
    if (combo !== null) {
      combo.name = name
    }
  }

  function onComboVisibilityChanged({
    id,
    show,
  }: { id: number | string; show: boolean }) {
    const combo = findCombo(id)
    if (combo !== null) {
      combo.show = show
    }
  }

  function onComboAdvancedSettingsChanged({
    id,
    side,
    enabled,
  }: AttackAdvancedSettingsChange) {
    if (side !== 'action' && side !== 'reaction') {
      return
    }
    const combo = findCombo(id)
    if (combo === null || combo.advancedSettingsEnabled[side] === enabled) {
      return
    }
    combo.advancedSettingsEnabled[side] = enabled
    const hasAdvancedValue = side === 'action'
      ? hasAttackAdvancedSettingsValue('action', combo.data.params.action)
      : hasAttackAdvancedSettingsValue('reaction', combo.data.params.reaction)
    if (enabled || !hasAdvancedValue) {
      return
    }

    const snapshot = side === 'action'
      ? applyAttackAdvancedSettingsPolicy(
        'action',
        combo.data.params.action,
        false
      )
      : applyAttackAdvancedSettingsPolicy(
        'reaction',
        combo.data.params.reaction,
        false
      )
    replaceAttackSideSnapshot(combo.data.params, side, snapshot)
    invalidateAttackComboCalculation(state, id)
    invalidateAttackTotalCalculation(state)
    void runCalculation()
  }

  function onComboSideValidated({ id, side, snapshot }: ComboSideValidation) {
    if (side !== 'action' && side !== 'reaction') {
      return
    }
    const combo = findCombo(id)
    if (combo === null) {
      return
    }
    // The UI sends a detached validated snapshot. The application snapshot
    // helper performs the second detached copy at the state boundary.
    const sanitizedSnapshot = side === 'action'
      ? applyAttackAdvancedSettingsPolicy(
        'action',
        snapshot,
        combo.advancedSettingsEnabled.action
      )
      : applyAttackAdvancedSettingsPolicy(
        'reaction',
        snapshot,
        combo.advancedSettingsEnabled.reaction
      )
    replaceAttackSideSnapshot(combo.data.params, side, sanitizedSnapshot)
    invalidateAttackComboCalculation(state, id)
    invalidateAttackTotalCalculation(state)
    void runCalculation()
  }

  function onDisplayValidated(request: DisplayRequestSnapshot) {
    const snapshot = createAttackDisplayRequestSnapshot(request)
    displayRequest.min = snapshot.min
    displayRequest.max = snapshot.max
    displayRequest.mode = snapshot.mode

    if (!preflightDisplay(snapshot)) {
      return
    }

    if (!isAttackCalculationReady(state)) {
      void runCalculation(snapshot)
      return
    }

    try {
      const scoreSnapshot = createAttackDisplayRequestSnapshot(
        scoreDisplayRequest
      )
      const scoreDisplayReady = preflightScoreDisplay(scoreSnapshot)
      const refreshed = calculationRunner.refreshPresentation({
        displayRequest: snapshot,
        scoreDisplayRequest: scoreSnapshot,
        calculationOptions: {
          rangePolicy: scoreDisplayReady
            ? createAttackRangePolicy(snapshot, {}, scoreSnapshot)
            : createAttackRangePolicy(snapshot),
        },
      })
      if (!refreshed) {
        state.displayPresentation = null
      }
    } catch (error) {
      publishDisplayError(error)
    }
  }

  function onScoreDisplayValidated(request: DisplayRequestSnapshot) {
    const snapshot = createAttackDisplayRequestSnapshot(request)
    scoreDisplayRequest.min = snapshot.min
    scoreDisplayRequest.max = snapshot.max
    scoreDisplayRequest.mode = snapshot.mode

    if (!preflightScoreDisplay(snapshot)) {
      return
    }

    if (!isAttackCalculationReady(state)) {
      void runCalculation(displayRequest, snapshot)
      return
    }

    try {
      const refreshed = calculationRunner.refreshPresentation({
        displayRequest: createAttackDisplayRequestSnapshot(displayRequest),
        scoreDisplayRequest: snapshot,
        scoreOnly: true,
        calculationOptions: {
          rangePolicy: createAttackRangePolicy(
            createAttackDisplayRequestSnapshot(displayRequest),
            {},
            snapshot
          ),
        },
      })
      if (!refreshed) {
        calculationRunner.invalidateScoreDisplay()
      }
    } catch (error) {
      calculationRunner.invalidateScoreDisplay()
      state.scoreDisplayFeedback.status = 'error'
      state.scoreDisplayFeedback.plan = null
      state.scoreDisplayFeedback.error = error
    }
  }

  onMounted(() => {
    for (const combo of state.combos) {
      ensureComboData(combo.data)
    }
    void runCalculation()
  })

  function dispose() {
    calculationRunner.dispose()
    clearAttackState(state)
  }

  onUnmounted(dispose)

  const combos = computed(() => toUiCombos(state)) as ComputedRef<AttackUiCombo[]>
  const displayPresentation = computed(
    () => state.displayPresentation
  )
  const scoreDisplayPresentation = computed<AttackScoreDisplayBatchPresentation | null>(
    () => state.displayPresentation?.score ?? null
  )
  const displayFeedback = computed(
    () => state.displayFeedback
  )
  const scoreDisplayFeedback = computed(
    () => state.scoreDisplayFeedback
  )
  const summaryReady = computed(
    () => state.displayPresentation?.status === 'ready'
  )
  const scoreChartTransitionPending = computed(() =>
    state.feedback.status === 'loading'
    || state.scoreDisplayFeedback.status === 'loading'
  )
  const damageChartTransitionPending = computed(() =>
    state.feedback.status === 'loading'
    || state.displayFeedback.status === 'loading'
  )
  const feedbackNotice = computed<CalculationFeedbackState<CalculationRangePlan>>(() =>
    state.feedback?.status === 'rejected'
      || state.feedback?.status === 'error'
      ? state.feedback
      : { status: 'idle', plan: null, error: null }
  )

  return {
    combos,
    displayRequest,
    scoreDisplayRequest,
    displayPresentation,
    scoreDisplayPresentation,
    displayFeedback,
    scoreDisplayFeedback,
    summaryReady,
    scoreChartTransitionPending,
    damageChartTransitionPending,
    feedbackNotice,
    onDisplayValidated,
    onScoreDisplayValidated,
    addCombo,
    duplicateCombo,
    removeCombo,
    onComboNameChanged,
    onComboVisibilityChanged,
    onComboAdvancedSettingsChanged,
    onComboSideValidated,
    dispose,
  }
}
