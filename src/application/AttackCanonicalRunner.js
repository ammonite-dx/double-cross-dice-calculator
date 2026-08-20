import { createAttackCanonicalPresentation } from './AttackCanonicalPresentation'
import {
  commitCanonicalAttackResult,
  commitCanonicalAttackDisplayPresentation,
  invalidateCanonicalAttackState,
  isCanonicalAttackInputCurrent,
  snapshotCanonicalAttackEntries,
} from './AttackCanonicalState'
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
  onError,
}) {
  let requestGeneration = null
  let activeRequest = null
  let lastBatchResult = null
  let lastRangePlans = []
  let lastCanonicalEntries = null

  const latestRunner = createLatestCalculationRunner({
    feedback: state.canonicalFeedback,
    calculate: ({ entries, calculationOptions, signal, onRangePlan }) => {
      const requestRangePlans = []
      activeRequest = {
        entries,
        rangePlans: requestRangePlans,
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
      activeRequest = null
      lastBatchResult = null
      lastRangePlans = []
      lastCanonicalEntries = null
    },
    commitResult: (batchResult) => {
      if (
        activeRequest === null
        || !isCanonicalAttackInputCurrent(
          state.combos,
          activeRequest.entries
        )
      ) {
        return false
      }
      const presentation = createPresentation(
        batchResult,
        activeRequest.rangePlans
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
      activeRequest = null
      lastBatchResult = null
      lastRangePlans = []
      lastCanonicalEntries = null
      onError?.(error)
    },
  })

  return {
    run(options = {}) {
      if (state.canonicalOptIn !== true) {
        return Promise.resolve(false)
      }
      const {
        signal,
        onRangePlan,
        ...calculationOptions
      } = options ?? {}
      return latestRunner.run({
        entries: snapshotCanonicalAttackEntries(state.combos),
        calculationOptions,
        signal,
        onRangePlan,
      })
    },
    invalidate() {
      latestRunner.invalidate()
      requestGeneration = null
      activeRequest = null
      lastBatchResult = null
      lastRangePlans = []
      lastCanonicalEntries = null
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

      const presentation = createDisplayPresentation
        ? createDisplayPresentation({
            state,
            generation: requestGeneration,
            batchResult: lastBatchResult,
            rangePlans: lastRangePlans,
            ...options,
          })
        : createPresentation(lastBatchResult, lastRangePlans)
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
      requestGeneration = null
      activeRequest = null
      lastBatchResult = null
      lastRangePlans = []
      lastCanonicalEntries = null
    },
  }
}

export const createAttackCanonicalCalculationRunner = createAttackCanonicalRunner
