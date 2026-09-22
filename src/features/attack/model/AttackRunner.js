import {
  ATTACK_DISPLAY_PRESENTATION_DECISIONS,
  createAttackPresentation,
} from './AttackPresentation'
import {
  commitAttackCalculationExecution,
  commitAttackPresentation,
  invalidateAttackComboCalculation,
  invalidateAttackTotalCalculation,
  getCommittedAttackCalculationSnapshot,
  getAttackCalculationRecords,
  isAttackInputCurrent,
  snapshotAttackParams,
  snapshotAttackEntries,
} from './AttackState'
import { createAttackDisplayRequestSnapshot } from './AttackDisplayRequestSnapshot'
import {
  beginCalculation,
  createCalculationRequestCoordinator,
  completeCalculation,
  markCalculationAborted,
  publishRangePlan,
  recordCalculationError,
} from '../../../runtime/CalculationFeedback'

/** @typedef {import('./AttackRunnerTypes').AttackRunnerOptions} AttackRunnerOptions */
/** @typedef {import('./AttackRunnerTypes').AttackRunner} AttackRunner */

/**
 * Connect the attack batch client to a latest-request runner.
 * The runner is UI-independent and owns the current calculation lane.
 *
 * @template {import('./AttackRunnerTypes').AttackRunnerPresentation} [TPresentation=import('./AttackRunnerTypes').AttackRunnerPresentation]
 * @param {import('./AttackRunnerTypes').AttackRunnerOptions<TPresentation>} options
 * @returns {import('./AttackRunnerTypes').AttackRunner<TPresentation>}
 */
