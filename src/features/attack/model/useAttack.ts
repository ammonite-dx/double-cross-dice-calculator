import {
  computed,
  onMounted,
  onUnmounted,
  reactive,
  type ComputedRef,
} from 'vue'

import type { CalculationClient } from '../../../runtime/CalculationClientTypes'
import { createAttackRunner } from './AttackRunner'
import {
  createAttackDisplayFeedback,
  createAttackScoreDisplayFeedback,
} from './AttackDisplayFeedback'
import {
  clearAttackState,
  createAttackState,
  ensureComboData,
} from './AttackState'
import { replaceAttackSideSnapshot } from './AttackInputSnapshot'
import {
  DEFAULT_ATTACK_DISPLAY_REQUEST,
  createAttackRangePolicy as createRawAttackRangePolicy,
  createAttackDisplayRequestSnapshot as createRawAttackDisplayRequestSnapshot,
} from './AttackDisplayRequestSnapshot'
import {
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
  type AttackCombo,
} from './AttackComboState'

type FeedbackState = {
  status: string
  plan: unknown
  error: unknown
}

type Presentation = {
  status?: string
  [key: string]: unknown
}

type AttackState = Omit<
  ReturnType<typeof createAttackState>,
  | 'scoreDisplayPresentation'
  | 'totalDamage'
  | 'totalDamageSummary'
  | 'totalDamagePresentation'
  | 'displayPresentation'
  | 'feedback'
  | 'scoreDisplayFeedback'
  | 'displayFeedback'
> & {
  combos: AttackCombo[]
  scoreDisplayPresentation: Presentation | null
  totalDamage: unknown
  totalDamageSummary: unknown
  totalDamagePresentation: Presentation | null
  displayPresentation: Presentation | null
  feedback: FeedbackState
  scoreDisplayFeedback: FeedbackState
  displayFeedback: FeedbackState
}

export interface AttackUiCombo {
  id: number | string
  name: string
  show: boolean
  showDetails: {
    action: boolean
    reaction: boolean
  }
  params: AttackCombo['data']['params']
}

export interface ComboSideValidation {
  id: number | string
  side: 'action' | 'reaction'
  snapshot: unknown
}

export interface ComboDetailsChange {
  id: number | string
  side: 'action' | 'reaction'
  value: boolean
}

export interface UseAttackOptions {
  calculationClient: CalculationClient
}

const createAttackDisplayRequestSnapshot =
  createRawAttackDisplayRequestSnapshot as unknown as (
    request?: DisplayRequestSnapshot,
  ) => DisplayRequestSnapshot

const createAttackRangePolicy = createRawAttackRangePolicy as unknown as (
  displayRequest: DisplayRequestSnapshot,
  suppliedPolicy?: Record<string, unknown>,
  scoreDisplayRequest?: DisplayRequestSnapshot,
) => unknown

function createState(): AttackState {
  return reactive({
    combos: [createAttackCombo(0)],
    ...createAttackState(),
  }) as unknown as AttackState
}

function createDisplaySource(state: AttackState) {
  return {
    combos: state.combos.map((combo) => ({
      id: combo.id,
      score: combo.data.score,
      scoreSummary: combo.data.scoreSummary,
      scorePresentation: combo.data.scorePresentation,
      damagePresentation: combo.data.damagePresentation,
      rangePlan: combo.data.rangePlan,
    })),
    totalDamagePresentation:
      state.totalDamagePresentation,
  }
}

function toUiCombos(state: AttackState): AttackUiCombo[] {
  return state.combos.map((combo) => ({
    id: combo.id,
    name: combo.name,
    show: combo.show,
    showDetails: {
      action: combo.showDetails.action,
      reaction: combo.showDetails.reaction,
    },
    params: combo.data.params,
  }))
}

