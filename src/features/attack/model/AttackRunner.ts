import {
  ATTACK_DISPLAY_PRESENTATION_DECISIONS,
  createAttackPresentation,
  createAttackDisplayPresentationFrom,
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
import type {
  AttackRunner,
  AttackRunnerOptions,
  AttackPresentationProjectionRequest,
  AttackRunnerRequestSnapshot,
  AttackRunnerRefreshOptions,
  AttackRunnerRunOptions,
} from './AttackRunnerTypes'
import type {
  AttackDisplayPresentation,
  AttackPresentation,
} from './AttackPresentationTypes'
import type { DisplayRequestSnapshot } from '../../../domain/CalculationInputs'
import type { AttackIncrementalExecution } from './AttackIncrementalExecutionTypes'
import type { AttackCalculationOptions } from '../../../runtime/CalculationClientTypes'
import type { AttackCalculationRangePlan } from '../../../calculation/planning/RangePlannerTypes'

/** @typedef {import('./AttackRunnerTypes').AttackRunnerOptions} AttackRunnerOptions */
/** @typedef {import('./AttackRunnerTypes').AttackRunner} AttackRunner */

/**
 * Connect the attack batch client to a latest-request runner.
 * The runner is UI-independent and owns the current calculation lane.
 *
 * @param {import('./AttackRunnerTypes').AttackRunnerOptions} options
 * @returns {import('./AttackRunnerTypes').AttackRunner}
 */
export function createAttackRunner({
  state,
  executeCalculation,
  createBasePresentation,
  projectPresentation,
  onPresentation,
  onDisplayRejected,
  onError,
}: AttackRunnerOptions): AttackRunner {
  if (typeof executeCalculation !== 'function') {
    throw new TypeError(
      'createAttackRunner requires an incremental executeCalculation function'
    )
  }
  const basePresentationFactory = createBasePresentation ?? createAttackPresentation
  const presentationProjector = projectPresentation
    ?? ((basePresentation, request) =>
      createAttackDisplayPresentationFrom(basePresentation, request))
  // Calculation request identity belongs to the Coordinator. This separate
  // value tracks the latest damage projection request so an older calculation
  // can still commit reusable records without restoring an obsolete window.
  let currentDisplayRequest: DisplayRequestSnapshot | null = null
  let displayRevision = 0
  let scoreDisplayLifecycle: {
    status: 'enabled' | 'recalculating' | 'suppressed'
    revision: number
    request: DisplayRequestSnapshot | null
  } = {
    status: 'enabled',
    revision: 0,
    request: null,
  }
  // Keep error provenance tied to the coordinator revision. A presentation
  // retry may clear only its own error; a later calculation error must remain
  // visible until a successful calculation commits.
  let feedbackErrorProvenance: {
    kind: 'none' | 'presentation' | 'calculation'
  } = { kind: 'none' }
  let presentationErrorToken: unknown = null

  function clearScoreDisplayPresentation(): void {
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

  function beginScoreDisplayRecalculation(): void {
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

  function cancelScoreDisplayRecalculation(): void {
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

  function invalidateScoreDisplay(): void {
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

  function suppressScoreDisplay(
    presentation: AttackDisplayPresentation,
    score: AttackDisplayPresentation['score'] = null,
  ): AttackDisplayPresentation {
    return Object.freeze({
      ...presentation,
      score,
    })
  }

  function projectBasePresentation(
    basePresentation: AttackPresentation,
    request: DisplayRequestSnapshot | null,
    scoreRequest: DisplayRequestSnapshot | null,
  ): AttackDisplayPresentation {
    const projectionRequest: AttackPresentationProjectionRequest = {
      ...(request === null ? {} : { displayRequest: request }),
      ...(scoreRequest === null ? {} : { scoreDisplayRequest: scoreRequest }),
    }
    return presentationProjector(basePresentation, projectionRequest)
  }

  function sameDisplayRequest(
    left: DisplayRequestSnapshot | null,
    right: DisplayRequestSnapshot | null,
  ): boolean {
    return left === right
      || (left !== null
        && right !== null
        && left.min === right.min
        && left.max === right.max
        && left.mode === right.mode)
  }

  function mergeScoreOnlyPresentation(
    presentation: AttackDisplayPresentation,
  ): AttackDisplayPresentation {
    const current = state.displayPresentation
    if (current === null) {
      return presentation
    }
    return Object.freeze({
      ...current,
      score: presentation.score ?? null,
    })
  }

  function invalidateDisplayResult(presentation: AttackDisplayPresentation): void {
    calculationCoordinator.invalidate()
    displayRevision += 1
    invalidateScoreDisplay()
    state.displayPresentation = null
    onDisplayRejected?.(presentation)
  }

  function handleCalculationError(error: unknown): void {
    if (scoreDisplayLifecycle.status === 'recalculating') {
      scoreDisplayLifecycle = {
        ...scoreDisplayLifecycle,
        status: 'suppressed',
        request: null,
      }
      recordCalculationError(state.scoreDisplayFeedback, error)
    }
    const errorRecord = error !== null && typeof error === 'object'
      ? error as Record<string, unknown>
      : undefined
    const stage = errorRecord?.attackExecutionStage
    if (stage === 'combo') {
      invalidateAttackComboCalculation(
        state,
        errorRecord?.attackExecutionEntryId
      )
      invalidateAttackTotalCalculation(state)
    } else if (stage === 'total') {
      invalidateAttackTotalCalculation(state)
    } else {
      // Presentation failures do not invalidate a valid calculation record.
      state.basePresentation = null
      state.displayPresentation = null
    }
  }

  function snapshotRequest(
    request: AttackRunnerRequestSnapshot,
  ): AttackRunnerRequestSnapshot {
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
      // These revisions select the presentation request at commit time. They
      // must not be replaced with null or used to reject numeric work.
      displayRevision: request.displayRevision,
      scoreDisplayRevision: request.scoreDisplayRevision,
    }
  }

  const calculationCoordinator = createCalculationRequestCoordinator<
    AttackRunnerRequestSnapshot,
    AttackIncrementalExecution,
    AttackCalculationRangePlan,
    AttackCalculationOptions
  >({
    snapshotRequest,
    execute: (request, context) => executeCalculation({
      ...request,
      signal: context.signal ?? undefined,
      onRangePlan: context.onRangePlan,
    }),
    onStart: (request) => {
      beginCalculation(state.feedback)
      feedbackErrorProvenance = { kind: 'none' }
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
      // Coordinator revision and input identity decide whether numeric work
      // may commit. Display revisions only decide which projection to build.
      if (
        !isAttackInputCurrent(state.combos, request.entries)
      ) {
        return false
      }
      const scoreDisplaySuppressed = scoreDisplayLifecycle.status === 'suppressed'
      const displayRequestIsCurrent = request.displayRevision === null
        || request.displayRevision === displayRevision
      const displayRequestForProjection = displayRequestIsCurrent
        ? request.displayRequest ?? currentDisplayRequest
        : currentDisplayRequest
      const scoreDisplayRequestIsCurrent =
        request.scoreDisplayRevision !== null
        && request.scoreDisplayRevision === scoreDisplayLifecycle.revision
      const scoreDisplayRequestForProjection = scoreDisplaySuppressed
        ? null
        : scoreDisplayRequestIsCurrent
          ? request.scoreDisplayRequest ?? scoreDisplayLifecycle.request
          : scoreDisplayLifecycle.request ?? request.scoreDisplayRequest
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
      if (
        !scoreDisplaySuppressed
        && scoreDisplayRequestForProjection !== null
      ) {
        scoreDisplayLifecycle = {
          ...scoreDisplayLifecycle,
          status: 'enabled',
          request: scoreDisplayRequestForProjection,
        }
      }
      const previousScoreDisplayPresentation =
        state.displayPresentation?.score ?? null
      state.basePresentation = null
      state.displayPresentation = null

      let basePresentation: AttackPresentation
      let presentation: AttackDisplayPresentation
      try {
        basePresentation = basePresentationFactory(
          committedSnapshot.batchResult,
          committedSnapshot.rangePlans
        )
        presentation = projectBasePresentation(
          basePresentation,
          displayRequestForProjection,
          scoreDisplayRequestForProjection
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
            : scoreDisplayRequestForProjection,
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
    onError: (error) => {
      const isPresentationError = presentationErrorToken === error
      presentationErrorToken = null
      if (isPresentationError) {
        feedbackErrorProvenance = { kind: 'presentation' }
      } else {
        feedbackErrorProvenance = { kind: 'calculation' }
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

  const run = (
    options: AttackRunnerRunOptions = {},
    internal: { preservePresentation?: boolean } = {},
  ): Promise<boolean> => {
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
    if (requestDisplay !== null) {
      currentDisplayRequest = requestDisplay
    }
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
    invalidateForValidation() {
      // A draft is not a committed input yet. Revoke pending calculation
      // commits immediately, but let the UI retain its last ready frame until
      // validation resolves. Invalid confirmation uses invalidate() and
      // clears that frame.
      calculationCoordinator.invalidate()
      displayRevision += 1
      cancelScoreDisplayRecalculation()
    },
    invalidateScoreDisplay() {
      invalidateScoreDisplay()
    },
    refreshPresentation(options: AttackRunnerRefreshOptions = {}) {
      const committedSnapshot = getCommittedAttackCalculationSnapshot(state)
      if (committedSnapshot === null
        || !isAttackInputCurrent(state.combos, committedSnapshot.entries)) {
        return false
      }

      const scoreOnly = options.scoreOnly === true
      const hasDisplayRequest = Object.prototype.hasOwnProperty.call(
        options,
        'displayRequest'
      )
      const requestedDisplayRequest = hasDisplayRequest
        ? createAttackDisplayRequestSnapshot(options.displayRequest)
        : undefined
      const hasScoreDisplayRequest = Object.prototype.hasOwnProperty.call(
        options,
        'scoreDisplayRequest'
      )
      const requestedScoreDisplayRequest = hasScoreDisplayRequest
        ? createAttackDisplayRequestSnapshot(options.scoreDisplayRequest)
        : scoreDisplayLifecycle.request
      const scoreDisplayRequestChanged = hasScoreDisplayRequest
        && !sameDisplayRequest(
          requestedScoreDisplayRequest,
          scoreDisplayLifecycle.request
        )
      const damageDisplayRequestChanged = requestedDisplayRequest !== undefined
        && !sameDisplayRequest(requestedDisplayRequest, currentDisplayRequest)
      if (!scoreOnly || damageDisplayRequestChanged) {
        displayRevision += 1
      }
      if (!scoreOnly) {
        // When the caller relies on the projector's live source of truth,
        // discard a previously captured request. A failed projection must
        // not make that older snapshot look current on a later calculation.
        currentDisplayRequest = requestedDisplayRequest ?? null
      }
      if (requestedDisplayRequest !== undefined) {
        currentDisplayRequest = requestedDisplayRequest
      }
      if (scoreOnly || scoreDisplayRequestChanged) {
        scoreDisplayLifecycle = {
          ...scoreDisplayLifecycle,
          status: 'enabled',
          revision: scoreDisplayLifecycle.revision + 1,
          request: requestedScoreDisplayRequest,
        }
      }
      let basePresentation = state.basePresentation
      let presentation: AttackDisplayPresentation
      try {
        // A base presentation is itself a presentation artifact. If a prior
        // base/display attempt failed before it was committed, rebuild it
        // from the committed calculation records during the retry rather
        // than recalculating any combo or total.
        if (basePresentation === null) {
          basePresentation = basePresentationFactory(
            committedSnapshot.batchResult,
            committedSnapshot.rangePlans
          )
        }
        presentation = projectBasePresentation(
          basePresentation,
          requestedDisplayRequest ?? null,
          requestedScoreDisplayRequest
        )
      } catch (error) {
        presentationErrorToken = error
        feedbackErrorProvenance = { kind: 'presentation' }
        recordCalculationError(state.feedback, error)
        handleCalculationError(error)
        onError?.(error)
        return false
      }

      if (presentation?.displayRequest !== undefined) {
        currentDisplayRequest = createAttackDisplayRequestSnapshot(
          presentation.displayRequest
        )
      }
      const effectiveDisplayRequest = requestedDisplayRequest
        ?? currentDisplayRequest
        ?? (state.displayPresentation?.displayRequest == null
          ? undefined
          : createAttackDisplayRequestSnapshot(
              state.displayPresentation.displayRequest
            ))

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
        if (effectiveDisplayRequest === undefined) {
          invalidateDisplayResult(presentation)
          return false
        }
        const calculationOptions = options.calculationOptions ?? {}
        beginScoreDisplayRecalculation()
        return run({
          ...calculationOptions,
          displayRequest: effectiveDisplayRequest,
          scoreDisplayRequest: requestedScoreDisplayRequest,
          forceAll: true,
        })
      }

      if (
        !scoreOnly
        && decision
          === ATTACK_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
      ) {
        if (effectiveDisplayRequest === undefined) {
          invalidateDisplayResult(presentation)
          return false
        }
        const calculationOptions = options.calculationOptions ?? {}
        return run({
          ...calculationOptions,
          displayRequest: effectiveDisplayRequest,
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
          effectiveDisplayRequest === undefined
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
          displayRequest: effectiveDisplayRequest,
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
          feedbackErrorProvenance = { kind: 'none' }
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
      feedbackErrorProvenance = { kind: 'none' }
      presentationErrorToken = null
    },
  }
}