export function createAttackRunner({
  state,
  executeCalculation,
  createBasePresentation,
  createPresentation,
  createDisplayPresentation,
  onPresentation,
  onDisplayRejected,
  onError,
}) {
  if (typeof executeCalculation !== 'function') {
    throw new TypeError(
      'createAttackRunner requires an incremental executeCalculation function'
    )
  }
  const presentationFactory = createPresentation ?? createAttackPresentation
  let displayRevision = 0
  let scoreDisplayLifecycle = {
    status: 'enabled',
    revision: 0,
    request: null,
  }
  // Keep error provenance tied to the coordinator revision. A presentation
  // retry may clear only its own error; a later calculation error must remain
  // visible until a successful calculation commits.
  let feedbackErrorProvenance = { kind: 'none', revision: null }
  let presentationErrorToken = null

  function clearScoreDisplayPresentation() {
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
    scoreDisplayLifecycle = {
      ...scoreDisplayLifecycle,
      status: 'recalculating',
      request: null,
    }
    clearScoreDisplayPresentation()
    if (state.scoreDisplayFeedback) {
      beginCalculation(state.scoreDisplayFeedback)
    }
  }

  function cancelScoreDisplayRecalculation() {
    if (scoreDisplayLifecycle.status !== 'recalculating') {
      return
    }
    scoreDisplayLifecycle = {
      ...scoreDisplayLifecycle,
      status: 'suppressed',
      request: null,
    }
    if (
      state.scoreDisplayFeedback
      && state.scoreDisplayFeedback.status === 'loading'
    ) {
      markCalculationAborted(state.scoreDisplayFeedback)
    }
  }

  function invalidateScoreDisplay() {
    // score-only failures must not touch the damage/batch revision. The
    // next batch commit may still publish damage, but its score payload is
    // suppressed by this independent revision and state flag.
    cancelScoreDisplayRecalculation()
    scoreDisplayLifecycle = {
      status: 'suppressed',
      revision: scoreDisplayLifecycle.revision + 1,
      request: null,
    }
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

  function createBatchPresentation(
    batchResult,
    request,
    scoreRequest,
    rangePlans = []
  ) {
    if (request === null) {
      if (scoreRequest === null) {
        return presentationFactory(batchResult, rangePlans)
      }
      return presentationFactory(
        batchResult,
        rangePlans,
        undefined,
        scoreRequest
      )
    }
    if (scoreRequest === null) {
      return presentationFactory(
        batchResult,
        rangePlans,
        request
      )
    }
    return presentationFactory(
      batchResult,
      rangePlans,
      request,
      scoreRequest
    )
  }

  function createBaseBatchPresentation(batchResult, rangePlans) {
    if (typeof createBasePresentation !== 'function') {
      return null
    }
    return createBasePresentation(batchResult, rangePlans)
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
    calculationCoordinator.invalidate()
    displayRevision += 1
    invalidateScoreDisplay()
    state.displayPresentation = null
    onDisplayRejected?.(presentation)
  }

  function handleCalculationError(error) {
    if (scoreDisplayLifecycle.status === 'recalculating') {
      scoreDisplayLifecycle = {
        ...scoreDisplayLifecycle,
        status: 'suppressed',
        request: null,
      }
      recordCalculationError(state.scoreDisplayFeedback, error)
    }
    const stage = error?.attackExecutionStage
    if (stage === 'combo') {
      invalidateAttackComboCalculation(
        state,
        error?.attackExecutionEntryId
      )
      invalidateAttackTotalCalculation(state)
    } else if (stage === 'total') {
      state.totalCalculation = null
      state.basePresentation = null
      state.displayPresentation = null
    } else {
      // Presentation failures do not invalidate a valid calculation record.
      state.basePresentation = null
      state.displayPresentation = null
    }
  }

  function snapshotRequest(request) {
    return {
      ...request,
      entries: request.entries.map((entry) => ({
        id: entry.id,
        params: snapshotAttackParams(entry.params),
      })),
      committedRecords: request.committedRecords.map(({ id, record }) => ({
        id,
        record,
      })),
      calculationOptions: { ...request.calculationOptions },
      displayRequest: request.displayRequest === null
        ? null
        : createAttackDisplayRequestSnapshot(request.displayRequest),
      scoreDisplayRequest: request.scoreDisplayRequest === null
        ? null
        : createAttackDisplayRequestSnapshot(request.scoreDisplayRequest),
      displayRevision: null,
      scoreDisplayRevision: null,
    }
  }

  const calculationCoordinator = createCalculationRequestCoordinator({
    snapshotRequest,
    execute: (request, context) => executeCalculation({
      ...request,
      signal: context.signal,
      onRangePlan: context.onRangePlan,
    }),
    onStart: (request) => {
      beginCalculation(state.feedback)
      feedbackErrorProvenance = { kind: 'none', revision: null }
      presentationErrorToken = null
      const preserve = request.preservePresentation === true
        && getCommittedAttackCalculationSnapshot(state) !== null
      const preserveScoreLifecycle = request.scoreDisplayRequest !== null
        && scoreDisplayLifecycle.status === 'recalculating'
      if (!preserve) {
        if (!preserveScoreLifecycle) {
          cancelScoreDisplayRecalculation()
        }
        state.basePresentation = null
        state.displayPresentation = null
      }
    },
    onPlan: (plan) => {
      publishRangePlan(state.feedback, plan)
    },
    commit: (calculationResult, context) => {
      const request = context.request
      if (
        !isAttackInputCurrent(state.combos, request.entries)
        || (
          request.displayRevision !== null
          && request.displayRevision !== displayRevision
        )
      ) {
        return false
      }
      const scoreDisplaySuppressed = scoreDisplayLifecycle.status === 'suppressed'
        || (
          request.scoreDisplayRevision !== null
          && request.scoreDisplayRevision
            !== scoreDisplayLifecycle.revision
        )
      const execution = calculationResult?.batchResult
        ? calculationResult
        : null
      if (execution === null) {
        throw new Error(' attack calculation result was incomplete')
      }

      // Publish the calculation records first. Presentation is derived from
      // this state-owned snapshot and may fail without losing reusable work.
      const committedCalculation = commitAttackCalculationExecution(
        state,
        execution,
      )
      if (!committedCalculation) {
        throw new Error(' attack calculation result was incomplete')
      }
      const committedSnapshot = getCommittedAttackCalculationSnapshot(state)
      if (committedSnapshot === null) {
        throw new Error(' attack calculation snapshot was incomplete')
      }
      if (!scoreDisplaySuppressed && request.scoreDisplayRequest !== null) {
        scoreDisplayLifecycle = {
          ...scoreDisplayLifecycle,
          status: 'enabled',
          request: request.scoreDisplayRequest,
        }
      }
      const previousScoreDisplayPresentation =
        state.displayPresentation?.score ?? null
      state.basePresentation = null
      state.displayPresentation = null

      let basePresentation
      let presentation
      try {
        basePresentation = createBaseBatchPresentation(
          committedSnapshot.batchResult,
          committedSnapshot.rangePlans
        )
        presentation = createBatchPresentation(
          committedSnapshot.batchResult,
          request.displayRequest,
          request.scoreDisplayRequest,
          committedSnapshot.rangePlans
        )
      } catch (error) {
        presentationErrorToken = error
        throw error
      }
      const committedPresentation = scoreDisplaySuppressed
        ? suppressScoreDisplay(
            presentation,
            previousScoreDisplayPresentation
          )
        : presentation
      const committed = commitAttackPresentation(
        state,
        basePresentation,
        committedPresentation
      )
      if (!committed) {
        const error = new Error(' attack presentation was incomplete')
        presentationErrorToken = error
        throw error
      }
      if (scoreDisplayLifecycle.status === 'recalculating') {
        scoreDisplayLifecycle = {
          ...scoreDisplayLifecycle,
          status: scoreDisplaySuppressed ? 'suppressed' : 'enabled',
          request: scoreDisplaySuppressed
            ? null
            : request.scoreDisplayRequest,
        }
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
      return committed
    },
    onCommitted: () => {
      completeCalculation(state.feedback)
    },
    onError: (error, context) => {
      const isPresentationError = presentationErrorToken === error
      presentationErrorToken = null
      if (isPresentationError) {
        feedbackErrorProvenance = {
          kind: 'presentation',
          revision: context.revision,
        }
      } else {
        feedbackErrorProvenance = {
          kind: 'calculation',
          revision: context.revision,
        }
      }
      recordCalculationError(state.feedback, error)
      handleCalculationError(error)
      onError?.(error)
    },
    onCancelled: () => {
      cancelScoreDisplayRecalculation()
      markCalculationAborted(state.feedback)
    },
  })

  const run = (options = {}, internal = {}) => {
    const {
      signal,
      onRangePlan,
      displayRequest,
      scoreDisplayRequest,
      forceAll,
      ...calculationOptions
    } = options ?? {}
    const requestDisplay = displayRequest === undefined
      ? null
      : createAttackDisplayRequestSnapshot(displayRequest)
    const requestDisplayRevision = requestDisplay === null
      ? null
      : ++displayRevision
    const hasScoreDisplayRequest = scoreDisplayRequest !== undefined
    const requestScoreDisplay = hasScoreDisplayRequest
      ? createAttackDisplayRequestSnapshot(scoreDisplayRequest)
      : scoreDisplayLifecycle.request
        ?? state.displayPresentation?.score?.displayRequest
        ?? null
    if (hasScoreDisplayRequest) {
      const scoreRecalculationPending =
        scoreDisplayLifecycle.status === 'recalculating'
      scoreDisplayLifecycle = {
        ...scoreDisplayLifecycle,
        status: scoreRecalculationPending ? 'recalculating' : 'enabled',
        revision: scoreDisplayLifecycle.revision + 1,
        request: requestScoreDisplay,
      }
    }
    const requestScoreDisplayRevision = requestScoreDisplay === null
      ? null
      : scoreDisplayLifecycle.revision
    const entries = snapshotAttackEntries(state.combos)
    const committedRecords = getAttackCalculationRecords(state.combos)
    return calculationCoordinator.run({
      entries,
      committedRecords,
      calculationOptions,
      displayRequest: requestDisplay,
      displayRevision: requestDisplayRevision,
      scoreDisplayRequest: requestScoreDisplay,
      scoreDisplayRevision: requestScoreDisplayRevision,
      preservePresentation: internal.preservePresentation === true,
      forceAll: forceAll === true,
    }, {
      signal,
      onRangePlan,
    })
  }

  return {
    run,
    invalidate() {
      calculationCoordinator.invalidate()
      displayRevision += 1
      invalidateScoreDisplay()
    },
    invalidateScoreDisplay() {
      invalidateScoreDisplay()
    },
    refreshPresentation(options = {}) {
      const committedSnapshot = getCommittedAttackCalculationSnapshot(state)
      if (committedSnapshot === null
        || !isAttackInputCurrent(state.combos, committedSnapshot.entries)) {
        return false
      }

      const scoreOnly = options.scoreOnly === true
      if (!scoreOnly) {
        displayRevision += 1
      }
      if (scoreOnly) {
        scoreDisplayLifecycle = {
          ...scoreDisplayLifecycle,
          status: 'enabled',
          revision: scoreDisplayLifecycle.revision + 1,
        }
      }
      const requestedScoreDisplayRequest =
        Object.prototype.hasOwnProperty.call(options, 'scoreDisplayRequest')
          ? createAttackDisplayRequestSnapshot(options.scoreDisplayRequest)
          : scoreDisplayLifecycle.request
      let requestedDisplayRequest
      if (Object.prototype.hasOwnProperty.call(options, 'displayRequest')) {
        requestedDisplayRequest = createAttackDisplayRequestSnapshot(
          options.displayRequest
        )
      }
      let basePresentation = state.basePresentation
      let presentation
      try {
        // A base presentation is itself a presentation artifact. If a prior
        // base/display attempt failed before it was committed, rebuild it
        // from the committed calculation records during the retry rather
        // than recalculating any combo or total.
        if (basePresentation === null) {
          basePresentation = createBaseBatchPresentation(
            committedSnapshot.batchResult,
            committedSnapshot.rangePlans
          )
        }
        presentation = createDisplayPresentation
          ? createDisplayPresentation({
              ...options,
              state,
              batchResult: committedSnapshot.batchResult,
              rangePlans: committedSnapshot.rangePlans,
              basePresentation,
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
          : presentationFactory(
              committedSnapshot.batchResult,
              committedSnapshot.rangePlans,
              Object.prototype.hasOwnProperty.call(options, 'displayRequest')
                ? createAttackDisplayRequestSnapshot(options.displayRequest)
                : undefined,
              requestedScoreDisplayRequest ?? undefined
            )
      } catch (error) {
        presentationErrorToken = error
        feedbackErrorProvenance = {
          kind: 'presentation',
          revision: calculationCoordinator.snapshot().revision,
        }
        recordCalculationError(state.feedback, error)
        handleCalculationError(error)
        onError?.(error)
        return false
      }

      if (requestedDisplayRequest === undefined) {
        if (presentation?.displayRequest !== undefined) {
          requestedDisplayRequest = createAttackDisplayRequestSnapshot(
            presentation.displayRequest
          )
        } else if (state.displayPresentation?.displayRequest !== null
          && state.displayPresentation?.displayRequest !== undefined) {
          requestedDisplayRequest = createAttackDisplayRequestSnapshot(
            state.displayPresentation.displayRequest
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
          scoreDisplayRequest: requestedScoreDisplayRequest,
          forceAll: true,
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
          forceAll: true,
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
        beginScoreDisplayRecalculation()
        return run({
          ...calculationOptions,
          displayRequest: requestedDisplayRequest,
          scoreDisplayRequest: requestedScoreDisplayRequest,
          forceAll: true,
        }, { preservePresentation: true })
      }

      if (
        !scoreOnly
        && requestedScoreDisplayRequest !== null
        && !scoreDisplaySuppressedForRefresh
        && scoreDecision
          !== ATTACK_DISPLAY_PRESENTATION_DECISIONS.RESOURCE_REJECTED
        && scoreDecision
          !== ATTACK_DISPLAY_PRESENTATION_DECISIONS.NOT_PROJECTABLE
      ) {
        // A prior damage-display rejection also suppresses the score lane.
        // Re-enable it when this normal display refresh has a valid,
        // projectable score request; the committed calculation is reused.
        scoreDisplayLifecycle = {
          ...scoreDisplayLifecycle,
          status: 'enabled',
          request: requestedScoreDisplayRequest,
        }
      }

      const scoreDisplayAllowed = scoreDisplayLifecycle.status === 'enabled'
      const committedPresentation = scoreDisplayAllowed
        ? presentation
        : suppressScoreDisplay(
            presentation,
            state.displayPresentation?.score ?? null
          )
      const committed = commitAttackPresentation(
        state,
        basePresentation,
        committedPresentation
      )
      if (committed) {
        if (feedbackErrorProvenance.kind === 'presentation'
          && state.feedback.error !== null) {
          completeCalculation(state.feedback)
          feedbackErrorProvenance = { kind: 'none', revision: null }
        }
        if (
          requestedScoreDisplayRequest !== null
          && scoreDisplayAllowed
        ) {
          scoreDisplayLifecycle = {
            ...scoreDisplayLifecycle,
            request: requestedScoreDisplayRequest,
          }
        }
        onPresentation?.(committedPresentation, {
          scoreDisplaySuppressed: !scoreDisplayAllowed,
        })
      }
      return committed
    },
    dispose() {
      calculationCoordinator.dispose()
      displayRevision += 1
      scoreDisplayLifecycle = {
        status: 'suppressed',
        revision: scoreDisplayLifecycle.revision + 1,
        request: null,
      }
      feedbackErrorProvenance = { kind: 'none', revision: null }
      presentationErrorToken = null
    },
  }
}
