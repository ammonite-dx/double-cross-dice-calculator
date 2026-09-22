import {
  createBacktrackPresentation,
} from './BacktrackPresentation'
import {
  beginCalculation,
  completeCalculation,
  createCalculationRequestCoordinator,
  isCalculationRangeError,
  markCalculationAborted,
  publishRangePlan,
  recordCalculationError,
} from '../../../runtime/CalculationFeedback'
import {
  createBacktrackInputSnapshot,
} from './BacktrackInputSnapshot'

function createCalculationEnvelope(params, result) {
  return {
    params: { ...params },
    result,
  }
}

/**
 * Connect one Backtrack request lane to the calculation client API and the
 * Backtrack-specific presentation adapter. The request coordinator owns
 * feedback, abort, latest-wins, and disposal behavior.
 */
export function createBacktrackRunner({
  state,
  feedback,
  calculationClient,
  createPresentation = createBacktrackPresentation,
  onError,
}) {
  if (state === null || typeof state !== 'object') {
    throw new TypeError('createBacktrackRunner requires state')
  }
  if (feedback === null || typeof feedback !== 'object') {
    throw new TypeError('createBacktrackRunner requires feedback')
  }
  if (
    calculationClient === null
    || typeof calculationClient !== 'object'
    || typeof calculationClient.calculateBacktrack !== 'function'
  ) {
    throw new TypeError(
      'createBacktrackRunner requires calculateBacktrack'
    )
  }

  return createCalculationRequestCoordinator({
    snapshotRequest: createBacktrackInputSnapshot,
    execute: (snapshot, context) => {
      const { params, ...calculationOptions } = snapshot
      return Promise.resolve(
        calculationClient.calculateBacktrack(
          params,
          {
            ...calculationOptions,
            signal: context.signal,
            onRangePlan: context.onRangePlan,
          }
        )
      ).then((result) => createCalculationEnvelope(params, result))
    },
    onStart: () => {
      beginCalculation(feedback)
      state.presentation = null
      state.resultReady = false
    },
    onPlan: (plan) => publishRangePlan(feedback, plan),
    commit: (envelope) => {
      state.presentation = createPresentation(
        envelope.result,
        envelope.params
      )
      state.resultReady = true
    },
    onCommitted: () => completeCalculation(feedback),
    onCancelled: () => markCalculationAborted(feedback),
    onError: (error) => {
      //  errors must not leave the previous chart visible or fall
      // back to the legacy calculation. A later run can retry normally.
      recordCalculationError(feedback, error)
      state.presentation = null
      state.resultReady = false
      if (!isCalculationRangeError(error)) {
        onError?.(error)
      }
    },
  })
}
