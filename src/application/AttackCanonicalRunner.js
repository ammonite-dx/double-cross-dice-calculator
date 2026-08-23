import {
  ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS,
  createAttackCanonicalPresentation,
} from './AttackCanonicalPresentation'
import {
  commitCanonicalAttackResult,
  commitCanonicalAttackDisplayPresentation,
  invalidateCanonicalAttackState,
  isCanonicalAttackInputCurrent,
  snapshotCanonicalAttackEntries,
} from './AttackCanonicalState'
import { createAttackDisplayRequestSnapshot } from './AttackDisplayRequestSnapshot'
import {
  beginCalculation,
  createLatestCalculationRunner,
  markCalculationAborted,
} from './CalculationFeedback'

/**
 * Connect the canonical attack batch client to a latest-request runner.
 * The runner is UI-independent and always represents the canonical lane.
 */
export function createAttackCanonicalRunner({
  state,
  calculationClient,
  createPresentation = createAttackCanonicalPresentation,
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
  let lastCanonicalEntries = null
  let lastScoreDisplayRequest = null
  let preserveCanonicalResultOnNextRun = false
  let scoreDisplayRecalculationActive = false

  function clearRequestCache() {
    activeRequest = null
    lastBatchResult = null
    lastRangePlans = []
    lastCanonicalEntries = null
    lastScoreDisplayRequest = null
    preserveCanonicalResultOnNextRun = false
  }

  function clearScoreDisplayPresentation() {
    state.canonicalScoreDisplayPresentation = null
    const current = state.canonicalDisplayPresentation
    if (
      current !== null
      && typeof current === 'object'
      && Object.prototype.hasOwnProperty.call(current, 'score')
    ) {
      state.canonicalDisplayPresentation = Object.freeze({
        ...current,
        score: null,
      })
    }
  }

  function beginScoreDisplayRecalculation() {
    // Keep the canonical batch and the Damage presentation available while
    // the expanded Score batch is pending, but never expose the old Score as
    // if it belonged to the new window.
    scoreDisplayRecalculationActive = true
    lastScoreDisplayRequest = null
    clearScoreDisplayPresentation()
    if (state.canonicalScoreDisplayFeedback) {
      beginCalculation(state.canonicalScoreDisplayFeedback)
    }
  }

  function cancelScoreDisplayRecalculation() {
    if (!scoreDisplayRecalculationActive) {
      return
    }
    scoreDisplayRecalculationActive = false
    if (
      state.canonicalScoreDisplayFeedback
      && state.canonicalScoreDisplayFeedback.status === 'loading'
    ) {
      markCalculationAborted(state.canonicalScoreDisplayFeedback)
    }
  }

  function invalidateScoreDisplay() {
    // Score-only failures must not touch the Damage/batch generation. The
    // next batch commit may still publish Damage, but its Score payload is
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
    const current = state.canonicalDisplayPresentation
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
    requestGeneration = invalidateCanonicalAttackState(state)
    clearRequestCache()
    onDisplayRejected?.(presentation)
  }

  function handlePresentationError(error) {
    requestGeneration = invalidateCanonicalAttackState(state)
    clearRequestCache()
    scoreDisplayRecalculationActive = false
    onError?.(error)
  }

  const latestRunner = createLatestCalculationRunner({
    feedback: state.canonicalFeedback,
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
      return calculationClient.calculateAttackCanonicalBatch(
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
      if (preserveCanonicalResultOnNextRun) {
        preserveCanonicalResultOnNextRun = false
        return
      }
      cancelScoreDisplayRecalculation()
      const scoreFeedback = state.canonicalScoreDisplayFeedback
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
      requestGeneration = invalidateCanonicalAttackState(state)
      clearRequestCache()
      if (preservedScoreFeedback !== null) {
        Object.assign(
          state.canonicalScoreDisplayFeedback,
          preservedScoreFeedback
        )
      }
    },
    commitResult: (batchResult) => {
      if (
        activeRequest === null
        || !isCanonicalAttackInputCurrent(
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
            state.canonicalScoreDisplayPresentation ?? null
          )
        : presentation
      const committed = commitCanonicalAttackResult(
        state,
        requestGeneration,
        batchResult,
        committedPresentation
      )
      if (!committed && requestGeneration === state.canonicalGeneration) {
        throw new Error('Canonical attack result was incomplete')
      }
      if (committed) {
        lastBatchResult = batchResult
        lastRangePlans = activeRequest.rangePlans.slice()
        lastCanonicalEntries = activeRequest.entries
        if (!scoreDisplaySuppressed && activeRequest.scoreDisplayRequest !== null) {
          lastScoreDisplayRequest = activeRequest.scoreDisplayRequest
        }
        if (scoreDisplayRecalculationActive) {
          scoreDisplayRecalculationActive = false
          if (
            scoreDisplaySuppressed
            && state.canonicalScoreDisplayFeedback?.status === 'loading'
          ) {
            markCalculationAborted(state.canonicalScoreDisplayFeedback)
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
      // range-rejection clearResult hook. Drop the canonical result here so
      // an old canonical result cannot survive an error as a stale display.
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
      preserveCanonicalResult,
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
    const entries = snapshotCanonicalAttackEntries(state.combos)
    preserveCanonicalResultOnNextRun = preserveCanonicalResult === true
      && lastBatchResult !== null
      && lastCanonicalEntries !== null
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
    invalidateDisplayPresentation() {
      // Keep the old hook as a Score-only alias for callers that have not yet
      // switched to the explicit method name.
      invalidateScoreDisplay()
    },
    refreshPresentation(options = {}) {
      if (
        requestGeneration === null
        || lastBatchResult === null
        || lastCanonicalEntries === null
        || !isCanonicalAttackInputCurrent(
          state.combos,
          lastCanonicalEntries
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

      // Score coverage is a presentation-local decision. Do not let a Score
      // miss accidentally take the Damage path, because a Score expansion
      // must recalculate the whole canonical batch atomically only when the
      // Score action side itself needs new coverage.
      const damageDecision = presentation?.decision
      const scoreDecision = presentation?.score?.decision
      const decision = scoreOnly
        ? scoreDecision
        : damageDecision
      let scoreDisplaySuppressedForRefresh = false
      if (
        scoreOnly
        && decision
          === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RESOURCE_REJECTED
      ) {
        // The caller normally performs this preflight before entering the
        // runner. Keep the runner safe for direct callers too: a Score-only
        // resource rejection invalidates Score presentation only and never
        // clears or recalculates the committed Damage batch.
        invalidateScoreDisplay()
        return false
      }
      if (
        scoreOnly
        && (
          damageDecision
            === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RESOURCE_REJECTED
          || damageDecision
            === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.NOT_PROJECTABLE
          || damageDecision
            === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
          || decision
            === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.NOT_PROJECTABLE
        )
        && decision
          !== ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
      ) {
        presentation = mergeScoreOnlyPresentation(presentation)
      }
      if (
        !scoreOnly
        && (
          scoreDecision
            === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RESOURCE_REJECTED
          || scoreDecision
            === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.NOT_PROJECTABLE
        )
      ) {
        // A Score-only resource/projection failure must not turn a normal
        // Damage refresh into a rejected request. Suppress the Score payload
        // locally, then continue with the independent Damage decision.
        scoreDisplaySuppressedForRefresh = true
        invalidateScoreDisplay()
        presentation = suppressScoreDisplay(presentation, null)
      }
      if (
        !scoreOnly
        && (
          decision === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RESOURCE_REJECTED
          || decision === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.NOT_PROJECTABLE
        )
      ) {
        invalidateDisplayResult(presentation)
        return false
      }

      if (
        !scoreOnly
        && scoreDecision
          === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
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
          === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
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
          === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
      ) {
        if (
          requestedDisplayRequest === undefined
          || requestedScoreDisplayRequest === null
        ) {
          // There is no safe batch snapshot to run. Preserve the committed
          // Damage result while suppressing the stale Score independently.
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
          preserveCanonicalResult: true,
        })
      }

      const committedPresentation = scoreDisplayEnabled
        ? presentation
        : suppressScoreDisplay(
            presentation,
            state.canonicalScoreDisplayPresentation ?? null
          )
      const committed = commitCanonicalAttackDisplayPresentation(
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

export const createAttackCanonicalCalculationRunner = createAttackCanonicalRunner
