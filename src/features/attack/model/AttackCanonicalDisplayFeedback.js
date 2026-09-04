import {
  ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS,
} from './AttackCanonicalPresentation'

const DISPLAY_FEEDBACK_CODES = Object.freeze({
  RECALCULATE: 'attack-display-recalculate',
  RESOURCE_REJECTED: 'attack-display-resource-rejected',
  NOT_PROJECTABLE: 'attack-display-not-projectable',
  SUMMARY_NOT_PROJECTABLE: 'attack-summary-not-projectable',
  SCORE_RECALCULATE: 'attack-score-display-recalculate',
  SCORE_RESOURCE_REJECTED: 'attack-score-display-resource-rejected',
  SCORE_NOT_PROJECTABLE: 'attack-score-display-not-projectable',
})

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isExactExpectedValue(expectedValue) {
  return isRecord(expectedValue)
    && expectedValue.kind === 'exact'
    && typeof expectedValue.value === 'number'
    && Number.isFinite(expectedValue.value)
}

function getSides(presentation) {
  return [
    ...(Array.isArray(presentation?.combos) ? presentation.combos : []),
    ...(isRecord(presentation?.total) ? [presentation.total] : []),
  ]
}

function getScoreSides(presentation) {
  return (Array.isArray(presentation?.combos)
    ? presentation.combos
    : []
  )
    .map((combo) => combo?.action)
    .filter((side) => isRecord(side))
}

function getDisplayWindow(presentation, side) {
  return side?.plan?.displayWindow
    ?? presentation?.displayRequest
    ?? { min: 0, max: 0, pointCount: 1 }
}

function createRejectedPlan(presentation, sides, code) {
  const source = sides.find((side) => isRecord(side?.plan))
  const displayWindow = getDisplayWindow(presentation, source)
  const pointCount = Number.isSafeInteger(displayWindow.pointCount)
    ? displayWindow.pointCount
    : displayWindow.max - displayWindow.min + 1
  const warnings = [{
    code,
    severity: 'reject',
    message: 'Attack canonical display is not ready for this window',
  }]
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
 * Adapt the UI-independent Attack display decision to the existing feedback
 * state consumed by RangePlanNotice. This never creates a legacy display.
 */
export function createAttackCanonicalDisplayFeedback(presentation) {
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
    decision === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RESOURCE_REJECTED
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
    decision === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
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
    decision === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.NOT_PROJECTABLE
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
 * Adapt the independent canonical Score display decision to the same
 * RangePlanNotice feedback lane. Score coverage is deliberately terminal in
 * this phase: this helper never asks the calculation runner to recalculate.
 */
export function createAttackCanonicalScoreDisplayFeedback(presentation) {
  if (!isRecord(presentation)) {
    return {
      status: 'idle',
      plan: null,
      error: null,
    }
  }

  const sides = getScoreSides(presentation)
  const decision = presentation.decision
  if (decision === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RESOURCE_REJECTED) {
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

  if (decision === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.NOT_PROJECTABLE) {
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
    decision === ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
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
    // Score uncertainty is represented by the neutral summary value. Only
    // terminal/rejected display decisions reach RangePlanNotice.
    plan: null,
    error: null,
  }
}

export const ATTACK_CANONICAL_DISPLAY_FEEDBACK_CODES = DISPLAY_FEEDBACK_CODES

export const ATTACK_CANONICAL_SCORE_DISPLAY_FEEDBACK_CODES = Object.freeze({
  RECALCULATE: DISPLAY_FEEDBACK_CODES.SCORE_RECALCULATE,
  RESOURCE_REJECTED: DISPLAY_FEEDBACK_CODES.SCORE_RESOURCE_REJECTED,
  NOT_PROJECTABLE: DISPLAY_FEEDBACK_CODES.SCORE_NOT_PROJECTABLE,
})
