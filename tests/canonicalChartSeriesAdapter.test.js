import { describe, expect, it } from 'vitest'

import { getUpperTailProbability } from '../src/data/Distribution'
import {
  CANONICAL_DISTRIBUTION_DISPLAY_VERSION,
} from '../src/presentation/DistributionPresenter'
import {
  CANONICAL_CHART_SERIES_MODES,
  CANONICAL_CHART_SERIES_NOT_PROJECTABLE_REASONS,
  CANONICAL_CHART_SERIES_NOT_READY_REASONS,
  createCanonicalChartSeries,
  materializeCanonicalChartJsData,
} from '../src/presentation/CanonicalChartSeriesAdapter'
import { planDisplayRange } from '../src/presentation/DisplayRangePlanner'
import * as presentation from '../src/presentation/index'

function makeDisplay({
  values = [1],
  offset = 0,
  support = { kind: 'finite', max: offset + values.length - 1 },
  overflow = null,
} = {}) {
  const probabilities = values instanceof Float64Array
    ? values
    : values
  const explicitMax = probabilities.length === 0
    ? null
    : offset + probabilities.length - 1
  return {
    version: CANONICAL_DISTRIBUTION_DISPLAY_VERSION,
    kind: 'canonical-distribution-display',
    explicit: { offset, probabilities },
    explicitMax,
    support,
    overflow,
  }
}

function makePlan(display, displayWindow, policy) {
  return planDisplayRange(display, {
    displayWindow,
    ...(policy === undefined ? {} : { policy }),
  })
}

