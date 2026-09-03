import {
  computed,
  onMounted,
  onUnmounted,
  reactive,
  type ComputedRef,
} from 'vue'

import type { CalculationClient } from '../../../application/CalculationClientTypes'
import { createAttackCanonicalRunner } from '../../../application/AttackCanonicalRunner'
import {
  createAttackCanonicalDisplayFeedback,
  createAttackCanonicalScoreDisplayFeedback,
} from '../../../application/AttackCanonicalDisplayFeedback'
import {
  clearCanonicalAttackState,
  createCanonicalAttackState,
  ensureCanonicalComboData,
} from '../../../application/AttackCanonicalState'
import { replaceAttackSideSnapshot } from '../../../application/AttackInputSnapshot'
import {
  DEFAULT_ATTACK_DISPLAY_REQUEST,
  createAttackRangePolicy as createRawAttackRangePolicy,
  createAttackDisplayRequestSnapshot as createRawAttackDisplayRequestSnapshot,
} from '../../../application/AttackDisplayRequestSnapshot'
import {
  createAttackCanonicalDisplayPresentation,
  createAttackCanonicalDisplayPresentationFromCanonical,
} from '../../../application/AttackCanonicalPresentation'
import {
  DEFAULT_DISPLAY_RANGE_PLANNER_POLICY,
  planDisplayWindowResources,
} from '../../../presentation'
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

type CanonicalPresentation = {
  status?: string
  [key: string]: unknown
}

type AttackState = Omit<
  ReturnType<typeof createCanonicalAttackState>,
  | 'canonicalScoreDisplayPresentation'
  | 'canonicalTotalDamage'
  | 'canonicalTotalDamageSummary'
  | 'canonicalTotalDamagePresentation'
  | 'canonicalDisplayPresentation'
  | 'canonicalFeedback'
  | 'canonicalScoreDisplayFeedback'
  | 'canonicalDisplayFeedback'
> & {
  combos: AttackCombo[]
  canonicalScoreDisplayPresentation: CanonicalPresentation | null
  canonicalTotalDamage: unknown
  canonicalTotalDamageSummary: unknown
  canonicalTotalDamagePresentation: CanonicalPresentation | null
  canonicalDisplayPresentation: CanonicalPresentation | null
  canonicalFeedback: FeedbackState
  canonicalScoreDisplayFeedback: FeedbackState
  canonicalDisplayFeedback: FeedbackState
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
    ...createCanonicalAttackState(),
  }) as unknown as AttackState
}

