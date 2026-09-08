import {
  DISTRIBUTION_DISPLAY_VERSION,
  DISPLAY_PROBABILITY_TOLERANCE,
} from './DistributionPresenter'
import { toChartPercentage } from './ChartPercentages'

export const PROBABILITY_CHART_PROJECTION_VERSION = 1

export const PROBABILITY_CHART_PROJECTION_MODES = Object.freeze({
  PMF: 'pmf',
  UPPER_TAIL: 'upper-tail',
})

export const PROBABILITY_CHART_PROJECTION_ERROR_CODES = Object.freeze({
  INVALID_DISPLAY: 'invalid-display',
  INVALID_PLAN: 'invalid-plan',
  INVALID_OPTIONS: 'invalid-options',
  RANGE_OVERFLOW: 'range-overflow',
  NOT_READY: 'not-ready',
  NOT_PROJECTABLE: 'not-projectable',
  NOT_COVERED: 'not-covered',
})

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fail(code, message, details = {}) {
  const error = new Error(message)
  error.name = 'ProbabilityChartProjectionError'
  error.code = code
  error.details = Object.freeze({ ...details })
  error.probabilityChartProjection = true
  throw error
}

function requireSafeInteger(value, path, { nonNegative = true } = {}) {
  if (!Number.isSafeInteger(value) || (nonNegative && value < 0)) {
    fail(
      PROBABILITY_CHART_PROJECTION_ERROR_CODES.INVALID_OPTIONS,
      `${path} must be a safe integer`,
      { path, value }
    )
  }
  return value
}

function copyWindow(window, path = 'displayWindow') {
  if (!isRecord(window)) {
    fail(
      PROBABILITY_CHART_PROJECTION_ERROR_CODES.INVALID_PLAN,
      `${path} must be an object`,
      { path }
    )
  }
  const min = requireSafeInteger(window.min, `${path}.min`)
  const max = requireSafeInteger(window.max, `${path}.max`)
  if (max < min) {
    fail(
      PROBABILITY_CHART_PROJECTION_ERROR_CODES.INVALID_PLAN,
      `${path}.max must not be below min`,
      { path, min, max }
    )
  }
  const pointCount = max - min + 1
  if (!Number.isSafeInteger(pointCount)) {
    fail(
      PROBABILITY_CHART_PROJECTION_ERROR_CODES.RANGE_OVERFLOW,
      `${path} point count exceeds the safe integer range`,
      { path, min, max }
    )
  }
  return Object.freeze({ min, max, pointCount })
}

function normalizeOptions(options = {}) {
  if (!isRecord(options)) {
    fail(
      PROBABILITY_CHART_PROJECTION_ERROR_CODES.INVALID_OPTIONS,
      'options must be an object',
      { path: 'options' }
    )
  }
  const mode = options.mode ?? PROBABILITY_CHART_PROJECTION_MODES.PMF
  if (
    mode !== PROBABILITY_CHART_PROJECTION_MODES.PMF
    && mode !== PROBABILITY_CHART_PROJECTION_MODES.UPPER_TAIL
  ) {
    fail(
      PROBABILITY_CHART_PROJECTION_ERROR_CODES.INVALID_OPTIONS,
      'options.mode is not supported',
      { path: 'options.mode', mode }
    )
  }
  const maxRenderedPoints = options.maxRenderedPoints ?? 512
  requireSafeInteger(maxRenderedPoints, 'options.maxRenderedPoints')
  if (maxRenderedPoints < 1) {
    fail(
      PROBABILITY_CHART_PROJECTION_ERROR_CODES.INVALID_OPTIONS,
      'options.maxRenderedPoints must be positive',
      { path: 'options.maxRenderedPoints', maxRenderedPoints }
    )
  }
  return { mode, maxRenderedPoints }
}

