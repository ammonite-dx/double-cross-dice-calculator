import { computed, onMounted, onUnmounted, reactive, toRefs } from 'vue'

import {
  createCalculationFeedbackState,
  createLatestCalculationRunner,
  runInitialCalculation,
} from '../../../runtime/CalculationFeedback'
import type {
  CalculationClient,
  CheckCalculationResult,
} from '../../../runtime/CalculationClientTypes'
import {
  CHECK_PRESENTATION_DECISIONS,
  createCheckPresentation,
} from './CheckPresentation'
import {
  DEFAULT_CHECK_DISPLAY_REQUEST,
  createCheckCalculationRequestSnapshot,
  createCheckDisplayRequestSnapshot,
} from './CheckDisplayRequestSnapshot'
import { createCheckInputSnapshot } from './CheckInputSnapshot'
import {
  DEFAULT_DISPLAY_RANGE_PLANNER_POLICY,
  planDisplayWindowResources,
} from '../../../shared/presentation'
import type {
  DifficultyInput,
  DisplayRequestSnapshot,
  ScoreInput,
} from '../../../domain/CalculationInputs'
import type {
  ScorePair,
  ScoreSummary,
} from '../../../calculation/DistributionResultTypes'

interface CalculationFeedbackState {
  status: string
  plan: unknown
  error: unknown
}

interface CheckDisplayWarning {
  readonly code?: string
  readonly severity?: string
  readonly message?: string
}

interface CheckDisplayPlan {
  readonly accepted: boolean
  readonly warnings?: readonly CheckDisplayWarning[]
  readonly rejectionReasons?: readonly string[]
  readonly [key: string]: unknown
}

interface CheckPresentationSide {
  readonly decision: string
  readonly status: string
  readonly reason: string | null
  readonly plan?: CheckDisplayPlan | null
}

interface CheckPresentation {
  readonly status: string
  readonly decision: string
  readonly action?: CheckPresentationSide | null
  readonly reaction?: CheckPresentationSide | null
}

interface CheckScoreParams {
  action: Partial<ScoreInput>
  reaction: Partial<ScoreInput>
}

interface CheckState {
  difficulty: DifficultyInput
  scoreParams: CheckScoreParams
  score: ScorePair | null
  scoreSummary: ScoreSummary | null
  resultReady: boolean
  displayRequest: DisplayRequestSnapshot
  rangeFeedback: CalculationFeedbackState
  displayFeedback: CalculationFeedbackState
}

const INITIAL_DIFFICULTY: DifficultyInput = Object.freeze({
  opposed: false,
  target: 0,
})

const INITIAL_PARAMS = Object.freeze({
  action: Object.freeze({
    dice: 1,
    critical: 10,
    skill: 0,
    yousei: 0,
    shihai: 0,
  }),
  reaction: Object.freeze({
    dice: 1,
    critical: 10,
    skill: 0,
    yousei: 0,
    shihai: 0,
  }),
})

export interface UseCheckOptions {
  calculationClient: CalculationClient
}

