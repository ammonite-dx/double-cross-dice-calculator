import {
  createBacktrackCanonicalPresentation,
} from '../presentation/BacktrackCanonicalPresentation'
import {
  createLatestCalculationRunner,
} from './CalculationFeedback'
import {
  createBacktrackInputSnapshot,
} from './BacktrackInputSnapshot'

/**
 * Snapshot the validated Backtrack inputs together with the temporary
 * migration lane selection. The form continues to emit only its existing
 * validated params contract; the opt-in flag is added by the view boundary.
 */
export function createBacktrackCalculationSnapshot(draft = {}) {
  const inputSnapshot = createBacktrackInputSnapshot(draft)
  return {
    params: { ...inputSnapshot.params },
    canonicalOptIn: draft?.canonicalOptIn === true,
  }
}

function createCalculationEnvelope(canonicalOptIn, params, result) {
  return {
    canonicalOptIn,
    params: { ...params },
    result,
  }
}

/**
 * Connect one Backtrack request lane to either the unchanged legacy client
 * API or the explicit canonical API. Both modes share feedback, preflight,
 * abort, latest-wins, and disposal behavior. Canonical results cross the
 * Backtrack-specific presentation adapter before entering legacy chart state.
 */
export function createBacktrackCalculationRunner({
  state,
  feedback,
  calculationClient,
  createPresentation = createBacktrackCanonicalPresentation,
  onError,
}) {
  if (state === null || typeof state !== 'object') {
    throw new TypeError('createBacktrackCalculationRunner requires state')
  }
  if (feedback === null || typeof feedback !== 'object') {
    throw new TypeError('createBacktrackCalculationRunner requires feedback')
  }
  if (
    calculationClient === null
    || typeof calculationClient !== 'object'
    || typeof calculationClient.calculateBacktrack !== 'function'
    || typeof calculationClient.calculateBacktrackCanonical !== 'function'
  ) {
    throw new TypeError(
      'createBacktrackCalculationRunner requires both Backtrack client APIs'
    )
  }

  const latestRunner = createLatestCalculationRunner({
    feedback,
    snapshotRequest: createBacktrackCalculationSnapshot,
    calculate: (snapshot) => {
      const {
        params,
        canonicalOptIn,
        ...calculationOptions
      } = snapshot
      const calculation = canonicalOptIn
        ? calculationClient.calculateBacktrackCanonical(
            params,
            calculationOptions
          )
        : calculationClient.calculateBacktrack(
            params,
            calculationOptions
          )
      return Promise.resolve(calculation).then((result) =>
        createCalculationEnvelope(canonicalOptIn, params, result)
      )
    },
    clearResult: () => {
      state.finalEncroachment = null
      state.resultReady = false
    },
    commitResult: (envelope) => {
      const finalEncroachment = envelope.canonicalOptIn
        ? createPresentation(envelope.result, envelope.params)
            .finalEncroachment
        : envelope.result
      state.finalEncroachment = finalEncroachment
      state.resultReady = true
    },
    onError: (error) => {
      // Resource and presentation errors must not leave the previous chart
      // visible, and canonical errors never fall back to the legacy result.
      state.finalEncroachment = null
      state.resultReady = false
      onError?.(error)
    },
  })

  return latestRunner
}