function normalizeDisplay(display) {
  if (!isRecord(display) || display.kind !== 'canonical-distribution-display') {
    fail(
      PROBABILITY_CHART_PROJECTION_ERROR_CODES.INVALID_DISPLAY,
      'display must be a canonical distribution display',
      { path: 'display' }
    )
  }
  if (display.version !== DISTRIBUTION_DISPLAY_VERSION) {
    fail(
      PROBABILITY_CHART_PROJECTION_ERROR_CODES.INVALID_DISPLAY,
      'display.version is not supported',
      { path: 'display.version', version: display.version }
    )
  }
  const explicit = display.explicit
  if (!isRecord(explicit)) {
    fail(
      PROBABILITY_CHART_PROJECTION_ERROR_CODES.INVALID_DISPLAY,
      'display.explicit must be an object',
      { path: 'display.explicit' }
    )
  }
  const offset = requireSafeInteger(explicit.offset, 'display.explicit.offset')
  const probabilities = explicit.probabilities
  if (!Array.isArray(probabilities) && !(probabilities instanceof Float64Array)) {
    fail(
      PROBABILITY_CHART_PROJECTION_ERROR_CODES.INVALID_DISPLAY,
      'display.explicit.probabilities must be an array',
      { path: 'display.explicit.probabilities' }
    )
  }
  const explicitMax = probabilities.length === 0
    ? null
    : offset + probabilities.length - 1
  if (!Number.isSafeInteger(explicitMax === null ? offset : explicitMax)) {
    fail(
      PROBABILITY_CHART_PROJECTION_ERROR_CODES.RANGE_OVERFLOW,
      'explicit coverage exceeds the safe integer range',
      { offset, length: probabilities.length }
    )
  }
  if (display.explicitMax !== explicitMax) {
    fail(
      PROBABILITY_CHART_PROJECTION_ERROR_CODES.INVALID_DISPLAY,
      'display.explicitMax does not match explicit coverage',
      { explicitMax: display.explicitMax, derivedExplicitMax: explicitMax }
    )
  }
  const support = display.support
  if (!isRecord(support) || (support.kind !== 'finite' && support.kind !== 'infinite')) {
    fail(
      PROBABILITY_CHART_PROJECTION_ERROR_CODES.INVALID_DISPLAY,
      'display.support is invalid',
      { path: 'display.support' }
    )
  }
  if (support.kind === 'finite') {
    requireSafeInteger(support.max, 'display.support.max')
  }
  return {
    offset,
    probabilities,
    explicitMax,
    support,
    overflow: display.overflow,
    projectionUncertainty: display.projectionUncertainty ?? null,
  }
}

function normalizePlan(plan) {
  if (!isRecord(plan) || plan.kind !== 'display-range-plan') {
    fail(
      PROBABILITY_CHART_PROJECTION_ERROR_CODES.INVALID_PLAN,
      'plan must be a display range plan',
      { path: 'plan' }
    )
  }
  const displayWindow = copyWindow(plan.displayWindow, 'plan.displayWindow')
  if (plan.status !== 'ready' && plan.status !== 'resource-rejected') {
    fail(
      PROBABILITY_CHART_PROJECTION_ERROR_CODES.INVALID_PLAN,
      'plan.status is invalid',
      { path: 'plan.status', status: plan.status }
    )
  }
  return { plan, displayWindow }
}

function readProbability(display, value) {
  if (
    display.explicitMax !== null
    && value >= display.offset
    && value <= display.explicitMax
  ) {
    const probability = display.probabilities[value - display.offset]
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      fail(
        PROBABILITY_CHART_PROJECTION_ERROR_CODES.INVALID_DISPLAY,
        'display probability is invalid',
        { value, probability }
      )
    }
    return probability
  }
  if (display.support.kind === 'finite' && value > display.support.max) {
    return 0
  }
  fail(
    PROBABILITY_CHART_PROJECTION_ERROR_CODES.NOT_COVERED,
    'display does not cover the requested coordinate',
    { value }
  )
}

function potentialOverflow(overflow) {
  if (!isRecord(overflow)) {
    return false
  }
  return (overflow.errorBound ?? 0) > 0
    || (overflow.kind === 'exact'
      ? (overflow.probability ?? 0) > 0
      : (overflow.probabilityUpperBound ?? 0) > 0)
}

function getNotReadyReason(plan) {
  if (plan.status === 'resource-rejected') {
    return 'resource-rejected'
  }
  if (plan.decision === 'recalculate' || plan.coverage?.missingSegments?.length > 0) {
    return 'recalculate'
  }
  return null
}