export async function useCheck({
  calculationClient,
}: UseCheckOptions) {
  if (
    calculationClient === null
    || typeof calculationClient !== 'object'
    || typeof calculationClient.calculateCheck !== 'function'
  ) {
    throw new TypeError('useCheck requires calculateCheck')
  }

  const displayRangePolicy = DEFAULT_DISPLAY_RANGE_PLANNER_POLICY
  const initialDisplayRequest = createCheckDisplayRequestSnapshot(
    DEFAULT_CHECK_DISPLAY_REQUEST
  )
  const initialInputSnapshot = createCheckInputSnapshot({
    difficulty: INITIAL_DIFFICULTY,
    params: INITIAL_PARAMS,
  })
  const initialCalculationRequest = createCheckCalculationRequestSnapshot({
    ...initialInputSnapshot,
    displayRequest: initialDisplayRequest,
  })
  const rangeFeedback = reactive(
    createCalculationFeedbackState()
  ) as CalculationFeedbackState
  const displayFeedback = reactive(
    createCalculationFeedbackState()
  ) as CalculationFeedbackState
  const state = reactive<CheckState>({
    difficulty: { ...initialInputSnapshot.difficulty } as DifficultyInput,
    scoreParams: {
      action: { ...initialInputSnapshot.params.action },
      reaction: { ...initialInputSnapshot.params.reaction },
    },
    score: null,
    scoreSummary: null,
    resultReady: false,
    displayRequest: { ...initialDisplayRequest },
    rangeFeedback,
    displayFeedback,
  })
  let displayRecalculationKey: string | null = null

  function resetDisplayFeedback() {
    displayFeedback.status = 'idle'
    displayFeedback.plan = null
    displayFeedback.error = null
  }

  function getNotProjectableCode(reason: unknown) {
    if (reason === 'upper-bound-overflow') {
      return 'check-upper-bound-overflow'
    }
    if (reason === 'exact-overflow-overlap') {
      return 'check-exact-overflow-overlap'
    }
    return 'check-not-projectable'
  }

  function createNotProjectablePlan(
    result: CheckPresentation | null | undefined
  ): CheckDisplayPlan {
    const sides = [result?.action, result?.reaction].filter(
      (side): side is CheckPresentationSide => side !== null && side !== undefined
    )
    const terminalSides = sides.filter((side) =>
      side.decision === CHECK_PRESENTATION_DECISIONS.NOT_PROJECTABLE
      || side.decision === CHECK_PRESENTATION_DECISIONS.RESOURCE_REJECTED
    )
    const feedbackSides = terminalSides.length > 0
      ? terminalSides
      : sides.filter((side) =>
        side.decision === CHECK_PRESENTATION_DECISIONS.RECALCULATE
      )
    const warnings = feedbackSides.map((side) => {
      const code = side.decision
        === CHECK_PRESENTATION_DECISIONS.RESOURCE_REJECTED
        ? side.plan?.rejectionReasons?.[0] ?? 'display-point-count'
        : side.decision
            === CHECK_PRESENTATION_DECISIONS.RECALCULATE
          ? 'check-not-projectable'
          : getNotProjectableCode(side.reason)
      return {
        code,
        severity: 'reject',
        message: 'Check display cannot safely project this window',
      }
    })
    const pointCount = state.displayRequest.max
      - state.displayRequest.min
      + 1
    return {
      accepted: false,
      status: 'resource-rejected',
      decision: 'terminal',
      reason: 'display-terminal',
      displayWindow: {
        min: state.displayRequest.min,
        max: state.displayRequest.max,
        pointCount,
      },
      estimates: {
        pointCount,
        float64Bytes: pointCount * Float64Array.BYTES_PER_ELEMENT,
        chartPoints: pointCount,
      },
      warnings,
      rejectionReasons: warnings.map(({ code }) => code),
    }
  }

  function publishDisplayPlan(plan: CheckDisplayPlan) {
    displayFeedback.status = plan.accepted === false
      ? 'rejected'
      : (plan.warnings?.length ?? 0) > 0
        ? 'warning'
        : 'idle'
    displayFeedback.plan = plan
    displayFeedback.error = null
  }

  function publishDisplayError(error: unknown) {
    displayFeedback.status = 'error'
    displayFeedback.plan = null
    displayFeedback.error = error
  }

  function preflightDisplayRequest(
    request: DisplayRequestSnapshot = state.displayRequest
  ) {
    const resourcePlan = planDisplayWindowResources(
      { min: request.min, max: request.max },
      displayRangePolicy
    )
    if (!resourcePlan.accepted) {
      publishDisplayPlan(resourcePlan)
      return false
    }
    return true
  }

  function buildPresentationForScore(
    score: ScorePair,
    request: DisplayRequestSnapshot = state.displayRequest
  ): CheckPresentation {
    return createCheckPresentation(
      { score },
      {
        displayWindow: { min: request.min, max: request.max },
        mode: request.mode,
        opposed: state.difficulty.opposed,
        policy: displayRangePolicy,
      }
    ) as unknown as CheckPresentation
  }

  function buildPresentation(
    request: DisplayRequestSnapshot = state.displayRequest
  ) {
    if (!state.resultReady || state.score === null) {
      return null
    }
    return buildPresentationForScore(state.score, request)
  }

  const presentation = computed(() => buildPresentation())

  function updateDisplayFeedback(
    result: CheckPresentation | null = presentation.value
  ) {
    if (!preflightDisplayRequest()) {
      return
    }
    if (result === null) {
      resetDisplayFeedback()
      return
    }
    if (
      result.decision === CHECK_PRESENTATION_DECISIONS.RESOURCE_REJECTED
      || result.decision === CHECK_PRESENTATION_DECISIONS.NOT_PROJECTABLE
      || result.decision === CHECK_PRESENTATION_DECISIONS.RECALCULATE
    ) {
      publishDisplayPlan(createNotProjectablePlan(result))
      return
    }
    const warningPlan = [result.action, result.reaction]
      .filter(
        (side): side is CheckPresentationSide => side !== null && side !== undefined
      )
      .map((side) => side.plan)
      .find((plan) => (plan?.warnings?.length ?? 0) > 0)
    if (warningPlan) {
      publishDisplayPlan(warningPlan)
      return
    }
    resetDisplayFeedback()
  }

  function displayRecalculationKeyFor(request: DisplayRequestSnapshot) {
    return `${request.min}:${request.max}`
  }

  function requestDisplayRecalculation(request: DisplayRequestSnapshot) {
    const key = displayRecalculationKeyFor(request)
    if (displayRecalculationKey === key) {
      publishDisplayPlan(createNotProjectablePlan(buildPresentation(request)))
      return
    }
    displayRecalculationKey = key
    resetDisplayFeedback()
    void submitCheck(request)
  }

  function submitCheck(
    request: DisplayRequestSnapshot = state.displayRequest
  ) {
    if (!preflightDisplayRequest(request)) {
      return Promise.resolve(false)
    }
    const calculationRequest = createCheckCalculationRequestSnapshot({
      difficulty: state.difficulty,
      params: state.scoreParams,
      displayRequest: request,
    })
    return calculationRunner.run(calculationRequest)
  }

  const calculationRunner = createLatestCalculationRunner({
    feedback: rangeFeedback,
    snapshotRequest: createCheckCalculationRequestSnapshot,
    calculate: (snapshot: ReturnType<typeof createCheckCalculationRequestSnapshot>) =>
      calculationClient.calculateCheck(
        snapshot.params,
        snapshot.difficulty,
        snapshot
      ),
    clearResult: () => {
      state.score = null
      state.scoreSummary = null
      state.resultReady = false
      resetDisplayFeedback()
    },
    commitResult: (result: CheckCalculationResult) => {
      let committedPresentation
      try {
        committedPresentation = buildPresentationForScore(result.score)
      } catch (error) {
        displayRecalculationKey = null
        publishDisplayError(error)
        return
      }
      state.score = result.score
      state.scoreSummary = result.scoreSummary
      state.resultReady = true
      if (
        committedPresentation?.decision
          === CHECK_PRESENTATION_DECISIONS.RECALCULATE
      ) {
        requestDisplayRecalculation(state.displayRequest)
        return
      }
      displayRecalculationKey = null
      updateDisplayFeedback(committedPresentation)
    },
    onError: (error: unknown) => {
      console.error('Failed to update check', error)
    },
    onCancelled: undefined,
  })

  const onDifficultyValidated = (difficulty: DifficultyInput) => {
    state.difficulty = { ...difficulty }
    displayRecalculationKey = null
    void submitCheck()
  }

  const onScoreValidated = ({
    side,
    params,
  }: {
    side: string
    params: Partial<ScoreInput>
  }) => {
    if (side !== 'action' && side !== 'reaction') {
      return
    }
    state.scoreParams[side] = { ...params }
    displayRecalculationKey = null
    void submitCheck()
  }

  const onDisplayValidated = (request: DisplayRequestSnapshot) => {
    const snapshot = createCheckDisplayRequestSnapshot(request)
    const windowChanged = snapshot.min !== state.displayRequest.min
      || snapshot.max !== state.displayRequest.max
    state.displayRequest.min = snapshot.min
    state.displayRequest.max = snapshot.max
    state.displayRequest.mode = snapshot.mode
    if (windowChanged) {
      displayRecalculationKey = null
    }

    if (!preflightDisplayRequest(snapshot)) {
      return
    }

    if (!state.resultReady || state.score === null) {
      resetDisplayFeedback()
      return
    }

    let nextPresentation
    try {
      nextPresentation = buildPresentation(snapshot)
    } catch (error) {
      publishDisplayError(error)
      return
    }
    if (!windowChanged) {
      displayRecalculationKey = null
      updateDisplayFeedback(nextPresentation)
      return
    }
    if (
      nextPresentation?.decision
        === CHECK_PRESENTATION_DECISIONS.RECALCULATE
    ) {
      requestDisplayRecalculation(snapshot)
      return
    }
    displayRecalculationKey = null
    updateDisplayFeedback(nextPresentation)
  }

  onMounted(() => {
    if (!state.resultReady && rangeFeedback.status !== 'rejected') {
      void calculationRunner.run(initialCalculationRequest)
    }
  })
  onUnmounted(() => calculationRunner.dispose())

  const initialCalculation = await runInitialCalculation({
    feedback: rangeFeedback,
    calculate: (options: { onRangePlan: (plan: unknown) => void }) =>
      calculationClient.calculateCheck(
        initialCalculationRequest.params,
        initialCalculationRequest.difficulty,
        {
          ...options,
          displayRequest: initialCalculationRequest.displayRequest,
          rangePolicy: initialCalculationRequest.rangePolicy,
        }
      ),
    onError: (error: unknown) => {
      console.error('Failed to initialize check calculation', error)
    },
  })
  if (initialCalculation !== null) {
    state.score = initialCalculation.score
    state.scoreSummary = initialCalculation.scoreSummary
    state.resultReady = true
  }

  const stateRefs = toRefs(state)
  return {
    difficulty: stateRefs.difficulty,
    scoreParams: stateRefs.scoreParams,
    score: stateRefs.score,
    scoreSummary: stateRefs.scoreSummary,
    resultReady: stateRefs.resultReady,
    displayRequest: stateRefs.displayRequest,
    presentation,
    rangeFeedback: stateRefs.rangeFeedback,
    displayFeedback: stateRefs.displayFeedback,
    onDifficultyValidated,
    onScoreValidated,
    onDisplayValidated,
  }
}
