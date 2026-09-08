const DEFAULT_MIN_RENDERED_POINTS = 128
const DEFAULT_MAX_RENDERED_POINTS = 1_024
const DEFAULT_MIN_HORIZONTAL_SPACING = 2

export const PROBABILITY_RENDER_BUDGET_DEFAULTS = Object.freeze({
  minRenderedPoints: DEFAULT_MIN_RENDERED_POINTS,
  maxRenderedPoints: DEFAULT_MAX_RENDERED_POINTS,
  minHorizontalSpacing: DEFAULT_MIN_HORIZONTAL_SPACING,
})

function normalizePositiveSafeInteger(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}

/**
 * Derive a chart point budget from the available horizontal pixels.
 * Calculation inputs never pass through this helper; it is presentation-only.
 */
export function getProbabilityRenderBudget(width, options = {}) {
  const minRenderedPoints = normalizePositiveSafeInteger(
    options.minRenderedPoints,
    DEFAULT_MIN_RENDERED_POINTS
  )
  const maxRenderedPoints = Math.max(
    minRenderedPoints,
    normalizePositiveSafeInteger(
      options.maxRenderedPoints,
      DEFAULT_MAX_RENDERED_POINTS
    )
  )
  const minHorizontalSpacing = normalizePositiveSafeInteger(
    options.minHorizontalSpacing,
    DEFAULT_MIN_HORIZONTAL_SPACING
  )
  const measuredWidth = Number.isFinite(width) && width > 0
    ? Math.floor(width)
    : maxRenderedPoints * minHorizontalSpacing
  const derived = Math.floor(measuredWidth / minHorizontalSpacing)
  return Math.min(
    maxRenderedPoints,
    Math.max(minRenderedPoints, derived)
  )
}

export const DEFAULT_PROBABILITY_RENDER_BUDGET = getProbabilityRenderBudget(
  DEFAULT_MAX_RENDERED_POINTS * DEFAULT_MIN_HORIZONTAL_SPACING
)