function assertProjectable(display, plan, mode) {
  const notReadyReason = getNotReadyReason(plan)
  if (notReadyReason !== null) {
    return { status: 'not-ready', reason: notReadyReason }
  }
  if (plan.decision === 'known-zero') {
    return null
  }
  const uncertainty = display.projectionUncertainty
  if (
    uncertainty !== null
    && Number.isFinite(uncertainty.positionUnknownProbabilityUpperBound)
    && uncertainty.positionUnknownProbabilityUpperBound > DISPLAY_PROBABILITY_TOLERANCE
  ) {
    return { status: 'not-projectable', reason: 'position-unknown-overflow' }
  }
  const overflow = display.overflow
  if (potentialOverflow(overflow)) {
    if (overflow.kind === 'upper-bound' || mode === PROBABILITY_CHART_PROJECTION_MODES.UPPER_TAIL) {
      return { status: 'not-projectable', reason: 'upper-bound-overflow' }
    }
    if (overflow.lowerBound <= plan.displayWindow.max) {
      return { status: 'not-projectable', reason: 'exact-overflow-overlap' }
    }
  }
  return null
}

function makeBins(window, maxRenderedPoints) {
  const count = Math.min(window.pointCount, maxRenderedPoints)
  if (count === window.pointCount) {
    return Array.from({ length: count }, (_, index) => {
      const value = window.min + index
      return { min: value, max: value }
    })
  }
  const bins = []
  let start = window.min
  const baseSize = Math.floor(window.pointCount / count)
  const remainder = window.pointCount % count
  for (let index = 0; index < count; index += 1) {
    const size = baseSize + (index < remainder ? 1 : 0)
    const max = start + size - 1
    bins.push({ min: start, max })
    start = max + 1
  }
  return bins
}

function sumRange(display, min, max) {
  let total = 0
  const count = max - min + 1
  for (let index = 0; index < count; index += 1) {
    total += readProbability(display, min + index)
  }
  return total
}

function selectThresholds(window, maxRenderedPoints) {
  if (window.pointCount <= maxRenderedPoints) {
    return Array.from(
      { length: window.pointCount },
      (_, index) => window.min + index
    )
  }
  if (maxRenderedPoints === 1) {
    return [window.min]
  }
  const lastIndex = window.pointCount - 1
  const thresholds = []
  let previous = null
  for (let index = 0; index < maxRenderedPoints; index += 1) {
    const threshold = window.min + Math.floor(
      (index * lastIndex) / (maxRenderedPoints - 1)
    )
    if (threshold !== previous) {
      thresholds.push(threshold)
      previous = threshold
    }
  }
  return thresholds
}

function tailAt(display, threshold) {
  if (display.support.kind === 'finite' && threshold > display.support.max) {
    return 0
  }
  let tail
  if (display.offset === 0) {
    tail = 1 - (threshold <= 0 ? 0 : sumRange(display, 0, threshold - 1))
  } else {
    tail = display.explicitMax !== null && threshold <= display.explicitMax
      ? sumRange(display, Math.max(threshold, display.offset), display.explicitMax)
      : 0
  }
  const overflow = display.overflow
  if (
    overflow?.kind === 'exact'
    && potentialOverflow(overflow)
    && threshold <= overflow.lowerBound
  ) {
    tail += overflow.probability
  }
  if (tail < 0 && tail > -1e-12) {
    return 0
  }
  return Math.max(0, Math.min(1, tail))
}

function freezeBins(bins) {
  return Object.freeze(bins.map((bin) => Object.freeze(bin)))
}

function makeBaseProjection(mode, window, maxRenderedPoints, status = 'ready') {
  return {
    kind: 'probability-chart-projection',
    version: PROBABILITY_CHART_PROJECTION_VERSION,
    status,
    mode,
    displayWindow: window,
    logicalPointCount: window.pointCount,
    maxRenderedPoints,
  }
}

function makeNotReadyProjection(mode, window, maxRenderedPoints, status, reason) {
  return Object.freeze({
    ...makeBaseProjection(mode, window, maxRenderedPoints, status),
    reason,
    renderedPointCount: 0,
    aggregated: false,
  })
}

/**
 * Build a semantic PMF/upper-tail projection without allocating a dense
 * window-sized Float64Array or any Chart.js objects.
 */