describe('CanonicalChartSeriesAdapter', () => {
  it('projects offset PMF values without treating the lower side as zero', () => {
    const display = makeDisplay({
      values: [0.2, 0.3, 0.5],
      offset: 5,
      support: { kind: 'finite', max: 7 },
    })
    const plan = makePlan(display, { min: 5, max: 7 })
    const series = createCanonicalChartSeries(display, plan, {
      mode: CANONICAL_CHART_SERIES_MODES.PMF,
    })

    expect(series).toMatchObject({
      kind: 'canonical-chart-series',
      status: 'ready',
      mode: 'pmf',
      displayWindow: { min: 5, max: 7, pointCount: 3 },
    })
    expect(Object.keys(series).sort()).toEqual([
      'displayWindow',
      'kind',
      'mode',
      'status',
      'values',
      'version',
    ].sort())
    expect(series.values).toBeInstanceOf(Float64Array)
    expect(Array.from(series.values)).toEqual([0.2, 0.3, 0.5])
    expect(series).not.toHaveProperty('labels')
    expect(series).not.toHaveProperty('points')
  })

  it('does not assume explicit.offset values below the window are zero', () => {
    const display = makeDisplay({
      values: [0.5, 0.5],
      offset: 5,
      support: { kind: 'finite', max: 8 },
    })
    const plan = makePlan(display, { min: 4, max: 5 })
    const series = createCanonicalChartSeries(display, plan)

    expect(plan.decision).toBe('recalculate')
    expect(series).toMatchObject({
      kind: 'not-ready',
      status: 'not-ready',
      reason: CANONICAL_CHART_SERIES_NOT_READY_REASONS.RECALCULATE,
    })
    expect(Object.keys(series).sort()).toEqual([
      'decision',
      'displayWindow',
      'kind',
      'mode',
      'plannerStatus',
      'reason',
      'rejectionReasons',
      'status',
      'version',
    ].sort())
    expect(series).not.toHaveProperty('values')
  })

  it('fills finite-support known-zero coordinates without allocating point objects', () => {
    const display = makeDisplay({
      values: [0.5, 0.5],
      support: { kind: 'finite', max: 1 },
    })
    const plan = makePlan(display, { min: 0, max: 4 })
    const series = createCanonicalChartSeries(display, plan)

    expect(plan.decision).toBe('reuse')
    expect(Array.from(series.values)).toEqual([0.5, 0.5, 0, 0, 0])
    expect(series).not.toHaveProperty('labels')
    expect(series).not.toHaveProperty('data')
  })

  it('projects a window entirely above finite support as all-zero PMF and tail', () => {
    const display = makeDisplay({
      values: [1],
      support: { kind: 'finite', max: 4 },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 4,
        probabilityUpperBound: 0,
        errorBound: 0,
      },
    })
    const plan = makePlan(display, { min: 5, max: 7 })

    expect(plan.decision).toBe('known-zero')
    expect(Array.from(createCanonicalChartSeries(display, plan).values))
      .toEqual([0, 0, 0])
    expect(Array.from(createCanonicalChartSeries(display, plan, {
      mode: 'upper-tail',
    }).values)).toEqual([0, 0, 0])
  })

  it('matches getUpperTailProbability for the existing 1024 fixture', () => {
    const values = new Float64Array(1024)
    values[0] = 0.1
    values[1] = 0.2
    values[1022] = 0.3
    values[1023] = 0.4
    const display = makeDisplay({
      values,
      support: { kind: 'finite', max: 1023 },
    })
    const plan = makePlan(display, { min: 0, max: 1023 })
    const expected = getUpperTailProbability(Array.from(values))
    const series = createCanonicalChartSeries(display, plan, {
      mode: 'upper-tail',
    })

    expect(Array.from(series.values)).toEqual(expected)
  })

  it('includes safe exact overflow mass in the upper-tail suffix', () => {
    const display = makeDisplay({
      values: [0.2, 0.3],
      support: { kind: 'finite', max: 5 },
      overflow: {
        kind: 'exact',
        lowerBound: 2,
        probability: 0.5,
        errorBound: 0,
      },
    })
    const plan = makePlan(display, { min: 0, max: 1 })
    const pmf = createCanonicalChartSeries(display, plan)
    const tail = createCanonicalChartSeries(display, plan, {
      mode: 'upper-tail',
    })

    expect(Array.from(pmf.values)).toEqual([0.2, 0.3])
    expect(Array.from(tail.values)).toEqual([1, 0.8])
    expect(tail.values[1]).toBeCloseTo(0.3 + 0.5, 15)
  })

  it('rejects exact overflow whose unknown mass can overlap the window', () => {
    const display = makeDisplay({
      values: [0.4, 0.2],
      support: { kind: 'finite', max: 3 },
      overflow: {
        kind: 'exact',
        lowerBound: 1,
        probability: 0.4,
        errorBound: 0,
      },
    })
    const plan = makePlan(display, { min: 0, max: 1 })
    const result = createCanonicalChartSeries(display, plan)

    expect(result).toMatchObject({
      kind: 'not-projectable',
      status: 'not-projectable',
      reason: CANONICAL_CHART_SERIES_NOT_PROJECTABLE_REASONS.EXACT_OVERFLOW_OVERLAP,
    })
    expect(Object.keys(result).sort()).toEqual([
      'displayWindow',
      'kind',
      'mode',
      'overflow',
      'reason',
      'status',
      'version',
    ].sort())
    expect(result).not.toHaveProperty('values')
  })

  it('rejects upper-bound overflow for upper-tail and does not turn it into a value', () => {
    const display = makeDisplay({
      values: [0.4, 0.4],
      support: { kind: 'finite', max: 3 },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 2,
        probabilityUpperBound: 0.2,
        errorBound: 0,
      },
    })
    const plan = makePlan(display, { min: 0, max: 1 })
    const pmf = createCanonicalChartSeries(display, plan)
    const tail = createCanonicalChartSeries(display, plan, {
      mode: 'upper-tail',
    })

    expect(Array.from(pmf.values)).toEqual([0.4, 0.4])
    expect(tail).toMatchObject({
      kind: 'not-projectable',
      reason: CANONICAL_CHART_SERIES_NOT_PROJECTABLE_REASONS.UPPER_BOUND_OVERFLOW,
    })
  })

  it('rejects upper-bound overlap for PMF instead of placing bound mass at lowerBound', () => {
    const display = makeDisplay({
      values: [0.4, 0.4],
      support: { kind: 'finite', max: 3 },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 1,
        probabilityUpperBound: 0.2,
        errorBound: 0,
      },
    })
    const plan = makePlan(display, { min: 0, max: 1 })
    const result = createCanonicalChartSeries(display, plan)

    expect(result).toMatchObject({
      kind: 'not-projectable',
      reason: CANONICAL_CHART_SERIES_NOT_PROJECTABLE_REASONS.UPPER_BOUND_OVERFLOW,
    })
  })

  it('returns typed not-ready for resource rejection without generating values', () => {
    const display = makeDisplay({
      values: [1],
      support: { kind: 'finite', max: 0 },
    })
    const plan = makePlan(display, { min: 0, max: 2 }, {
      warning: { pointCount: 1 },
      hard: { pointCount: 2 },
    })
    const result = createCanonicalChartSeries(display, plan)

    expect(result).toMatchObject({
      kind: 'not-ready',
      status: 'not-ready',
      reason: CANONICAL_CHART_SERIES_NOT_READY_REASONS.RESOURCE_REJECTED,
      plannerStatus: 'resource-rejected',
    })
    expect(Object.keys(result).sort()).toEqual([
      'decision',
      'displayWindow',
      'kind',
      'mode',
      'plannerStatus',
      'reason',
      'rejectionReasons',
      'status',
      'version',
    ].sort())
    expect(result).not.toHaveProperty('values')
  })

  it('does not round values and does not alias the display probabilities', () => {
    const probabilities = [0.123456789, 0.876543211]
    const display = makeDisplay({
      values: probabilities,
      support: { kind: 'finite', max: 1 },
    })
    const plan = makePlan(display, { min: 0, max: 1 })
    const series = createCanonicalChartSeries(display, plan)

    expect(series.values[0]).toBe(probabilities[0])
    expect(series.values).not.toBe(display.explicit.probabilities)
    series.values[0] = 0
    expect(display.explicit.probabilities[0]).toBe(probabilities[0])
    expect(Object.isFrozen(series)).toBe(true)
    expect(Object.isFrozen(series.values)).toBe(false)
  })

  it('exports only the canonical chart series entry points', () => {
    expect(presentation.createCanonicalChartSeries).toBe(createCanonicalChartSeries)
    expect(presentation.materializeCanonicalChartJsData)
      .toBe(materializeCanonicalChartJsData)
    expect(presentation).not.toHaveProperty(
      'projectCanonicalDistributionToChartSeries'
    )
    expect(presentation).not.toHaveProperty(
      'adaptCanonicalDistributionToChartSeries'
    )
    expect(presentation).not.toHaveProperty('materializeCanonicalChartData')
  })

  it('uses an owned dense typed series for a large window and materializes labels only at the Chart.js boundary', () => {
    const values = new Float64Array(4_096)
    values[0] = 1
    const display = makeDisplay({
      values,
      support: { kind: 'finite', max: 4_095 },
    })
    const plan = makePlan(display, { min: 0, max: 4_095 })
    const series = createCanonicalChartSeries(display, plan)

    expect(series.values).toBeInstanceOf(Float64Array)
    expect(series.values).toHaveLength(4_096)
    expect(series).not.toHaveProperty('labels')
    expect(series).not.toHaveProperty('points')
    expect(series).not.toHaveProperty('datasets')

    const chartData = materializeCanonicalChartJsData(series, {
      label: 'fixture',
    })
    expect(chartData.labels).toHaveLength(4_096)
    expect(chartData.labels[0]).toBe(0)
    expect(chartData.labels[4_095]).toBe(4_095)
    expect(chartData.datasets[0].data).toBe(series.values)
    expect(chartData.datasets[0].parsing).toBe(true)
    expect(chartData.datasets[0].label).toBe('fixture')
  })
})
