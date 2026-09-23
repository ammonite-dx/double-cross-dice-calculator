import {
  ATTACK_DISPLAY_PRESENTATION_DECISIONS,
} from './AttackPresentation'
import type { CalculationFeedbackState } from '../../../runtime/CalculationFeedbackTypes'
import type { DisplayFeedbackPlan, DisplayWarning } from '../../../shared/presentation/DistributionProjectionTypes'
import type {
  AttackDisplayPresentation,
  AttackDisplaySide,
  AttackScoreDisplayPresentation,
} from './AttackPresentationTypes'

/** @typedef {import('../../../runtime/CalculationFeedbackTypes').CalculationFeedbackState} CalculationFeedbackState */
/** @typedef {import('../../../shared/presentation/DistributionProjectionTypes').DisplayFeedbackPlan} DisplayFeedbackPlan */
/** @typedef {import('./AttackPresentationTypes').AttackDisplayPresentation} AttackDisplayPresentation */
/** @typedef {import('./AttackPresentationTypes').AttackScoreDisplayPresentation} AttackScoreDisplayPresentation */

const DISPLAY_FEEDBACK_CODES = Object.freeze({
  RECALCULATE: 'attack-display-recalculate',
  RESOURCE_REJECTED: 'attack-display-resource-rejected',
  NOT_PROJECTABLE: 'attack-display-not-projectable',
  SUMMARY_NOT_PROJECTABLE: 'attack-summary-not-projectable',
  SCORE_RECALCULATE: 'attack-score-display-recalculate',
  SCORE_RESOURCE_REJECTED: 'attack-score-display-resource-rejected',
  SCORE_NOT_PROJECTABLE: 'attack-score-display-not-projectable',
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isExactExpectedValue(expectedValue: unknown): boolean {
  return isRecord(expectedValue)
    && expectedValue.kind === 'exact'
    && typeof expectedValue.value === 'number'
    && Number.isFinite(expectedValue.value)
}

function getSides(
  presentation: AttackDisplayPresentation,
): readonly AttackDisplaySide[] {
  return [...presentation.combos, presentation.total]
}

function getScoreSides(
  presentation: AttackScoreDisplayPresentation,
): readonly AttackDisplaySide[] {
  if ('combos' in presentation) {
    return presentation.combos.flatMap((combo) =>
      combo === null ? [] : [combo.action]
    )
  }
  return [presentation.action]
}

function getDisplayWindow(
  presentation: AttackDisplayPresentation | AttackScoreDisplayPresentation,
  side: AttackDisplaySide | undefined,
): { min: number; max: number; pointCount?: number } {
  return side?.plan?.displayWindow
    ?? presentation?.displayRequest
    ?? { min: 0, max: 0, pointCount: 1 }
}

function createRejectedPlan(
  presentation: AttackDisplayPresentation | AttackScoreDisplayPresentation,
  sides: readonly AttackDisplaySide[],
  code: string,
): DisplayFeedbackPlan {
  const source = sides.find((side) => isRecord(side?.plan))
  const displayWindow = getDisplayWindow(presentation, source)
  const pointCount = typeof displayWindow.pointCount === 'number'
    && Number.isSafeInteger(displayWindow.pointCount)
    ? displayWindow.pointCount
    : displayWindow.max - displayWindow.min + 1
  const warnings: readonly DisplayWarning[] = [Object.freeze({
    code,
    severity: 'reject',
    message: 'Attack display is not ready for this window',
  })]
  return {
    accepted: false,
    status: 'resource-rejected',
    decision: 'terminal',
    reason: 'display-terminal',
    displayWindow: {
      min: displayWindow.min,
      max: displayWindow.max,
      pointCount,
    },
    estimates: source?.plan?.estimates ?? {
      pointCount,
      float64Bytes: pointCount * Float64Array.BYTES_PER_ELEMENT,
      chartPoints: pointCount,
    },
    warnings,
    rejectionReasons: [code],
  }
}

/**
 * Adapt the UI-independent Attack display decision to the feedback state
 * consumed by RangePlanNotice.
 *
 * @param {AttackDisplayPresentation|null} presentation
 * @returns {CalculationFeedbackState<DisplayFeedbackPlan>}
 */
export function createAttackDisplayFeedback(
  presentation: AttackDisplayPresentation | null,
): CalculationFeedbackState<DisplayFeedbackPlan> {
  if (!isRecord(presentation)) {
    return {
      status: 'idle',
      plan: null,
      error: null,
    }
  }

  const sides = getSides(presentation)
  const decision = presentation.decision
  if (
    decision === ATTACK_DISPLAY_PRESENTATION_DECISIONS.RESOURCE_REJECTED
  ) {
    return {
      status: 'rejected',
      plan: createRejectedPlan(
        presentation,
        sides,
        DISPLAY_FEEDBACK_CODES.RESOURCE_REJECTED
      ),
      error: null,
    }
  }

  if (
    decision === ATTACK_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
  ) {
    return {
      status: 'rejected',
      plan: createRejectedPlan(
        presentation,
        sides,
        DISPLAY_FEEDBACK_CODES.RECALCULATE
      ),
      error: null,
    }
  }

  if (
    decision === ATTACK_DISPLAY_PRESENTATION_DECISIONS.NOT_PROJECTABLE
  ) {
    return {
      status: 'rejected',
      plan: createRejectedPlan(
        presentation,
        sides,
        DISPLAY_FEEDBACK_CODES.NOT_PROJECTABLE
      ),
      error: null,
    }
  }

  const summaryUnavailable = sides.some((side) =>
    !isExactExpectedValue(side?.display?.expectedValue)
  )
  if (summaryUnavailable) {
    return {
      status: 'idle',
      plan: null,
      error: null,
    }
  }

  return {
    status: 'idle',
    // Range-plan warnings describe internal approximation/coverage metadata,
    // not an actionable UI failure. Keep them out of the normal view.
    plan: null,
    error: null,
  }
}

/**
 * Adapt the independent score display decision to the same
 * RangePlanNotice feedback lane. score coverage is deliberately terminal in
 * this phase: this helper never asks the calculation runner to recalculate.
 *
 * @param {AttackScoreDisplayPresentation|null} presentation
 * @returns {CalculationFeedbackState<DisplayFeedbackPlan>}
 */
export function createAttackScoreDisplayFeedback(
  presentation: AttackScoreDisplayPresentation | null,
): CalculationFeedbackState<DisplayFeedbackPlan> {
  if (!isRecord(presentation)) {
    return {
      status: 'idle',
      plan: null,
      error: null,
    }
  }

  const sides = getScoreSides(presentation)
  const decision = presentation.decision
  if (decision === ATTACK_DISPLAY_PRESENTATION_DECISIONS.RESOURCE_REJECTED) {
    return {
      status: 'rejected',
      plan: createRejectedPlan(
        presentation,
        sides,
        DISPLAY_FEEDBACK_CODES.SCORE_RESOURCE_REJECTED
      ),
      error: null,
    }
  }

  if (decision === ATTACK_DISPLAY_PRESENTATION_DECISIONS.NOT_PROJECTABLE) {
    return {
      status: 'rejected',
      plan: createRejectedPlan(
        presentation,
        sides,
        DISPLAY_FEEDBACK_CODES.SCORE_NOT_PROJECTABLE
      ),
      error: null,
    }
  }

  if (
    decision === ATTACK_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
    || presentation.status === 'not-ready'
  ) {
    return {
      status: 'rejected',
      plan: createRejectedPlan(
        presentation,
        sides,
        DISPLAY_FEEDBACK_CODES.SCORE_RECALCULATE
      ),
      error: null,
    }
  }

  return {
    status: 'idle',
    // score uncertainty is represented by the neutral summary value. Only
    // terminal/rejected display decisions reach RangePlanNotice.
    plan: null,
    error: null,
  }
}

export const ATTACK_DISPLAY_FEEDBACK_CODES = DISPLAY_FEEDBACK_CODES

export const ATTACK_SCORE_DISPLAY_FEEDBACK_CODES = Object.freeze({
  RECALCULATE: DISPLAY_FEEDBACK_CODES.SCORE_RECALCULATE,
  RESOURCE_REJECTED: DISPLAY_FEEDBACK_CODES.SCORE_RESOURCE_REJECTED,
  NOT_PROJECTABLE: DISPLAY_FEEDBACK_CODES.SCORE_NOT_PROJECTABLE,
})