export function createProbabilityChartProjection(
  display,
  plan,
  options = {}
) {
  const normalizedOptions = normalizeOptions(options)
  const normalizedDisplay = normalizeDisplay(display)
  const normalizedPlan = normalizePlan(plan)
  const { mode, maxRenderedPoints } = normalizedOptions
  const { displayWindow } = normalizedPlan
  const projectability = assertProjectable(
    normalizedDisplay,
    normalizedPlan.plan,
    mode
  )
  if (projectability !== null) {
    return makeNotReadyProjection(
      mode,
      displayWindow,
      maxRenderedPoints,
      projectability.status,
      projectability.reason
    )
  }

  if (normalizedPlan.plan.decision === 'known-zero') {
    if (mode === PROBABILITY_CHART_PROJECTION_MODES.PMF) {
      const bins = makeBins(displayWindow, maxRenderedPoints).map((bin) => ({
        ...bin,
        probability: 0,
      }))
      return Object.freeze({
        ...makeBaseProjection(mode, displayWindow, maxRenderedPoints),
        bins: freezeBins(bins),
        renderedPointCount: bins.length,
        aggregated: bins.length < displayWindow.pointCount,
      })
    }
    const thresholds = selectThresholds(displayWindow, maxRenderedPoints)
    return Object.freeze({
      ...makeBaseProjection(mode, displayWindow, maxRenderedPoints),
      samples: Object.freeze(thresholds.map((threshold) => Object.freeze({
        threshold,
        probability: 0,
      }))),
      renderedPointCount: thresholds.length,
      aggregated: thresholds.length < displayWindow.pointCount,
    })
  }

  if (mode === PROBABILITY_CHART_PROJECTION_MODES.PMF) {
    const bins = makeBins(displayWindow, maxRenderedPoints).map((bin) => ({
      ...bin,
      probability: sumRange(normalizedDisplay, bin.min, bin.max),
    }))
    return Object.freeze({
      ...makeBaseProjection(mode, displayWindow, maxRenderedPoints),
      bins: freezeBins(bins),
      renderedPointCount: bins.length,
      aggregated: bins.length < displayWindow.pointCount,
    })
  }

  const thresholds = selectThresholds(displayWindow, maxRenderedPoints)
  const samples = thresholds.map((threshold) => ({
    threshold,
    probability: tailAt(normalizedDisplay, threshold),
  }))
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index].probability > samples[index - 1].probability + 1e-12) {
      fail(
        PROBABILITY_CHART_PROJECTION_ERROR_CODES.NOT_PROJECTABLE,
        'upper-tail projection is not monotone',
        { index, previous: samples[index - 1], current: samples[index] }
      )
    }
  }
  return Object.freeze({
    ...makeBaseProjection(mode, displayWindow, maxRenderedPoints),
    samples: Object.freeze(samples.map((sample) => Object.freeze(sample))),
    renderedPointCount: samples.length,
    aggregated: samples.length < displayWindow.pointCount,
  })
}

export function materializeProbabilityChartProjection(
  projection,
  options = {}
) {
  if (!isRecord(projection) || projection.kind !== 'probability-chart-projection') {
    fail(
      PROBABILITY_CHART_PROJECTION_ERROR_CODES.INVALID_OPTIONS,
      'projection must be a probability chart projection',
      { path: 'projection' }
    )
  }
  if (projection.status !== 'ready') {
    return null
  }
  const label = options.label
  const backgroundColor = options.backgroundColor
  const borderColor = options.borderColor
  const dataset = {
    data: projection.mode === PROBABILITY_CHART_PROJECTION_MODES.PMF
      ? projection.bins.map((bin) => ({
          x: bin.min + (bin.max - bin.min) / 2,
          y: toChartPercentage(bin.probability),
          min: bin.min,
          max: bin.max,
        }))
      : projection.samples.map((sample) => ({
          x: sample.threshold,
          y: toChartPercentage(sample.probability),
          threshold: sample.threshold,
        })),
    parsing: { xAxisKey: 'x', yAxisKey: 'y' },
    ...(label === undefined ? {} : { label }),
    ...(backgroundColor === undefined ? {} : { backgroundColor }),
    ...(borderColor === undefined ? {} : { borderColor }),
  }
  return Object.freeze({
    chartType: projection.mode === PROBABILITY_CHART_PROJECTION_MODES.PMF
      ? 'bar'
      : 'line',
    projection,
    datasets: Object.freeze([Object.freeze(dataset)]),
  })
}

export function isProbabilityChartProjection(value) {
  return value?.kind === 'probability-chart-projection'
    && value.version === PROBABILITY_CHART_PROJECTION_VERSION
}

export function isProbabilityChartProjectionError(error) {
  return error?.probabilityChartProjection === true
    && typeof error.code === 'string'
}
