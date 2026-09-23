import { describe, expect, it } from 'vitest'

import {
  CHART_SERIES_ERROR_CODES,
  ChartSeriesError,
  materializeChartJsData,
} from '../src/shared/presentation/ChartSeriesAdapter'
import {
  DISTRIBUTION_DISPLAY_VERSION,
} from '../src/shared/presentation/DistributionPresenter'
import {
  DISTRIBUTION_PROJECTION_DECISIONS,
  DISTRIBUTION_PROJECTION_MODES,
  projectDistribution,
} from '../src/shared/presentation/DistributionProjection'

function makeDisplay({
  values = [1],
  offset = 0,
  support = { kind: 'finite', max: offset + values.length - 1 },
  overflow = null,
} = {}) {
  const probabilities = values
  return {
    version: DISTRIBUTION_DISPLAY_VERSION,
    kind: 'distribution-display',
    explicit: { offset, probabilities },
    explicitMax: probabilities.length === 0
      ? null
      : offset + probabilities.length - 1,
    support,
    overflow,
  }
}

function project(display, displayWindow, options = {}) {
  return projectDistribution(display, {
    displayWindow,
    ...options,
  })
}

describe('materializeChartJsData', () => {
  it('materializes a ready PMF projection without allocating presentation objects', () => {
    const display = makeDisplay({
      values: [0.2, 0.3, 0.5],
      offset: 5,
      support: { kind: 'finite', max: 7 },
    })
    const projection = project(display, { min: 5, max: 7 })

    expect(projection).toMatchObject({
      kind: 'distribution-projection',
      status: 'ready',
      decision: DISTRIBUTION_PROJECTION_DECISIONS.REUSE,
      mode: DISTRIBUTION_PROJECTION_MODES.PMF,
      displayWindow: { min: 5, max: 7, pointCount: 3 },
    })

    const chartData = materializeChartJsData(projection, {
      label: 'fixture',
    })
    expect(chartData.labels).toEqual([5, 6, 7])
    expect(chartData.datasets).toHaveLength(1)
    expect(chartData.datasets[0]).toMatchObject({
      label: 'fixture',
      parsing: true,
    })
    expect(chartData.datasets[0].data).toBe(projection.values)
    expect(Array.from(chartData.datasets[0].data)).toEqual([0.2, 0.3, 0.5])
    expect(Object.isFrozen(chartData)).toBe(true)
    expect(Object.isFrozen(chartData.datasets[0])).toBe(true)
  })

  it('supports upper-tail mode and Chart.js styling options', () => {
    const projection = project(
      makeDisplay({
        values: [0.25, 0.75],
        support: { kind: 'finite', max: 1 },
      }),
      { min: 0, max: 1 },
      { mode: DISTRIBUTION_PROJECTION_MODES.UPPER_TAIL }
    )

    expect(projection.mode).toBe(DISTRIBUTION_PROJECTION_MODES.UPPER_TAIL)
    expect(Array.from(projection.values)).toEqual([1, 0.75])

    const chartData = materializeChartJsData(projection, {
      includeLabels: false,
      backgroundColor: '#123456',
      borderColor: '#abcdef',
    })
    expect(chartData).not.toHaveProperty('labels')
    expect(chartData.datasets[0]).toMatchObject({
      backgroundColor: '#123456',
      borderColor: '#abcdef',
    })
  })

  it('rejects projections that are not ready without accepting partial values', () => {
    const projection = project(
      makeDisplay({
        values: [0.5, 0.5],
        offset: 5,
        support: { kind: 'finite', max: 8 },
      }),
      { min: 4, max: 6 }
    )

    expect(projection).toMatchObject({
      status: 'not-ready',
      decision: DISTRIBUTION_PROJECTION_DECISIONS.RECALCULATE,
    })
    expect(projection).not.toHaveProperty('values')
    expect(() => materializeChartJsData(projection)).toThrow(
      expect.objectContaining({
        code: CHART_SERIES_ERROR_CODES.INVALID_SERIES,
      })
    )
  })

  it('checks only readiness here and validates materializer options', () => {
    const valid = project(makeDisplay(), { min: 0, max: 0 })
    expect(() => materializeChartJsData({ status: 'not-ready' })).toThrow(
      expect.objectContaining({
        code: CHART_SERIES_ERROR_CODES.INVALID_SERIES,
      })
    )
    expect(() => materializeChartJsData(null)).toThrow(
      expect.objectContaining({
        code: CHART_SERIES_ERROR_CODES.INVALID_SERIES,
      })
    )
    expect(() => materializeChartJsData(valid, { includeLabels: 'yes' }))
      .toThrow(ChartSeriesError)
  })

  it('materializes large windows only after projection allocates an owned buffer', () => {
    const values = new Float64Array(4_096)
    values[4_095] = 1
    const projection = project(
      makeDisplay({
        values,
        support: { kind: 'finite', max: 4_095 },
      }),
      { min: 0, max: 4_095 }
    )

    expect(projection.values).toBeInstanceOf(Float64Array)
    expect(projection.values).toHaveLength(4_096)
    expect(projection.values).not.toBe(values)
    const chartData = materializeChartJsData(projection)
    expect(chartData.labels).toHaveLength(4_096)
    expect(chartData.labels[0]).toBe(0)
    expect(chartData.labels.at(-1)).toBe(4_095)
    expect(chartData.datasets[0].data).toBe(projection.values)
  })
})
