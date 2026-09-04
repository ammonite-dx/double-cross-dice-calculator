import { describe, expect, it } from 'vitest'

import {
  ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS,
  ATTACK_CANONICAL_PRESENTATION_ERROR_CODES,
  createAttackCanonicalDisplayPresentation,
} from '../src/features/attack/model/AttackCanonicalPresentation'
import {
  ATTACK_DISPLAY_MODES,
} from '../src/features/attack/model/AttackDisplayRequestSnapshot'
import {
  createDistributionResult,
  getCanonicalTotalDamageSummary,
} from '../src/calculation/DistributionResult'
import { getCanonicalDamageSummary } from '../src/calculation/DamageCalculator'
import { sumCanonicalDamage } from '../src/calculation/CanonicalDamageAggregation'
import {
  CANONICAL_CHART_SERIES_NOT_PROJECTABLE_REASONS,
  CANONICAL_CHART_SERIES_NOT_READY_REASONS,
} from '../src/shared/presentation'

function createEnvelope({
  values = [1],
  offset = 0,
  support = { kind: 'finite', max: offset + values.length - 1 },
  overflow = null,
} = {}) {
  return {
    result: createDistributionResult({ values, offset, support, overflow }),
    metadata: {
      modeledDistribution: true,
      sourceSupport: { kind: 'infinite' },
    },
  }
}

function createScore(seed) {
  return {
    action: {
      distribution: [seed, 1 - seed],
      upperTailProbability: [1 - seed, 0],
    },
    reaction: {
      distribution: [1 - seed, seed],
      upperTailProbability: [seed, 0],
    },
  }
}

function createBatch(damages) {
  const combos = damages.map((canonicalDamage, index) => ({
    id: `combo-${index + 1}`,
    score: createScore((index + 1) / (damages.length + 1)),
    scoreSummary: {
      action: { expectedValue: index + 1 },
      reaction: { expectedValue: index + 2 },
    },
    canonicalDamage,
    canonicalDamageSummary: getCanonicalDamageSummary(canonicalDamage),
  }))
  const canonicalTotalDamage = sumCanonicalDamage(damages)
  return {
    combos,
    canonicalTotalDamage,
    canonicalTotalDamageSummary:
      getCanonicalTotalDamageSummary(canonicalTotalDamage),
  }
}

function createPlan() {
  return { operation: 'attack', warnings: [] }
}

function present(damages, displayRequest, policy) {
  return createAttackCanonicalDisplayPresentation(createBatch(damages), {
    displayRequest,
    rangePlans: damages.map(() => createPlan()),
    ...(policy === undefined ? {} : { policy }),
  })
}

