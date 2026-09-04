import {
  ATTACK_DISPLAY_PRESENTATION_DECISIONS,
  createAttackPresentation,
} from './AttackPresentation'
import {
  commitAttackResult,
  commitAttackDisplayPresentation,
  invalidateAttackState,
  isAttackInputCurrent,
  snapshotAttackEntries,
} from './AttackState'
import { createAttackDisplayRequestSnapshot } from './AttackDisplayRequestSnapshot'
import {
  beginCalculation,
  createLatestCalculationRunner,
  markCalculationAborted,
} from '../../../runtime/CalculationFeedback'

/**
 * Connect the attack batch client to a latest-request runner.
 * The runner is UI-independent and owns the current calculation lane.
 */
export function createAttackRunner({
  state,
  calculationClient,
  createPresentation = createAttackPresentation,
  createDisplayPresentation,
  onPresentation,
  onDisplayRejected,
  onError,
}) {
  let requestGeneration = null
  let displayRequestGeneration = 0
  let scoreDisplayRequestGeneration = 0
  let scoreDisplayEnabled = true
  let activeRequest = null
  let lastBatchResult = null
  let lastRangePlans = []
  let lastEntries = null
  let lastScoreDisplayRequest = null
  let preserveResultOnNextRun = false
  let scoreDisplayRecalculationActive = false

  function clearRequestCache() {
    activeRequest = null
    lastBatchResult = null
    lastRangePlans = []
    lastEntries = null
    lastScoreDisplayRequest = null
    preserveResultOnNextRun = false
  }

  function clearScoreDisplayPresentation() {
    state.scoreDisplayPresentation = null
    const current = state.displayPresentation
    if (
      current !== null
      && typeof current === 'object'
      && Object.prototype.hasOwnProperty.call(current, 'score')
    ) {
      state.displayPresentation = Object.freeze({
        ...current,
        score: null,
      })
    }
  }

  function beginScoreDisplayRecalculation() {
    // Keep the batch and the damage presentation available while
    // the expanded score batch is pending, but never expose the old score as
    // if it belonged to the new window.
    scoreDisplayRecalculationActive = true
    lastScoreDisplayRequest = null
    clearScoreDisplayPresentation()
    if (state.scoreDisplayFeedback) {
      beginCalculation(state.scoreDisplayFeedback)
    }
  }

  function cancelScoreDisplayRecalculation() {
    if (!scoreDisplayRecalculationActive) {
      return
    }
    scoreDisplayRecalculationActive = false
    if (
      state.scoreDisplayFeedback
      && state.scoreDisplayFeedback.status === 'loading'
    ) {
      markCalculationAborted(state.scoreDisplayFeedback)
    }
  }

  function invalidateScoreDisplay() {
    // score-only failures must not touch the damage/batch generation. The
    // next batch commit may still publish damage, but its score payload is
    // suppressed by this independent generation and state flag.
    scoreDisplayRequestGeneration += 1
    scoreDisplayEnabled = false
    lastScoreDisplayRequest = null
    cancelScoreDisplayRecalculation()
    clearScoreDisplayPresentation()
  }

  function suppressScoreDisplay(presentation, score = null) {
    if (
      presentation === null
      || typeof presentation !== 'object'
      || !Object.prototype.hasOwnProperty.call(presentation, 'score')
    ) {
      return presentation
    }
    return Object.freeze({
      ...presentation,
      score,
    })
  }

  function createBatchPresentation(batchResult, request, scoreRequest) {
    if (request === null) {
      if (scoreRequest === null) {
        return createPresentation(batchResult, activeRequest.rangePlans)
      }
      return createPresentation(
        batchResult,
        activeRequest.rangePlans,
        undefined,
        scoreRequest
      )
    }
    if (scoreRequest === null) {
      return createPresentation(
        batchResult,
        activeRequest.rangePlans,
        request
      )
    }
    return createPresentation(
      batchResult,
      activeRequest.rangePlans,
      request,
      scoreRequest
    )
  }

  function mergeScoreOnlyPresentation(presentation) {
    const current = state.displayPresentation
    if (
      current === null
      || typeof current !== 'object'
      || presentation === null
      || typeof presentation !== 'object'
      || !Object.prototype.hasOwnProperty.call(current, 'score')
    ) {
      return presentation
    }
    return Object.freeze({
      ...current,
      score: presentation.score ?? null,
    })
  }

  function invalidateDisplayResult(presentation) {
    latestRunner.invalidate()
    displayRequestGeneration += 1
    scoreDisplayRequestGeneration += 1
    scoreDisplayEnabled = false
    requestGeneration = invalidateAttackState(state)
    clearRequestCache()
    onDisplayRejected?.(presentation)
  }

  function handlePresentationError(error) {
    requestGeneration = invalidateAttackState(state)
    clearRequestCache()
    scoreDisplayRecalculationActive = false
    onError?.(error)
  }

  const latestRunner = createLatestCalculationRunner({
    feedback: state.feedback,
    calculate: ({
      entries,
      calculationOptions,
      signal,
      onRangePlan,
      displayRequest,
      displayRequestGeneration: requestDisplayGeneration,
      scoreDisplayRequest,
      scoreDisplayRequestGeneration: requestScoreDisplayGeneration,
      scoreDisplayEnabled: requestScoreDisplayEnabled,
    }) => {
      const requestRangePlans = []
      activeRequest = {
        entries,
        rangePlans: requestRangePlans,
        displayRequest: displayRequest ?? null,
        displayRequestGeneration: requestDisplayGeneration ?? null,
        scoreDisplayRequest: scoreDisplayRequest ?? null,
        scoreDisplayRequestGeneration: requestScoreDisplayGeneration ?? null,
        scoreDisplayEnabled: requestScoreDisplayEnabled === true,
      }
      return calculationClient.calculateAttackBatch(
        entries,
        {
          ...calculationOptions,
          signal,
          onRangePlan: (plan) => {
            requestRangePlans.push(plan)
            onRangePlan?.(plan)
          },
        }
      )
    },
    clearResult: () => {
      if (preserveResultOnNextRun) {
        preserveResultOnNextRun = false
        return
      }
      cancelScoreDisplayRecalculation()
      const scoreFeedback = state.scoreDisplayFeedback
      const preservedScoreFeedback = !scoreDisplayEnabled
        && (
          scoreFeedback?.status === 'rejected'
          || scoreFeedback?.status === 'error'
        )
        ? {
            status: scoreFeedback.status,
            plan: scoreFeedback.plan ?? null,
            error: scoreFeedback.error ?? null,
          }
        : null
      requestGeneration = invalidateAttackState(state)
      clearRequestCache()
      if (preservedScoreFeedback !== null) {
        Object.assign(
          state.scoreDisplayFeedback,
          preservedScoreFeedback
        )
      }
    },
    commitResult: (batchResult) => {
      if (
        activeRequest === null
        || !isAttackInputCurrent(
          state.combos,
          activeRequest.entries
        )
        || (
          activeRequest.displayRequestGeneration !== null
          && activeRequest.displayRequestGeneration
            !== displayRequestGeneration
        )
      ) {
        return false
      }
      const scoreDisplaySuppressed = !activeRequest.scoreDisplayEnabled
        || (
          activeRequest.scoreDisplayRequestGeneration !== null
          && activeRequest.scoreDisplayRequestGeneration
            !== scoreDisplayRequestGeneration
        )
      const presentation = createBatchPresentation(
        batchResult,
        activeRequest.displayRequest,
        activeRequest.scoreDisplayRequest
      )
      const committedPresentation = scoreDisplaySuppressed
        ? suppressScoreDisplay(
            presentation,
            state.scoreDisplayPresentation ?? null
          )
        : presentation
      const committed = commitAttackResult(
        state,
        requestGeneration,
        batchResult,
        committedPresentation
      )
      if (!committed && requestGeneration === state.generation) {
        throw new Error(' attack result was incomplete')
      }
      if (committed) {
        lastBatchResult = batchResult
        lastRangePlans = activeRequest.rangePlans.slice()
        lastEntries = activeRequest.entries
        if (!scoreDisplaySuppressed && activeRequest.scoreDisplayRequest !== null) {
          lastScoreDisplayRequest = activeRequest.scoreDisplayRequest
        }
        if (scoreDisplayRecalculationActive) {
          scoreDisplayRecalculationActive = false
          if (
            scoreDisplaySuppressed
            && state.scoreDisplayFeedback?.status === 'loading'
          ) {
            markCalculationAborted(state.scoreDisplayFeedback)
          }
        }
        onPresentation?.(committedPresentation, {
          scoreDisplaySuppressed,
        })
      }
      return committed
    },
    onError: (error) => {
      // Generic/resource errors do not pass through the coordinator's
      // range-rejection clearResult hook. Drop the result here so an old
      // result cannot survive an error as a stale display.
      handlePresentationError(error)
    },
    onCancelled: () => {
      cancelScoreDisplayRecalculation()
    },
  })

  const run = (options = {}) => {
    const {
      signal,
      onRangePlan,
      displayRequest,
      displayRequestGeneration: suppliedDisplayRequestGeneration,
      scoreDisplayRequest,
      scoreDisplayRequestGeneration: suppliedScoreDisplayRequestGeneration,
      preserveResult,
      ...calculationOptions
    } = options ?? {}
    const requestDisplay = displayRequest === undefined
      ? null
      : createAttackDisplayRequestSnapshot(displayRequest)
    const requestDisplayGeneration = requestDisplay === null
      ? null
      : Number.isSafeInteger(suppliedDisplayRequestGeneration)
        ? suppliedDisplayRequestGeneration
        : ++displayRequestGeneration
    if (
      requestDisplayGeneration !== null
      && requestDisplayGeneration > displayRequestGeneration
    ) {
      displayRequestGeneration = requestDisplayGeneration
    }

    const hasScoreDisplayRequest = scoreDisplayRequest !== undefined
    const requestScoreDisplay = hasScoreDisplayRequest
      ? createAttackDisplayRequestSnapshot(scoreDisplayRequest)
      : lastScoreDisplayRequest
    if (hasScoreDisplayRequest) {
      scoreDisplayEnabled = true
    }
    const requestScoreDisplayGeneration = requestScoreDisplay === null
      ? null
      : Number.isSafeInteger(suppliedScoreDisplayRequestGeneration)
        ? suppliedScoreDisplayRequestGeneration
        : hasScoreDisplayRequest
          ? ++scoreDisplayRequestGeneration
          : scoreDisplayRequestGeneration
    if (
      requestScoreDisplayGeneration !== null
      && requestScoreDisplayGeneration > scoreDisplayRequestGeneration
    ) {
      scoreDisplayRequestGeneration = requestScoreDisplayGeneration
    }
    const entries = snapshotAttackEntries(state.combos)
    preserveResultOnNextRun = preserveResult === true
      && lastBatchResult !== null
      && lastEntries !== null
    return latestRunner.run({
      entries,
      calculationOptions,
      signal,
      onRangePlan,
      displayRequest: requestDisplay,
      displayRequestGeneration: requestDisplayGeneration,
      scoreDisplayRequest: requestScoreDisplay,
      scoreDisplayRequestGeneration: requestScoreDisplayGeneration,
      scoreDisplayEnabled,
    })
  }

  return {
    run,
    invalidate() {
      latestRunner.invalidate()
      displayRequestGeneration += 1
      scoreDisplayRequestGeneration += 1
      scoreDisplayEnabled = false
      requestGeneration = null
      clearRequestCache()
    },
    invalidateScoreDisplay() {
      invalidateScoreDisplay()
    },
    refreshPresentation(options = {}) {
      if (
        requestGeneration === null
        || lastBatchResult === null
        || lastEntries === null
        || !isAttackInputCurrent(
          state.combos,
          lastEntries
        )
      ) {
        return false
      }

      const scoreOnly = options.scoreOnly === true
      const nextDisplayRequestGeneration = scoreOnly
        ? displayRequestGeneration
        : ++displayRequestGeneration
      if (scoreOnly) {
        scoreDisplayRequestGeneration += 1
        scoreDisplayEnabled = true
      }
      const requestedScoreDisplayRequest =
        Object.prototype.hasOwnProperty.call(options, 'scoreDisplayRequest')
          ? createAttackDisplayRequestSnapshot(options.scoreDisplayRequest)
          : lastScoreDisplayRequest
      let requestedDisplayRequest
      if (Object.prototype.hasOwnProperty.call(options, 'displayRequest')) {
        requestedDisplayRequest = createAttackDisplayRequestSnapshot(
          options.displayRequest
        )
      }
      let presentation
      try {
        presentation = createDisplayPresentation
          ? createDisplayPresentation({
              ...options,
              state,
              generation: requestGeneration,
              batchResult: lastBatchResult,
              rangePlans: lastRangePlans,
              ...(Object.prototype.hasOwnProperty.call(options, 'displayRequest')
                ? {
                    displayRequest: createAttackDisplayRequestSnapshot(
                      options.displayRequest
                    ),
                  }
                : {}),
              ...(requestedScoreDisplayRequest !== null
                ? { scoreDisplayRequest: requestedScoreDisplayRequest }
                : {}),
            })
          : createPresentation(
              lastBatchResult,
              lastRangePlans,
              Object.prototype.hasOwnProperty.call(options, 'displayRequest')
                ? createAttackDisplayRequestSnapshot(options.displayRequest)
                : undefined,
              requestedScoreDisplayRequest ?? undefined
            )
      } catch (error) {
        handlePresentationError(error)
        return false
      }

      if (requestedDisplayRequest === undefined) {
        if (presentation?.displayRequest !== undefined) {
          requestedDisplayRequest = createAttackDisplayRequestSnapshot(
            presentation.displayRequest
          )
        } else if (activeRequest?.displayRequest !== null
          && activeRequest?.displayRequest !== undefined) {
          requestedDisplayRequest = createAttackDisplayRequestSnapshot(
            activeRequest.displayRequest
          )
        }
      }

      // score coverage is a presentation-local decision. Do not let a score
      // miss accidentally take the damage path, because a score expansion
      // must recalculate the whole batch atomically only when the
      // score action side itself needs new coverage.
      const damageDecision = presentation?.decision
      const scoreDecision = presentation?.score?.decision
      const decision = scoreOnly
        ? scoreDecision
        : damageDecision
      let scoreDisplaySuppressedForRefresh = false
      if (
        scoreOnly
        && decision
          === ATTACK_DISPLAY_PRESENTATION_DECISIONS.RESOURCE_REJECTED
      ) {
        // The caller normally performs this preflight before entering the
        // runner. Keep the runner safe for direct callers too: a score-only
        // resource rejection invalidates score presentation only and never
        // clears or recalculates the committed damage batch.
        invalidateScoreDisplay()
        return false
      }
      if (
        scoreOnly
        && (
          damageDecision
            === ATTACK_DISPLAY_PRESENTATION_DECISIONS.RESOURCE_REJECTED
          || damageDecision
            === ATTACK_DISPLAY_PRESENTATION_DECISIONS.NOT_PROJECTABLE
          || damageDecision
            === ATTACK_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
          || decision
            === ATTACK_DISPLAY_PRESENTATION_DECISIONS.NOT_PROJECTABLE
        )
        && decision
          !== ATTACK_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
      ) {
        presentation = mergeScoreOnlyPresentation(presentation)
      }
      if (
        !scoreOnly
        && (
          scoreDecision
            === ATTACK_DISPLAY_PRESENTATION_DECISIONS.RESOURCE_REJECTED
          || scoreDecision
            === ATTACK_DISPLAY_PRESENTATION_DECISIONS.NOT_PROJECTABLE
        )
      ) {
        // A score-only resource/projection failure must not turn a normal
        // damage refresh into a rejected request. Suppress the score payload
        // locally, then continue with the independent damage decision.
        scoreDisplaySuppressedForRefresh = true
        invalidateScoreDisplay()
        presentation = suppressScoreDisplay(presentation, null)
      }
      if (
        !scoreOnly
        && (
          decision === ATTACK_DISPLAY_PRESENTATION_DECISIONS.RESOURCE_REJECTED
          || decision === ATTACK_DISPLAY_PRESENTATION_DECISIONS.NOT_PROJECTABLE
        )
      ) {
        invalidateDisplayResult(presentation)
        return false
      }

      if (
        !scoreOnly
        && scoreDecision
          === ATTACK_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
        && requestedScoreDisplayRequest !== null
        && !scoreDisplaySuppressedForRefresh
      ) {
        if (requestedDisplayRequest === undefined) {
          invalidateDisplayResult(presentation)
          return false
        }
        const calculationOptions = options.calculationOptions ?? {}
        beginScoreDisplayRecalculation()
        return run({
          ...calculationOptions,
          displayRequest: requestedDisplayRequest,
          displayRequestGeneration: nextDisplayRequestGeneration,
          scoreDisplayRequest: requestedScoreDisplayRequest,
        })
      }

      if (
        !scoreOnly
        && decision
          === ATTACK_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
      ) {
        if (requestedDisplayRequest === undefined) {
          invalidateDisplayResult(presentation)
          return false
        }
        const calculationOptions = options.calculationOptions ?? {}
        return run({
          ...calculationOptions,
          displayRequest: requestedDisplayRequest,
          displayRequestGeneration: nextDisplayRequestGeneration,
          ...(
            requestedScoreDisplayRequest !== null
            && !scoreDisplaySuppressedForRefresh
            ? { scoreDisplayRequest: requestedScoreDisplayRequest }
          : {}),
        })
      }

      if (
        scoreOnly
        && decision
          === ATTACK_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
      ) {
        if (
          requestedDisplayRequest === undefined
          || requestedScoreDisplayRequest === null
        ) {
          // There is no safe batch snapshot to run. Preserve the committed
          // damage result while suppressing the stale score independently.
          invalidateScoreDisplay()
          return false
        }
        const calculationOptions = options.calculationOptions ?? {}
        const recalculationDisplayRequestGeneration =
          ++displayRequestGeneration
        beginScoreDisplayRecalculation()
        return run({
          ...calculationOptions,
          displayRequest: requestedDisplayRequest,
          displayRequestGeneration: recalculationDisplayRequestGeneration,
          scoreDisplayRequest: requestedScoreDisplayRequest,
          scoreDisplayRequestGeneration: scoreDisplayRequestGeneration,
          preserveResult: true,
        })
      }

      const committedPresentation = scoreDisplayEnabled
        ? presentation
        : suppressScoreDisplay(
            presentation,
            state.scoreDisplayPresentation ?? null
          )
      const committed = commitAttackDisplayPresentation(
        state,
        requestGeneration,
        committedPresentation
      )
      if (committed) {
        if (
          requestedScoreDisplayRequest !== null
          && scoreDisplayEnabled
        ) {
          lastScoreDisplayRequest = requestedScoreDisplayRequest
        }
        onPresentation?.(committedPresentation, {
          scoreDisplaySuppressed: !scoreDisplayEnabled,
        })
      }
      return committed
    },
    dispose() {
      latestRunner.dispose()
      displayRequestGeneration += 1
      scoreDisplayRequestGeneration += 1
      scoreDisplayEnabled = false
      requestGeneration = null
      clearRequestCache()
    },
  }
}
