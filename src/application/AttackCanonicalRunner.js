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
import { createLatestCalculationRunner } from './CalculationFeedback'

/**
 * Connect the canonical attack batch client to a latest-request runner.
 * The runner is UI-independent; callers decide when the opt-in flag should
 * start or invalidate it.
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

  function clearRequestCache() {
    activeRequest = null
    lastBatchResult = null
    lastRangePlans = []
    lastCanonicalEntries = null
    lastScoreDisplayRequest = null
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
      requestGeneration = invalidateCanonicalAttackState(state)
      clearRequestCache()
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
        onPresentation?.(committedPresentation, {
          scoreDisplaySuppressed,
        })
      }
      return committed
    },
    onError: (error) => {
      // Generic/resource errors do not pass through the coordinator's
      // range-rejection clearResult hook. Drop the canonical result here so
      // an old canonical panel cannot survive an error as a stale display.
      requestGeneration = invalidateCanonicalAttackState(state)
      clearRequestCache()
      onError?.(error)
    },
  })

  const run = (options = {}) => {
    if (state.canonicalOptIn !== true) {
      return Promise.resolve(false)
    }
    const {
      signal,
      onRangePlan,
      displayRequest,
      displayRequestGeneration: suppliedDisplayRequestGeneration,
      scoreDisplayRequest,
      scoreDisplayRequestGeneration: suppliedScoreDisplayRequestGeneration,
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
    return latestRunner.run({
      entries: snapshotCanonicalAttackEntries(state.combos),
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
      // Score-only failures must not touch the Damage/batch generation. The
      // next batch commit may still publish Damage, but its Score payload is
      // suppressed by this independent generation and state flag.
      scoreDisplayRequestGeneration += 1
      scoreDisplayEnabled = false
      lastScoreDisplayRequest = null
      clearScoreDisplayPresentation()
    },
    invalidateDisplayPresentation() {
      // Keep the old hook as a Score-only alias for callers that have not yet
      // switched to the explicit method name.
      scoreDisplayRequestGeneration += 1
      scoreDisplayEnabled = false
      lastScoreDisplayRequest = null
      clearScoreDisplayPresentation()
    },
    refreshPresentation(options = {}) {
      if (
        state.canonicalOptIn !== true
        || requestGeneration === null
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
      let presentation = createDisplayPresentation
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

      const decision = presentation?.decision
      if (
        scoreOnly
        && (
          decision === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RESOURCE_REJECTED
          || decision === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.NOT_PROJECTABLE
          || decision === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
        )
      ) {
        presentation = mergeScoreOnlyPresentation(presentation)
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
        && decision
          === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
      ) {
        let requestedDisplayRequest
        if (Object.prototype.hasOwnProperty.call(options, 'displayRequest')) {
          requestedDisplayRequest = createAttackDisplayRequestSnapshot(
            options.displayRequest
          )
        } else if (presentation?.displayRequest !== undefined) {
          requestedDisplayRequest = createAttackDisplayRequestSnapshot(
            presentation.displayRequest
          )
        }
        if (requestedDisplayRequest === undefined) {
          invalidateDisplayResult(presentation)
          return false
        }
        const calculationOptions = options.calculationOptions ?? {}
        return run({
          ...calculationOptions,
          displayRequest: requestedDisplayRequest,
          displayRequestGeneration: nextDisplayRequestGeneration,
          ...(requestedScoreDisplayRequest !== null
            ? { scoreDisplayRequest: requestedScoreDisplayRequest }
            : {}),
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
        if (scoreOnly && requestedScoreDisplayRequest !== null) {
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