function createDisplaySource(state: AttackState) {
  return {
    combos: state.combos.map((combo) => ({
      id: combo.id,
      canonicalScore: combo.data.canonicalScore,
      canonicalScoreSummary: combo.data.canonicalScoreSummary,
      canonicalScoreBatchSummary: combo.data.canonicalScoreBatchSummary,
      canonicalScorePresentation: combo.data.canonicalScorePresentation,
      canonicalDamagePresentation: combo.data.canonicalDamagePresentation,
      canonicalRangePlan: combo.data.canonicalRangePlan,
    })),
    canonicalTotalDamagePresentation:
      state.canonicalTotalDamagePresentation,
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
    || typeof client.calculateAttackCanonicalBatch !== 'function'
  ) {
    throw new TypeError('useAttack requires calculateAttackCanonicalBatch')
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

  function publishCanonicalDisplayFeedback(
    presentation: unknown,
    metadata: { scoreDisplaySuppressed?: boolean } = {},
  ) {
    Object.assign(
      state.canonicalDisplayFeedback,
      createAttackCanonicalDisplayFeedback(presentation)
    )
    if (metadata.scoreDisplaySuppressed !== true) {
      const scorePresentation = (
        presentation !== null
        && typeof presentation === 'object'
        ? (presentation as { score?: unknown }).score
        : null
      )
      Object.assign(
        state.canonicalScoreDisplayFeedback,
        createAttackCanonicalScoreDisplayFeedback(scorePresentation)
      )
      state.canonicalScoreDisplayPresentation = (
        scorePresentation ?? null
      ) as CanonicalPresentation | null
    }
  }

  function publishCanonicalDisplayRejection(presentation: unknown) {
    Object.assign(
      state.canonicalDisplayFeedback,
      createAttackCanonicalDisplayFeedback(presentation)
    )
    state.canonicalScoreDisplayPresentation = null
    state.canonicalScoreDisplayFeedback.status = 'idle'
    state.canonicalScoreDisplayFeedback.plan = null
    state.canonicalScoreDisplayFeedback.error = null
  }

  const canonicalCalculationRunner = createAttackCanonicalRunner(({
    state,
    calculationClient: client,
    createPresentation: (
      batchResult: unknown,
      rangePlans: unknown[] = [],
      request?: DisplayRequestSnapshot,
      scoreRequest?: DisplayRequestSnapshot,
    ) => createAttackCanonicalDisplayPresentation(batchResult, {
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
    }) => createAttackCanonicalDisplayPresentationFromCanonical(
      createDisplaySource(currentState),
      {
        displayRequest: request
          ?? createAttackDisplayRequestSnapshot(displayRequest),
        scoreDisplayRequest: scoreRequest
          ?? createAttackDisplayRequestSnapshot(scoreDisplayRequest),
        policy: displayRangePolicy,
      }
    ),
    onPresentation: publishCanonicalDisplayFeedback,
    onDisplayRejected: publishCanonicalDisplayRejection,
    onError: (error: unknown) => {
      state.canonicalDisplayPresentation = null
      state.canonicalScoreDisplayPresentation = null
      state.canonicalDisplayFeedback.status = 'error'
      state.canonicalDisplayFeedback.plan = null
      state.canonicalDisplayFeedback.error = error
      state.canonicalScoreDisplayFeedback.status = 'error'
      state.canonicalScoreDisplayFeedback.plan = null
      state.canonicalScoreDisplayFeedback.error = error
      console.error('Failed to update canonical attack', error)
    },
  }) as unknown as Parameters<typeof createAttackCanonicalRunner>[0])

  function publishCanonicalDisplayResourceRejection(plan: unknown) {
    state.canonicalDisplayPresentation = null
    state.canonicalScoreDisplayPresentation = null
    state.canonicalDisplayFeedback.status = 'rejected'
    state.canonicalDisplayFeedback.plan = plan
    state.canonicalDisplayFeedback.error = null
    state.canonicalScoreDisplayFeedback.status = 'idle'
    state.canonicalScoreDisplayFeedback.plan = null
    state.canonicalScoreDisplayFeedback.error = null
  }

  function publishCanonicalDisplayError(error: unknown) {
    state.canonicalDisplayPresentation = null
    state.canonicalScoreDisplayPresentation = null
    state.canonicalDisplayFeedback.status = 'error'
    state.canonicalDisplayFeedback.plan = null
    state.canonicalDisplayFeedback.error = error
    state.canonicalScoreDisplayFeedback.status = 'error'
    state.canonicalScoreDisplayFeedback.plan = null
    state.canonicalScoreDisplayFeedback.error = error
  }

  function publishCanonicalScoreDisplayResourceRejection(plan: unknown) {
    state.canonicalScoreDisplayPresentation = null
    state.canonicalScoreDisplayFeedback.status = 'rejected'
    state.canonicalScoreDisplayFeedback.plan = plan
    state.canonicalScoreDisplayFeedback.error = null
  }

  function preflightCanonicalDisplay(request: DisplayRequestSnapshot) {
    try {
      const plan = planDisplayWindowResources(
        { min: request.min, max: request.max },
        displayRangePolicy
      )
      if (!plan.accepted) {
        canonicalCalculationRunner.invalidate()
        clearCanonicalAttackState(state)
        publishCanonicalDisplayResourceRejection(plan)
        return false
      }
      return true
    } catch (error) {
      canonicalCalculationRunner.invalidate()
      clearCanonicalAttackState(state)
      publishCanonicalDisplayError(error)
      return false
    }
  }

  function preflightCanonicalScoreDisplay(request: DisplayRequestSnapshot) {
    try {
      const plan = planDisplayWindowResources(
        { min: request.min, max: request.max },
        displayRangePolicy
      )
      if (!plan.accepted) {
        canonicalCalculationRunner.invalidateScoreDisplay()
        publishCanonicalScoreDisplayResourceRejection(plan)
        return false
      }
      return true
    } catch (error) {
      canonicalCalculationRunner.invalidateScoreDisplay()
      state.canonicalScoreDisplayPresentation = null
      state.canonicalScoreDisplayFeedback.status = 'error'
      state.canonicalScoreDisplayFeedback.plan = null
      state.canonicalScoreDisplayFeedback.error = error
      return false
    }
  }

  function runCanonicalCalculation(
    request: DisplayRequestSnapshot = displayRequest,
    scoreRequest: DisplayRequestSnapshot = scoreDisplayRequest,
  ): Promise<unknown> {
    const snapshot = createAttackDisplayRequestSnapshot(request)
    const scoreSnapshot = createAttackDisplayRequestSnapshot(scoreRequest)
    if (!preflightCanonicalDisplay(snapshot)) {
      return Promise.resolve(false)
    }
    const scoreDisplayReady = preflightCanonicalScoreDisplay(scoreSnapshot)
    if (!scoreDisplayReady) {
      return canonicalCalculationRunner.run({
        displayRequest: snapshot,
        rangePolicy: createAttackRangePolicy(snapshot),
      }) as Promise<unknown>
    }
    return canonicalCalculationRunner.run({
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
    void runCanonicalCalculation()
  }

  function duplicateCombo(id: number | string) {
    const source = findCombo(id)
    if (source === null) {
      return
    }
    state.combos.push(cloneAttackCombo(source, allocateComboId()))
    void runCanonicalCalculation()
  }

  function removeCombo(id: number | string) {
    const index = state.combos.findIndex((combo) => combo.id === id)
    if (index < 0) {
      return
    }
    state.combos.splice(index, 1)
    void runCanonicalCalculation()
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
    void runCanonicalCalculation()
  }

  function onDisplayValidated(request: DisplayRequestSnapshot) {
    const snapshot = createAttackDisplayRequestSnapshot(request)
    displayRequest.min = snapshot.min
    displayRequest.max = snapshot.max
    displayRequest.mode = snapshot.mode

    if (!preflightCanonicalDisplay(snapshot)) {
      return
    }

    if (state.canonicalTotalDamageReady !== true) {
      void runCanonicalCalculation(snapshot)
      return
    }

    try {
      const scoreSnapshot = createAttackDisplayRequestSnapshot(
        scoreDisplayRequest
      )
      const scoreDisplayReady = preflightCanonicalScoreDisplay(scoreSnapshot)
      const refreshed = canonicalCalculationRunner.refreshPresentation({
        displayRequest: snapshot,
        scoreDisplayRequest: scoreSnapshot,
        calculationOptions: {
          rangePolicy: scoreDisplayReady
            ? createAttackRangePolicy(snapshot, {}, scoreSnapshot)
            : createAttackRangePolicy(snapshot),
        },
      })
      if (!refreshed) {
        state.canonicalDisplayPresentation = null
      }
    } catch (error) {
      publishCanonicalDisplayError(error)
    }
  }

  function onScoreDisplayValidated(request: DisplayRequestSnapshot) {
    const snapshot = createAttackDisplayRequestSnapshot(request)
    scoreDisplayRequest.min = snapshot.min
    scoreDisplayRequest.max = snapshot.max
    scoreDisplayRequest.mode = snapshot.mode

    if (!preflightCanonicalScoreDisplay(snapshot)) {
      return
    }

    if (state.canonicalTotalDamageReady !== true) {
      void runCanonicalCalculation(displayRequest, snapshot)
      return
    }

    try {
      const refreshed = canonicalCalculationRunner.refreshPresentation({
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
        canonicalCalculationRunner.invalidateScoreDisplay()
        state.canonicalScoreDisplayPresentation = null
      }
    } catch (error) {
      canonicalCalculationRunner.invalidateScoreDisplay()
      state.canonicalScoreDisplayPresentation = null
      state.canonicalScoreDisplayFeedback.status = 'error'
      state.canonicalScoreDisplayFeedback.plan = null
      state.canonicalScoreDisplayFeedback.error = error
    }
  }

  onMounted(() => {
    for (const combo of state.combos) {
      ensureCanonicalComboData(combo.data)
    }
    void runCanonicalCalculation()
  })

  function dispose() {
    canonicalCalculationRunner.dispose()
    clearCanonicalAttackState(state)
  }

  onUnmounted(dispose)

  const combos = computed(() => toUiCombos(state)) as ComputedRef<AttackUiCombo[]>
  const canonicalDisplayPresentation = computed(
    () => state.canonicalDisplayPresentation
  )
  const canonicalScoreDisplayPresentation = computed(
    () => state.canonicalScoreDisplayPresentation
  )
  const canonicalDisplayFeedback = computed(
    () => state.canonicalDisplayFeedback
  )
  const canonicalScoreDisplayFeedback = computed(
    () => state.canonicalScoreDisplayFeedback
  )
  const canonicalSummaryReady = computed(
    () => state.canonicalDisplayPresentation?.status === 'ready'
  )
  const canonicalFeedbackNotice = computed<FeedbackState>(() =>
    state.canonicalFeedback?.status === 'rejected'
      || state.canonicalFeedback?.status === 'error'
      ? state.canonicalFeedback
      : { status: 'idle', plan: null, error: null }
  )

  return {
    combos,
    displayRequest,
    scoreDisplayRequest,
    canonicalDisplayPresentation,
    canonicalScoreDisplayPresentation,
    canonicalDisplayFeedback,
    canonicalScoreDisplayFeedback,
    canonicalSummaryReady,
    canonicalFeedbackNotice,
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
