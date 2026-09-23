import { describe, expect, it } from 'vitest'

import {
  projectDistribution,
  DISTRIBUTION_PROJECTION_DECISIONS,
  DISTRIBUTION_PROJECTION_MODES,
  DISTRIBUTION_PROJECTION_REASONS,
} from '../src/shared/presentation'
import { DISTRIBUTION_DISPLAY_VERSION } from
  '../src/shared/presentation/DistributionPresenter'

function makeDisplay({
  values = [1],
  offset = 0,
  support = { kind: 'finite', max: offset + values.length - 1 },
  overflow = null,
  projectionUncertainty,
} = {}) {
  return {
    version: DISTRIBUTION_DISPLAY_VERSION,
    kind: 'distribution-display',
    explicit: { offset, probabilities: values },
    explicitMax: values.length === 0
      ? null
      : offset + values.length - 1,
    support,
    overflow,
    ...(projectionUncertainty === undefined
      ? {}
      : { projectionUncertainty }),
  }
}

function project(display, displayWindow, options = {}) {
  return projectDistribution(display, {
    displayWindow,
    ...options,
  })
}

describe('projectDistribution', () => {
  it('matches the legacy adapter for PMF, upper-tail, and offset windows', () => {
    const display = makeDisplay({
      values: [0.2, 0.3, 0.5],
      offset: 5,
      support: { kind: 'finite', max: 7 },
    })
    const canonical = project(display, { min: 5, max: 7 })

    expect(canonical).toMatchObject({
      status: 'ready',
      decision: DISTRIBUTION_PROJECTION_DECISIONS.REUSE,
      mode: DISTRIBUTION_PROJECTION_MODES.PMF,
    })
    expect(canonical.displayWindow).toBe(canonical.plan.displayWindow)
    expect(Array.from(canonical.values)).toEqual([0.2, 0.3, 0.5])

    const upperTailDisplay = makeDisplay({
      values: [0.25, 0.75],
      support: { kind: 'finite', max: 1 },
    })
    const upperTailCanonical = project(
      upperTailDisplay,
      { min: 0, max: 1 },
      { mode: DISTRIBUTION_PROJECTION_MODES.UPPER_TAIL }
    )
    expect(Array.from(upperTailCanonical.values)).toEqual([1, 0.75])
  })

  it('returns known-zero for a window outside finite support', () => {
    const result = project(
      makeDisplay({
        values: [1],
        support: { kind: 'finite', max: 2 },
      }),
      { min: 3, max: 5 }
    )

    expect(result).toMatchObject({
      status: 'ready',
      decision: DISTRIBUTION_PROJECTION_DECISIONS.KNOWN_ZERO,
      reason: DISTRIBUTION_PROJECTION_REASONS.FINITE_SUPPORT_OUTSIDE,
    })
    expect(Array.from(result.values)).toEqual([0, 0, 0])
  })

  it('recalculates for exact overflow overlap and reuses exact overflow outside', () => {
    const display = makeDisplay({
      values: [0.25, 0.25],
      support: { kind: 'finite', max: 5 },
      overflow: {
        kind: 'exact',
        lowerBound: 5,
        probability: 0.5,
        errorBound: 0.01,
      },
    })
    expect(project(display, { min: 0, max: 1 })).toMatchObject({
      status: 'ready',
      decision: DISTRIBUTION_PROJECTION_DECISIONS.REUSE,
    })

    const overlap = project(
      { ...display, overflow: { ...display.overflow, lowerBound: 1 } },
      { min: 0, max: 1 }
    )
    expect(overlap).toMatchObject({
      status: 'not-projectable',
      decision: DISTRIBUTION_PROJECTION_DECISIONS.RECALCULATE,
      reason: DISTRIBUTION_PROJECTION_REASONS.EXACT_OVERFLOW_OVERLAP,
    })
    expect(overlap).not.toHaveProperty('values')
  })

  it('makes upper-bound overlap terminal, including when coverage is missing', () => {
    const display = makeDisplay({
      values: [0.4],
      support: { kind: 'finite', max: 4 },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 1,
        probabilityUpperBound: 0.6,
        errorBound: 0,
      },
    })
    const result = project(display, { min: 0, max: 3 })

    expect(result.plan.decision).toBe('recalculate')
    expect(result).toMatchObject({
      status: 'not-ready',
      decision: DISTRIBUTION_PROJECTION_DECISIONS.NOT_PROJECTABLE,
      reason: DISTRIBUTION_PROJECTION_REASONS.UPPER_BOUND_OVERFLOW,
    })
    expect(result).not.toHaveProperty('values')
  })

  it('keeps upper-bound tails outside a PMF window reusable but rejects upper-tail mode', () => {
    const display = makeDisplay({
      values: [0.5, 0.5],
      support: { kind: 'infinite' },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 20,
        probabilityUpperBound: 0.1,
        errorBound: 0,
      },
    })
    expect(project(display, { min: 0, max: 1 })).toMatchObject({
      status: 'ready',
      decision: DISTRIBUTION_PROJECTION_DECISIONS.REUSE,
    })
    expect(project(display, { min: 0, max: 1 }, {
      mode: DISTRIBUTION_PROJECTION_MODES.UPPER_TAIL,
    })).toMatchObject({
      status: 'not-projectable',
      decision: DISTRIBUTION_PROJECTION_DECISIONS.NOT_PROJECTABLE,
      reason: DISTRIBUTION_PROJECTION_REASONS.UPPER_BOUND_OVERFLOW,
    })
  })

  it('uses the projection uncertainty tolerance and output overflow lower bound', () => {
    const base = {
      values: [0.9, 0.1],
      support: { kind: 'infinite' },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 0,
        probabilityUpperBound: 1e-8,
        errorBound: 0,
      },
    }
    expect(project(makeDisplay({
      ...base,
      projectionUncertainty: {
        positionUnknownProbabilityUpperBound: 5e-4,
        outputOverflowLowerBound: null,
      },
    }), { min: 0, max: 1 })).toMatchObject({ status: 'ready' })

    expect(project(makeDisplay({
      ...base,
      projectionUncertainty: {
        positionUnknownProbabilityUpperBound: 1e-3,
        outputOverflowLowerBound: null,
      },
    }), { min: 0, max: 1 })).toMatchObject({
      status: 'not-projectable',
      reason: DISTRIBUTION_PROJECTION_REASONS.UPPER_BOUND_OVERFLOW,
    })

    expect(project(makeDisplay({
      ...base,
      projectionUncertainty: {
        positionUnknownProbabilityUpperBound: 1e-8,
        outputOverflowLowerBound: 1,
      },
    }), { min: 0, max: 1 })).toMatchObject({
      status: 'not-projectable',
      reason: DISTRIBUTION_PROJECTION_REASONS.UPPER_BOUND_OVERFLOW,
    })
    expect(project(makeDisplay({
      ...base,
      projectionUncertainty: {
        positionUnknownProbabilityUpperBound: 1e-8,
        outputOverflowLowerBound: 2,
      },
    }), { min: 0, max: 1 })).toMatchObject({ status: 'ready' })
  })

  it('rejects resources before allocating values and supports windows above 1023', () => {
    const display = makeDisplay({
      values: [1],
      support: { kind: 'finite', max: 0 },
    })
    const rejected = project(display, { min: 0, max: 2 }, {
      policy: {
        pointCount: 2,
        float64Bytes: 16,
        chartPoints: 2,
      },
    })
    expect(rejected).toMatchObject({
      status: 'not-ready',
      decision: DISTRIBUTION_PROJECTION_DECISIONS.RESOURCE_REJECTED,
      reason: DISTRIBUTION_PROJECTION_REASONS.RESOURCE_REJECTED,
    })
    expect(rejected).not.toHaveProperty('values')

    const values = new Array(1201).fill(0)
    values[1200] = 1
    const large = project(
      makeDisplay({ values, support: { kind: 'finite', max: 1200 } }),
      { min: 0, max: 1200 }
    )
    expect(large.status).toBe('ready')
    expect(large.values).toHaveLength(1201)
    expect(large.values[1200]).toBe(1)
  })

  it('does not allocate a partial series when explicit coverage is missing', () => {
    const result = project(
      makeDisplay({
        values: [0.5, 0.5],
        offset: 5,
        support: { kind: 'finite', max: 8 },
      }),
      { min: 4, max: 6 }
    )
    expect(result).toMatchObject({
      status: 'not-ready',
      decision: DISTRIBUTION_PROJECTION_DECISIONS.RECALCULATE,
      reason: DISTRIBUTION_PROJECTION_REASONS.RECALCULATE,
    })
    expect(result.displayWindow).toBe(result.plan.displayWindow)
    expect(result.plan.coverage.missingSegments)
      .toEqual([{ min: 4, max: 4, pointCount: 1 }])
    expect(result).not.toHaveProperty('values')
  })
})
