import {
  createBacktrackCanonicalPresentation,
} from './BacktrackCanonicalPresentation'
import {
  createLatestCalculationRunner,
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
 * Connect one Backtrack request lane to the canonical client API and the
 * Backtrack-specific presentation adapter. The shared runner owns feedback,
 * preflight, abort, latest-wins, and disposal behavior.
 */
export function createBacktrackCanonicalRunner({
  state,
  feedback,
  calculationClient,
  createPresentation = createBacktrackCanonicalPresentation,
  onError,
}) {
  if (state === null || typeof state !== 'object') {
    throw new TypeError('createBacktrackCanonicalRunner requires state')
  }
  if (feedback === null || typeof feedback !== 'object') {
    throw new TypeError('createBacktrackCanonicalRunner requires feedback')
  }
  if (
    calculationClient === null
    || typeof calculationClient !== 'object'
    || typeof calculationClient.calculateBacktrackCanonical !== 'function'
  ) {
    throw new TypeError(
      'createBacktrackCanonicalRunner requires calculateBacktrackCanonical'
    )
  }

  return createLatestCalculationRunner({
    feedback,
    snapshotRequest: createBacktrackInputSnapshot,
    calculate: (snapshot) => {
      const { params, ...calculationOptions } = snapshot
      return Promise.resolve(
        calculationClient.calculateBacktrackCanonical(
          params,
          calculationOptions
        )
      ).then((result) => createCalculationEnvelope(params, result))
    },
    clearResult: () => {
      state.finalEncroachment = null
      state.resultReady = false
    },
    commitResult: (envelope) => {
      state.finalEncroachment = createPresentation(
        envelope.result,
        envelope.params
      ).finalEncroachment
      state.resultReady = true
    },
    onError: (error) => {
      // Canonical errors must not leave the previous chart visible or fall
      // back to the legacy calculation. A later run can retry normally.
      state.finalEncroachment = null
      state.resultReady = false
      onError?.(error)
    },
  })
}
