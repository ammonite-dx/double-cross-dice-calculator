import { describe, expect, it } from 'vitest'

import { createDistributionResult } from '../src/calculation/DistributionResult'
import {
  createProbabilityChartProjection,
  materializeProbabilityChartProjection,
} from '../src/shared/presentation/ProbabilityChartProjection'
import {
  planDisplayRange,
  presentDistribution,
} from '../src/shared/presentation'
import {
  getProbabilityRenderBudget,
} from '../src/shared/chart/ProbabilityRenderBudget'

function createDisplay({ values, offset = 0, support } = {}) {
  const result = createDistributionResult({
    values,
    offset,
    support: support ?? {
      kind: 'finite',
      max: offset + values.length - 1,
    },
    overflow: null,
  })
  return presentDistribution(
    { result, metadata: { modeledDistribution: true } },
    {
      summary: {
        mass: { kind: 'exact', value: 1 },
        expectedValue: { kind: 'exact', value: 0 },
      },
    }
  )
}

function createPlan(display, min, max, policy) {
  return planDisplayRange(display, {
    displayWindow: { min, max },
    ...(policy === undefined ? {} : { policy }),
  })
}

function createExactOverflowDisplay() {
  const result = createDistributionResult({
    values: [0.4, 0.2],
    offset: 0,
    support: { kind: 'infinite' },
    overflow: {
      kind: 'exact',
      lowerBound: 10,
      probability: 0.4,
      errorBound: 0,
    },
  })
  return presentDistribution(
    { result, metadata: { modeledDistribution: true } },
    {
      summary: {
        mass: { kind: 'exact', value: 1 },
        expectedValue: { kind: 'lower-bound', value: 0 },
      },
    }
  )
}

describe('ProbabilityChartProjection', () => {
  it('aggregates PMF bins without dropping probability mass', () => {
    const display = createDisplay({
      values: [0.1, 0.2, 0.3, 0.4],
      support: { kind: 'finite', max: 3 },
    })
    const plan = createPlan(display, 0, 3)
    const projection = createProbabilityChartProjection(display, plan, {
      mode: 'pmf',
      maxRenderedPoints: 2,
    })

    expect(projection).toMatchObject({
      kind: 'probability-chart-projection',
      status: 'ready',
      mode: 'pmf',
      logicalPointCount: 4,
      renderedPointCount: 2,
      aggregated: true,
    })
    expect(projection.bins.map(({ min, max }) => ({ min, max }))).toEqual([
      { min: 0, max: 1 },
      { min: 2, max: 3 },
    ])
    expect(projection.bins.map(({ probability }) => probability))
      .toEqual([expect.closeTo(0.3, 15), expect.closeTo(0.7, 15)])
    expect(projection.bins.reduce((sum, bin) => sum + bin.probability, 0))
      .toBeCloseTo(1, 15)
  })

  it('keeps narrow PMF coordinates one-to-one and materializes a bar chart', () => {
    const display = createDisplay({
      values: [0.25, 0.75],
      offset: 5,
      support: { kind: 'finite', max: 6 },
    })
    const plan = createPlan(display, 5, 6)
    const projection = createProbabilityChartProjection(display, plan, {
      mode: 'pmf',
      maxRenderedPoints: 2,
    })
    const chart = materializeProbabilityChartProjection(projection, {
      label: 'fixture',
    })

    expect(projection.bins).toEqual([
      { min: 5, max: 5, probability: 0.25 },
      { min: 6, max: 6, probability: 0.75 },
    ])
    expect(chart.chartType).toBe('bar')
    expect(chart.datasets[0].data).toEqual([
      { x: 5, y: 25, min: 5, max: 5 },
      { x: 6, y: 75, min: 6, max: 6 },
    ])
  })

  it('selects exact upper-tail thresholds including both endpoints', () => {
    const display = createDisplay({
      values: [0.1, 0.2, 0.3, 0.4],
      support: { kind: 'finite', max: 3 },
    })
    const plan = createPlan(display, 0, 3)
    const projection = createProbabilityChartProjection(display, plan, {
      mode: 'upper-tail',
      maxRenderedPoints: 3,
    })

    expect(projection.samples.map(({ threshold }) => threshold))
      .toEqual([0, 1, 3])
    expect(projection.samples.map(({ probability }) => probability))
      .toEqual([expect.closeTo(1, 15), expect.closeTo(0.9, 15), expect.closeTo(0.4, 15)])
    expect(projection.samples[0].threshold).toBe(0)
    expect(projection.samples.at(-1).threshold).toBe(3)
    expect(projection.samples[1].probability)
      .toBeLessThanOrEqual(projection.samples[0].probability)
    expect(projection.samples[2].probability)
      .toBeLessThanOrEqual(projection.samples[1].probability)
    expect(materializeProbabilityChartProjection(projection).chartType)
      .toBe('line')
  })

  it('includes exact overflow in upper-tail values when its lower bound is outside the window', () => {
    const display = createExactOverflowDisplay()
    const basePlan = createPlan(display, 0, 3)
    const plan = {
      ...basePlan,
      decision: 'reuse',
      coverage: {
        ...basePlan.coverage,
        missingSegments: [],
      },
    }
    const projection = createProbabilityChartProjection(display, plan, {
      mode: 'upper-tail',
      maxRenderedPoints: 4,
    })

    expect(projection.status).toBe('ready')
    expect(projection.samples.map(({ probability }) => probability))
      .toEqual([
        expect.closeTo(1, 15),
        expect.closeTo(0.6, 15),
        expect.closeTo(0.4, 15),
        expect.closeTo(0.4, 15),
      ])
  })

  it('projects finite-support known-zero windows without scanning them', () => {
    const display = createDisplay({
      values: [1],
      support: { kind: 'finite', max: 0 },
    })
    const plan = createPlan(display, 10, 10)
    const projection = createProbabilityChartProjection(display, plan, {
      mode: 'pmf',
      maxRenderedPoints: 1,
    })

    expect(plan.decision).toBe('known-zero')
    expect(projection.bins).toEqual([
      { min: 10, max: 10, probability: 0 },
    ])
  })

  it('returns a typed not-ready projection for rejected plans', () => {
    const display = createDisplay({ values: [1] })
    const plan = createPlan(display, 0, 2, {
      warning: { pointCount: 1 },
      hard: { pointCount: 2 },
    })
    const projection = createProbabilityChartProjection(display, plan, {
      mode: 'pmf',
      maxRenderedPoints: 2,
    })

    expect(projection).toMatchObject({
      status: 'not-ready',
      reason: 'resource-rejected',
      renderedPointCount: 0,
    })
    expect(materializeProbabilityChartProjection(projection)).toBeNull()
  })
})

describe('getProbabilityRenderBudget', () => {
  it('derives and clamps budgets from presentation width', () => {
    expect(getProbabilityRenderBudget(390)).toBe(195)
    expect(getProbabilityRenderBudget(2_000)).toBe(1_000)
    expect(getProbabilityRenderBudget(10)).toBe(128)
    expect(getProbabilityRenderBudget(undefined)).toBe(1_024)
  })

  it('allows route-specific safe budget limits', () => {
    expect(getProbabilityRenderBudget(2_000, {
      minRenderedPoints: 16,
      maxRenderedPoints: 256,
      minHorizontalSpacing: 4,
    })).toBe(256)
  })
})