describe('createAttackCanonicalDisplayPresentation', () => {
  it('connects combo and total damage through planner, series, and materializer', () => {
    const presentation = present([
      createEnvelope({ values: [0.25, 0.75], support: { kind: 'finite', max: 1 } }),
    ], {
      min: 0,
      max: 1,
      mode: ATTACK_DISPLAY_MODES.PMF,
    })

    expect(presentation).toMatchObject({
      kind: 'attack-canonical-display-presentation',
      status: 'ready',
      decision: ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.REUSE,
      mode: ATTACK_DISPLAY_MODES.PMF,
      displayRequest: { min: 0, max: 1, mode: 'pmf' },
    })
    expect(presentation.combos).toHaveLength(1)
    expect(presentation.combos[0]).toMatchObject({
      id: 'combo-1',
      status: 'ready',
      decision: 'reuse',
      plan: { decision: 'reuse' },
      series: {
        kind: 'canonical-chart-series',
        status: 'ready',
        displayWindow: { min: 0, max: 1, pointCount: 2 },
      },
    })
    expect(Array.from(presentation.combos[0].series.values))
      .toEqual([0.25, 0.75])
    expect(presentation.combos[0].chart.labels).toEqual([0, 1])
    expect(presentation.combos[0].chart.datasets[0].data)
      .toBe(presentation.combos[0].series.values)
    expect(presentation.total.status).toBe('ready')
    expect(Array.from(presentation.total.series.values))
      .toEqual([0.25, 0.75])
  })

  it('supports a display window above 999 without truncating explicit coverage', () => {
    const values = new Array(1201).fill(0)
    values[1200] = 1
    const presentation = present([createEnvelope({
      values,
      support: { kind: 'finite', max: 1200 },
    })], {
      min: 0,
      max: 1200,
      mode: ATTACK_DISPLAY_MODES.PMF,
    })

    expect(presentation.status).toBe('ready')
    expect(presentation.displayRequest.max).toBe(1200)
    expect(presentation.combos[0].plan).toMatchObject({
      decision: 'reuse',
      coverage: { explicit: { max: 1200 } },
    })
    expect(presentation.combos[0].series.values).toHaveLength(1201)
    expect(presentation.combos[0].series.values[1200]).toBe(1)
    expect(presentation.combos[0].chart.labels.at(-1)).toBe(1200)
  })

  it('supports upper-tail mode without changing canonical probabilities', () => {
    const presentation = present([
      createEnvelope({ values: [0.25, 0.75], support: { kind: 'finite', max: 1 } }),
    ], {
      min: 0,
      max: 1,
      mode: ATTACK_DISPLAY_MODES.UPPER_TAIL,
    })

    expect(presentation.status).toBe('ready')
    expect(presentation.combos[0].series.mode).toBe('upper-tail')
    expect(Array.from(presentation.combos[0].series.values))
      .toEqual([1, 0.75])
    expect(presentation.combos[0].display.expectedValue.kind).toBe('exact')
  })

  it('returns recalculate without partial series when coverage is missing', () => {
    const presentation = present([
      createEnvelope({
        values: [0.5, 0.5],
        support: { kind: 'finite', max: 4 },
      }),
    ], {
      min: 0,
      max: 4,
      mode: ATTACK_DISPLAY_MODES.PMF,
    })

    expect(presentation.status).toBe('not-ready')
    expect(presentation.decision)
      .toBe(ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE)
    expect(presentation.combos[0]).toMatchObject({
      status: 'not-ready',
      decision: 'recalculate',
      plan: {
        decision: 'recalculate',
        coverage: { missingSegments: [{ min: 2, max: 4, pointCount: 3 }] },
      },
      series: {
        status: 'not-ready',
        reason: CANONICAL_CHART_SERIES_NOT_READY_REASONS.RECALCULATE,
      },
      chart: null,
    })
  })

  it('uses finite support as proof for known-zero windows', () => {
    const presentation = present([
      createEnvelope({
        values: [1],
        support: { kind: 'finite', max: 2 },
      }),
    ], {
      min: 3,
      max: 5,
      mode: ATTACK_DISPLAY_MODES.PMF,
    })

    expect(presentation.status).toBe('ready')
    expect(presentation.decision)
      .toBe(ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.KNOWN_ZERO)
    expect(presentation.combos[0]).toMatchObject({
      status: 'ready',
      decision: 'known-zero',
      plan: { decision: 'known-zero' },
    })
    expect(Array.from(presentation.combos[0].series.values))
      .toEqual([0, 0, 0])
  })

  it('keeps exact overflow outside the window usable and overlap non-projectable', () => {
    const outside = present([
      createEnvelope({
        values: [0.25, 0.25],
        support: { kind: 'finite', max: 5 },
        overflow: {
          kind: 'exact',
          lowerBound: 5,
          probability: 0.5,
          errorBound: 0.01,
        },
      }),
    ], {
      min: 0,
      max: 1,
      mode: ATTACK_DISPLAY_MODES.PMF,
    })
    expect(outside.combos[0]).toMatchObject({
      status: 'ready',
      decision: 'reuse',
      series: { status: 'ready' },
    })
    expect(outside.combos[0].display.expectedValue.kind).toBe('exact')

    const bounded = present([
      createEnvelope({
        values: [0.25],
        support: { kind: 'finite', max: 8 },
        overflow: {
          kind: 'exact',
          lowerBound: 4,
          probability: 0.75,
          errorBound: 0.1,
        },
      }),
    ], {
      min: 0,
      max: 0,
      mode: ATTACK_DISPLAY_MODES.PMF,
    })
    expect(bounded.combos[0].display.expectedValue.kind).toBe('bounded')

    const lowerBound = present([
      createEnvelope({
        values: [0.25],
        support: { kind: 'infinite' },
        overflow: {
          kind: 'exact',
          lowerBound: 4,
          probability: 0.75,
          errorBound: 0.1,
        },
      }),
    ], {
      min: 0,
      max: 0,
      mode: ATTACK_DISPLAY_MODES.PMF,
    })
    expect(lowerBound.combos[0].display.expectedValue.kind).toBe('lower-bound')

    const overlap = present([
      createEnvelope({
        values: [0.25, 0.25],
        support: { kind: 'finite', max: 5 },
        overflow: {
          kind: 'exact',
          lowerBound: 1,
          probability: 0.5,
          errorBound: 0,
        },
      }),
    ], {
      min: 0,
      max: 1,
      mode: ATTACK_DISPLAY_MODES.PMF,
    })
    expect(overlap.status).toBe('not-projectable')
    expect(overlap.decision)
      .toBe(ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE)
    expect(overlap.combos[0]).toMatchObject({
      status: 'not-projectable',
      decision: 'recalculate',
      reason: CANONICAL_CHART_SERIES_NOT_PROJECTABLE_REASONS.EXACT_OVERFLOW_OVERLAP,
      chart: null,
    })
    expect(overlap.combos[0].series).not.toHaveProperty('values')
  })

  it('does not pointify upper-bound overflow', () => {
    const presentation = present([
      createEnvelope({
        values: [0.4, 0.4],
        support: { kind: 'finite', max: 3 },
        overflow: {
          kind: 'upper-bound',
          lowerBound: 1,
          probabilityUpperBound: 0.2,
          errorBound: 0,
        },
      }),
    ], {
      min: 0,
      max: 1,
      mode: ATTACK_DISPLAY_MODES.PMF,
    })

    expect(presentation.status).toBe('not-projectable')
    expect(presentation.decision)
      .toBe(ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.NOT_PROJECTABLE)
    expect(presentation.combos[0]).toMatchObject({
      status: 'not-projectable',
      decision: 'not-projectable',
      reason: CANONICAL_CHART_SERIES_NOT_PROJECTABLE_REASONS.UPPER_BOUND_OVERFLOW,
      chart: null,
    })
  })

  it('keeps active upper-bound overlap terminal when coverage is also missing', () => {
    const presentation = present([
      createEnvelope({
        values: [0.4],
        support: { kind: 'finite', max: 4 },
        overflow: {
          kind: 'upper-bound',
          lowerBound: 1,
          probabilityUpperBound: 0.6,
          errorBound: 0,
        },
      }),
    ], {
      min: 0,
      max: 3,
      mode: ATTACK_DISPLAY_MODES.PMF,
    })

    expect(presentation.status).toBe('not-ready')
    expect(presentation.decision)
      .toBe(ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.NOT_PROJECTABLE)
    expect(presentation.combos[0]).toMatchObject({
      status: 'not-ready',
      decision: 'not-projectable',
      reason: CANONICAL_CHART_SERIES_NOT_PROJECTABLE_REASONS.UPPER_BOUND_OVERFLOW,
      plan: { decision: 'recalculate' },
      series: {
        status: 'not-ready',
        reason: CANONICAL_CHART_SERIES_NOT_READY_REASONS.RECALCULATE,
      },
      chart: null,
    })
  })

  it('returns a typed resource rejection without allocating a series', () => {
    const presentation = present([
      createEnvelope({ values: [1], support: { kind: 'finite', max: 0 } }),
    ], {
      min: 0,
      max: 2,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }, {
      warning: { pointCount: 1, float64Bytes: 8, chartPoints: 1 },
      hard: { pointCount: 2, float64Bytes: 16, chartPoints: 2 },
    })

    expect(presentation.status).toBe('not-ready')
    expect(presentation.decision)
      .toBe(ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RESOURCE_REJECTED)
    expect(presentation.combos[0]).toMatchObject({
      status: 'not-ready',
      decision: 'resource-rejected',
      plan: { status: 'resource-rejected' },
      series: {
        status: 'not-ready',
        reason: CANONICAL_CHART_SERIES_NOT_READY_REASONS.RESOURCE_REJECTED,
      },
      chart: null,
    })
  })

  it('presents two combos and their canonical total independently', () => {
    const presentation = present([
      createEnvelope({ values: [1], support: { kind: 'finite', max: 0 } }),
      createEnvelope({ values: [0.5, 0.5], support: { kind: 'finite', max: 1 } }),
    ], {
      min: 0,
      max: 1,
      mode: ATTACK_DISPLAY_MODES.PMF,
    })

    expect(presentation.status).toBe('ready')
    expect(presentation.combos.map(({ id }) => id))
      .toEqual(['combo-1', 'combo-2'])
    expect(Array.from(presentation.combos[0].series.values))
      .toEqual([1, 0])
    expect(Array.from(presentation.combos[1].series.values))
      .toEqual([0.5, 0.5])
    expect(Array.from(presentation.total.series.values))
      .toEqual([0.5, 0.5])
  })

  it('freezes the contract and does not alias the request or canonical input', () => {
    const batch = createBatch([
      createEnvelope({ values: [0.25, 0.75], support: { kind: 'finite', max: 1 } }),
    ])
    const request = {
      min: 0,
      max: 1,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const inputValues = Array.from(batch.combos[0].canonicalDamage.result.values)
    const presentation = createAttackCanonicalDisplayPresentation(batch, {
      displayRequest: request,
      rangePlans: [createPlan()],
    })

    expect(Object.isFrozen(presentation)).toBe(true)
    expect(Object.isFrozen(presentation.displayRequest)).toBe(true)
    expect(Object.isFrozen(presentation.combos)).toBe(true)
    expect(Object.isFrozen(presentation.combos[0])).toBe(true)
    expect(Object.isFrozen(presentation.combos[0].display)).toBe(true)
    expect(Object.isFrozen(presentation.combos[0].plan)).toBe(true)
    expect(Object.isFrozen(presentation.combos[0].chart)).toBe(true)
    expect(presentation.displayRequest).not.toBe(request)
    expect(presentation.combos[0].series.values)
      .not.toBe(batch.combos[0].canonicalDamage.result.values)

    request.max = 1200
    batch.combos[0].canonicalDamage.result.values[0] = 0
    expect(presentation.displayRequest.max).toBe(1)
    expect(Array.from(presentation.combos[0].display.explicit.probabilities))
      .toEqual(inputValues)
  })

  it('rejects explicit null display options while preserving undefined omission semantics', () => {
    const batch = createBatch([
      createEnvelope({ values: [1], support: { kind: 'finite', max: 0 } }),
    ])
    const rangePlans = [createPlan()]
    const validRequest = { min: 0, max: 0, mode: ATTACK_DISPLAY_MODES.PMF }

    expect(() => createAttackCanonicalDisplayPresentation(batch, {
      displayRequest: null,
      rangePlans,
    })).toThrow(expect.objectContaining({
      code: ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_OPTIONS,
    }))
    expect(() => createAttackCanonicalDisplayPresentation(batch, {
      displayRequest: validRequest,
      rangePlans: null,
    })).toThrow(expect.objectContaining({
      code: ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_OPTIONS,
    }))
    expect(() => createAttackCanonicalDisplayPresentation(batch, {
      displayRequest: validRequest,
      rangePlans,
      policy: null,
    })).toThrow(expect.objectContaining({
      code: ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_OPTIONS,
    }))

    expect(() => createAttackCanonicalDisplayPresentation(batch, {
      displayRequest: undefined,
      rangePlans,
      policy: undefined,
    })).not.toThrow()
  })
})