export function useAttack({ calculationClient }: UseAttackOptions) {
  const client = calculationClient as unknown as CalculationClient
  if (
    client === null
    || typeof client !== 'object'
    || typeof client.calculateAttackBatch !== 'function'
  ) {
    throw new TypeError('useAttack requires calculateAttackBatch')
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
    presentation: unknown,
    metadata: { scoreDisplaySuppressed?: boolean } = {},
  ) {
    Object.assign(
      state.displayFeedback,
      createAttackDisplayFeedback(presentation)
    )
    if (metadata.scoreDisplaySuppressed !== true) {
      const scorePresentation = (
        presentation !== null
        && typeof presentation === 'object'
        ? (presentation as { score?: unknown }).score
        : null
      )
      Object.assign(
        state.scoreDisplayFeedback,
        createAttackScoreDisplayFeedback(scorePresentation)
      )
      state.scoreDisplayPresentation = (
        scorePresentation ?? null
      ) as Presentation | null
    }
  }

  function publishDisplayRejection(presentation: unknown) {
    Object.assign(
      state.displayFeedback,
      createAttackDisplayFeedback(presentation)
    )
    state.scoreDisplayPresentation = null
    state.scoreDisplayFeedback.status = 'idle'
    state.scoreDisplayFeedback.plan = null
    state.scoreDisplayFeedback.error = null
  }

  const calculationRunner = createAttackRunner(({
    state,
    calculationClient: client,
    createPresentation: (
      batchResult: unknown,
      rangePlans: unknown[] = [],
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
      displayRequest: request,
      scoreDisplayRequest: scoreRequest,
    }: {
      state: AttackState
      displayRequest?: DisplayRequestSnapshot
      scoreDisplayRequest?: DisplayRequestSnapshot
    }) => createAttackDisplayPresentationFrom(
      createDisplaySource(currentState),
      {
        displayRequest: request
          ?? createAttackDisplayRequestSnapshot(displayRequest),
        scoreDisplayRequest: scoreRequest
          ?? createAttackDisplayRequestSnapshot(scoreDisplayRequest),
        policy: displayRangePolicy,
      }
    ),
    onPresentation: publishDisplayFeedback,
    onDisplayRejected: publishDisplayRejection,
    onError: (error: unknown) => {
      state.displayPresentation = null
      state.scoreDisplayPresentation = null
      state.displayFeedback.status = 'error'
      state.displayFeedback.plan = null
      state.displayFeedback.error = error
      state.scoreDisplayFeedback.status = 'error'
      state.scoreDisplayFeedback.plan = null
      state.scoreDisplayFeedback.error = error
      console.error('Failed to update attack', error)
    },
  }) as unknown as Parameters<typeof createAttackRunner>[0])

  function publishDisplayResourceRejection(plan: unknown) {
    state.displayPresentation = null
    state.scoreDisplayPresentation = null
    state.displayFeedback.status = 'rejected'
    state.displayFeedback.plan = plan
    state.displayFeedback.error = null
    state.scoreDisplayFeedback.status = 'idle'
    state.scoreDisplayFeedback.plan = null
    state.scoreDisplayFeedback.error = null
  }

  function publishDisplayError(error: unknown) {
    state.displayPresentation = null
    state.scoreDisplayPresentation = null
    state.displayFeedback.status = 'error'
    state.displayFeedback.plan = null
    state.displayFeedback.error = error
    state.scoreDisplayFeedback.status = 'error'
    state.scoreDisplayFeedback.plan = null
    state.scoreDisplayFeedback.error = error
  }

  function publishScoreDisplayResourceRejection(plan: unknown) {
    state.scoreDisplayPresentation = null
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
        clearAttackState(state)
        publishDisplayResourceRejection(plan)
        return false
      }
      return true
    } catch (error) {
      calculationRunner.invalidate()
      clearAttackState(state)
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
      state.scoreDisplayPresentation = null
      state.scoreDisplayFeedback.status = 'error'
      state.scoreDisplayFeedback.plan = null
      state.scoreDisplayFeedback.error = error
      return false
    }
  }

  function runCalculation(
    request: DisplayRequestSnapshot = displayRequest,
    scoreRequest: DisplayRequestSnapshot = scoreDisplayRequest,
  ): Promise<unknown> {
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
      }) as Promise<unknown>
    }
    return calculationRunner.run({
      displayRequest: snapshot,
      scoreDisplayRequest: scoreSnapshot,
      rangePolicy: createAttackRangePolicy(snapshot, {}, scoreSnapshot),
    }) as Promise<unknown>
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
    void runCalculation()
  }

  function duplicateCombo(id: number | string) {
    const source = findCombo(id)
    if (source === null) {
      return
    }
    state.combos.push(cloneAttackCombo(source, allocateComboId()))
    void runCalculation()
  }

  function removeCombo(id: number | string) {
    const index = state.combos.findIndex((combo) => combo.id === id)
    if (index < 0) {
      return
    }
    state.combos.splice(index, 1)
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

  function onComboDetailsChanged({ id, side, value }: ComboDetailsChange) {
    if (side !== 'action' && side !== 'reaction') {
      return
    }
    const combo = findCombo(id)
    if (combo !== null) {
      combo.showDetails[side] = value
    }
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
    replaceAttackSideSnapshot(combo.data.params, side, snapshot)
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

    if (state.totalDamageReady !== true) {
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

    if (state.totalDamageReady !== true) {
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
        state.scoreDisplayPresentation = null
      }
    } catch (error) {
      calculationRunner.invalidateScoreDisplay()
      state.scoreDisplayPresentation = null
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
  const scoreDisplayPresentation = computed(
    () => state.scoreDisplayPresentation
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
  const feedbackNotice = computed<FeedbackState>(() =>
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
    feedbackNotice,
    onDisplayValidated,
    onScoreDisplayValidated,
    addCombo,
    duplicateCombo,
    removeCombo,
    onComboNameChanged,
    onComboVisibilityChanged,
    onComboDetailsChanged,
    onComboSideValidated,
    dispose,
  }
}
