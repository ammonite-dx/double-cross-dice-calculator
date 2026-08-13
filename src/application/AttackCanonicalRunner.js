import { createAttackCanonicalPresentation } from './AttackCanonicalPresentation'
import {
  commitCanonicalAttackResult,
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
  onError,
}) {
  let requestGeneration = null
  let activeRequest = null

  const latestRunner = createLatestCalculationRunner({
    feedback: state.canonicalFeedback,
    calculate: (options) => {
      const requestEntries = snapshotCanonicalAttackEntries(state.combos)
      const requestRangePlans = []
      activeRequest = {
        entries: requestEntries,
        rangePlans: requestRangePlans,
      }
      return calculationClient.calculateAttackCanonicalBatch(
        requestEntries,
        {
          ...options,
          onRangePlan: (plan) => {
            requestRangePlans.push(plan)
            options.onRangePlan?.(plan)
          },
        }
      )
    },
    clearResult: () => {
      requestGeneration = invalidateCanonicalAttackState(state)
      activeRequest = null
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
      return committed
    },
    onError,
  })

  return {
    run(options = {}) {
      if (state.canonicalOptIn !== true) {
        return Promise.resolve(false)
      }
      return latestRunner.run(options)
    },
    invalidate: latestRunner.invalidate,
  }
}

export const createAttackCanonicalCalculationRunner = createAttackCanonicalRunner
