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
  let activeRequest = null
  let lastBatchResult = null
  let lastRangePlans = []
  let lastCanonicalEntries = null

  function clearRequestCache() {
    activeRequest = null
    lastBatchResult = null
    lastRangePlans = []
    lastCanonicalEntries = null
  }

  function invalidateDisplayResult(presentation) {
    latestRunner.invalidate()
    displayRequestGeneration += 1
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
    }) => {
      const requestRangePlans = []
      activeRequest = {
        entries,
        rangePlans: requestRangePlans,
        displayRequest: displayRequest ?? null,
        displayRequestGeneration: requestDisplayGeneration ?? null,
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
      const presentation = activeRequest.displayRequest === null
        ? createPresentation(batchResult, activeRequest.rangePlans)
        : createPresentation(
            batchResult,
            activeRequest.rangePlans,
            activeRequest.displayRequest
          )
      const committed = commitCanonicalAttackResult(
        state,
        requestGeneration,
        batchResult,
        presentation
      )
      if (!committed && requestGeneration === state.canonicalGeneration) {
        throw new Error('Canonical attack result was incomplete')
      }
      if (committed) {
        lastBatchResult = batchResult
        lastRangePlans = activeRequest.rangePlans.slice()
        lastCanonicalEntries = activeRequest.entries
        onPresentation?.(presentation)
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
    return latestRunner.run({
      entries: snapshotCanonicalAttackEntries(state.combos),
      calculationOptions,
      signal,
      onRangePlan,
      displayRequest: requestDisplay,
      displayRequestGeneration: requestDisplayGeneration,
    })
  }

  return {
    run,
    invalidate() {
      latestRunner.invalidate()
      displayRequestGeneration += 1
      requestGeneration = null
      clearRequestCache()
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

      const nextDisplayRequestGeneration = ++displayRequestGeneration
      const presentation = createDisplayPresentation
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
          })
        : Object.prototype.hasOwnProperty.call(options, 'displayRequest')
          ? createPresentation(
              lastBatchResult,
              lastRangePlans,
              createAttackDisplayRequestSnapshot(options.displayRequest)
            )
          : createPresentation(lastBatchResult, lastRangePlans)

      const decision = presentation?.decision
      if (
        decision === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RESOURCE_REJECTED
        || decision === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.NOT_PROJECTABLE
      ) {
        invalidateDisplayResult(presentation)
        return false
      }

      if (
        decision === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
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
        })
      }

      const committed = commitCanonicalAttackDisplayPresentation(
        state,
        requestGeneration,
        presentation
      )
      if (committed) {
        onPresentation?.(presentation)
      }
      return committed
    },
    dispose() {
      latestRunner.dispose()
      displayRequestGeneration += 1
      requestGeneration = null
      clearRequestCache()
    },
  }
}

export const createAttackCanonicalCalculationRunner = createAttackCanonicalRunner
