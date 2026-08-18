import { describe, expect, it } from 'vitest'

import {
  createDistributionResult,
} from '../src/calculation/DistributionResult'
import { getCanonicalDamageSummary } from '../src/calculation/DamageCalculator'
import {
  CANONICAL_DISTRIBUTION_DISPLAY_VERSION,
  DEFAULT_DISPLAY_RANGE_PLANNER_POLICY,
  DISPLAY_RANGE_PLANNER_ERROR_CODES,
  DisplayRangePlannerError,
  createDisplayRangePlanner,
  planDisplayRange,
  presentCanonicalDistribution,
} from '../src/presentation'

function createEnvelope({
  values,
  offset = 0,
  support = { kind: 'finite', max: values.length - 1 },
  overflow = null,
}) {
  const result = createDistributionResult({
    values,
    offset,
    support,
    overflow,
  })
  return {
    result,
    metadata: { modeledDistribution: true },
  }
}

function createDisplay(options = {}) {
  const values = options.values ?? [1]
  const envelope = createEnvelope({
    values,
    offset: options.offset,
    support: options.support,
    overflow: options.overflow,
  })
  const presentationOptions = {
    summary: getCanonicalDamageSummary(envelope),
  }
  if (options.displayWindow !== undefined) {
    presentationOptions.displayWindow = options.displayWindow
  }
  return presentCanonicalDistribution(envelope, presentationOptions)
}

function plan(display, displayWindow, policy) {
  return planDisplayRange(display, {
    displayWindow,
    ...(policy === undefined ? {} : { policy }),
  })
}

describe('DisplayRangePlanner', () => {
  it('reuses a window fully contained by explicit coverage', () => {
    const display = createDisplay({
      values: [0.25, 0.5, 0.25],
      support: { kind: 'finite', max: 12 },
    })
    const result = plan(display, { min: 1, max: 2 })

    expect(result).toMatchObject({
      accepted: true,
      status: 'ready',
      decision: 'reuse',
      reason: 'explicit-coverage',
      displayWindow: { min: 1, max: 2, pointCount: 2 },
      coverage: {
        explicit: { offset: 0, max: 2 },
        support: { kind: 'finite', max: 12 },
        overflow: null,
        missingSegments: [],
        knownZero: { kind: 'none', pointCount: 0, right: null },
      },
    })
    expect(result.estimates).toEqual({
      pointCount: 2,
      float64Bytes: 16,
      chartPoints: 2,
    })
    expect(Object.keys(result).sort()).toEqual([
      'accepted',
      'coverage',
      'decision',
      'displayWindow',
      'estimates',
      'kind',
      'reason',
      'rejectionReasons',
      'status',
      'version',
      'warnings',
    ].sort())
  })

  it('fixes the existing 1024-coverage fixture for 0..999 and 0..1023', () => {
    const values = new Array(1024).fill(0)
    values[0] = 1
    const display = createDisplay({
      values,
      support: { kind: 'finite', max: 1023 },
    })

    expect(plan(display, { min: 0, max: 999 })).toMatchObject({
      accepted: true,
      decision: 'reuse',
      coverage: { explicit: { max: 1023 } },
      estimates: { pointCount: 1000 },
    })
    expect(plan(display, { min: 0, max: 1023 })).toMatchObject({
      accepted: true,
      decision: 'reuse',
      coverage: { explicit: { max: 1023 } },
      estimates: { pointCount: 1024 },
    })
  })

  it('requires recalculation for both lower and upper coverage extensions', () => {
    const display = createDisplay({
      values: [0.25, 0.5, 0.25],
      offset: 10,
      support: { kind: 'finite', max: 30 },
    })
    const result = plan(display, { min: 5, max: 20 })

    expect(result).toMatchObject({
      decision: 'recalculate',
      reason: 'lower-and-upper-coverage',
      coverage: {
        explicit: { offset: 10, max: 12 },
        missingSegments: [
          { min: 5, max: 9, pointCount: 5 },
          { min: 13, max: 20, pointCount: 8 },
        ],
      },
    })
  })

  it('reuses explicit values and marks a finite-support extension as known zero', () => {
    const display = createDisplay({
      values: [0.25, 0.5, 0.25],
      support: { kind: 'finite', max: 2 },
    })
    const result = plan(display, { min: 0, max: 10 })

    expect(result).toMatchObject({
      accepted: true,
      decision: 'reuse',
      reason: 'explicit-coverage-with-known-zero',
      coverage: {
        missingSegments: [],
        knownZero: {
          kind: 'finite-support-outside',
          pointCount: 8,
          right: { min: 3, max: 10, pointCount: 8 },
        },
      },
    })
  })

  it('recalculates the support portion when a finite window crosses support.max', () => {
    const display = createDisplay({
      values: [0.5, 0.5],
      support: { kind: 'finite', max: 8 },
    })
    const result = plan(display, { min: 0, max: 10 })

    expect(result).toMatchObject({
      decision: 'recalculate',
      reason: 'support-coverage',
      coverage: {
        missingSegments: [{ min: 2, max: 8, pointCount: 7 }],
        knownZero: {
          kind: 'finite-support-outside',
          pointCount: 2,
          right: { min: 9, max: 10, pointCount: 2 },
        },
      },
    })
  })

  it('treats a window entirely above finite support as known zero', () => {
    const display = createDisplay({
      values: [1],
      support: { kind: 'finite', max: 4 },
    })
    const result = plan(display, { min: 5, max: 10 })

    expect(result).toMatchObject({
      decision: 'known-zero',
      coverage: {
        missingSegments: [],
        knownZero: {
          kind: 'finite-support-outside',
          pointCount: 6,
          right: { min: 5, max: 10, pointCount: 6 },
        },
      },
    })
  })

  it('requires recalculation for insufficient coverage with infinite support', () => {
    const display = createDisplay({
      values: [0.5],
      support: { kind: 'infinite' },
      overflow: {
        kind: 'exact',
        lowerBound: 1,
        probability: 0.5,
        errorBound: 0,
      },
    })
    const result = plan(display, { min: 0, max: 2 })

    expect(result).toMatchObject({
      decision: 'recalculate',
      reason: 'support-coverage',
      coverage: {
        overflow: {
          kind: 'exact',
          lowerBound: 1,
          probability: 0.5,
        },
        missingSegments: [{ min: 1, max: 2, pointCount: 2 }],
        knownZero: { kind: 'none', pointCount: 0, right: null },
      },
    })
  })

  it('does not scan explicit coefficient values while planning a window', () => {
    const probabilities = new Array(1_000_000)
    Object.defineProperty(probabilities, '0', {
      configurable: true,
      get() {
        throw new Error('explicit coefficient must not be read')
      },
    })
    const display = {
      kind: 'canonical-distribution-display',
      version: CANONICAL_DISTRIBUTION_DISPLAY_VERSION,
      explicit: { offset: 0, probabilities },
      explicitMax: probabilities.length - 1,
      support: { kind: 'finite', max: probabilities.length - 1 },
      overflow: null,
    }

    expect(plan(display, { min: 0, max: 0 })).toMatchObject({
      accepted: true,
      decision: 'reuse',
      reason: 'explicit-coverage',
      coverage: {
        explicit: { offset: 0, max: 999_999 },
      },
    })
  })

  it('keeps empty explicit coverage conservative on the lower side', () => {
    const display = createDisplay({
      values: [],
      offset: 5,
      support: { kind: 'finite', max: 10 },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 5,
        probabilityUpperBound: 1,
        errorBound: 0,
      },
    })
    const result = plan(display, { min: 0, max: 4 })

    expect(result).toMatchObject({
      decision: 'recalculate',
      reason: 'lower-coverage',
      coverage: {
        explicit: { offset: 5, max: null },
        missingSegments: [{ min: 0, max: 4, pointCount: 5 }],
      },
    })
  })

  it('uses the retained displayWindow when no second argument is supplied', () => {
    const display = createDisplay({
      values: [1],
      displayWindow: { min: 0, max: 0 },
    })
    const result = planDisplayRange(display)

    expect(result.displayWindow).toEqual({ min: 0, max: 0, pointCount: 1 })
    expect(result.decision).toBe('reuse')
  })

  it('accepts the safe boundary but rejects unsafe point-count and byte estimates', () => {
    const display = createDisplay({
      values: [1],
      support: { kind: 'finite', max: Number.MAX_SAFE_INTEGER },
    })

    expect(plan(display, {
      min: Number.MAX_SAFE_INTEGER,
      max: Number.MAX_SAFE_INTEGER,
    }).estimates).toMatchObject({
      pointCount: 1,
      float64Bytes: 8,
    })
    expect(plan(display, {
      min: Number.MAX_SAFE_INTEGER - 1,
      max: Number.MAX_SAFE_INTEGER,
    }).estimates.pointCount).toBe(2)

    expect(() => plan(display, {
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
    })).toThrow(DisplayRangePlannerError)
    try {
      plan(display, { min: 0, max: Number.MAX_SAFE_INTEGER })
    } catch (error) {
      expect([
        DISPLAY_RANGE_PLANNER_ERROR_CODES.RANGE_OVERFLOW,
        DISPLAY_RANGE_PLANNER_ERROR_CODES.ESTIMATE_OVERFLOW,
      ]).toContain(error.code)
    }
  })

  it('returns warning and hard-rejection decisions from an injected resource policy', () => {
    const display = createDisplay({
      values: [1],
      support: { kind: 'finite', max: 10 },
    })
    const warning = plan(display, { min: 0, max: 4 }, {
      warning: { pointCount: 2, float64Bytes: 16, chartPoints: 2 },
      hard: { pointCount: 10, float64Bytes: 1000, chartPoints: 10 },
    })
    expect(warning).toMatchObject({
      accepted: true,
      status: 'ready',
    })
    expect(warning.warnings.map(({ code }) => code)).toEqual([
      'display-point-count',
      'display-float64-memory',
      'chart-point-count',
    ])
    expect(warning.warnings.every(({ severity }) => severity === 'warning'))
      .toBe(true)

    const rejected = plan(display, { min: 0, max: 4 }, {
      warning: { pointCount: 2, float64Bytes: 16, chartPoints: 2 },
      hard: { pointCount: 4, float64Bytes: 1000, chartPoints: 10 },
    })
    expect(rejected).toMatchObject({
      accepted: false,
      status: 'resource-rejected',
      decision: 'recalculate',
      rejectionReasons: ['display-point-count'],
    })
    expect(rejected.warnings).toContainEqual(expect.objectContaining({
      code: 'display-point-count',
      severity: 'reject',
      value: 5,
      limit: 4,
    }))
  })

  it('does not alias input objects and freezes the complete result', () => {
    const display = {
      kind: 'canonical-distribution-display',
      version: CANONICAL_DISTRIBUTION_DISPLAY_VERSION,
      explicit: { offset: 2, probabilities: [1] },
      explicitMax: 2,
      support: { kind: 'finite', max: 4 },
      overflow: {
        kind: 'exact',
        lowerBound: 3,
        probability: 0,
        errorBound: 0,
      },
    }
    const displayWindow = { min: 2, max: 3 }
    const result = planDisplayRange(display, { displayWindow })

    expect(result.displayWindow).not.toBe(displayWindow)
    expect(result.coverage.explicit).not.toBe(display.explicit)
    expect(result.coverage.support).not.toBe(display.support)
    expect(result.coverage.overflow).not.toBe(display.overflow)
    expect(result).not.toHaveProperty('action')
    expect(result).not.toHaveProperty('resource')
    expect(result).not.toHaveProperty('explicit')

    displayWindow.min = 0
    display.explicit.offset = 99
    display.support.max = 99
    display.overflow.lowerBound = 99
    expect(result.displayWindow).toEqual({
      min: 2,
      max: 3,
      pointCount: 2,
    })
    expect(result.coverage.explicit).toEqual({ offset: 2, max: 2 })
    expect(result.coverage.support).toEqual({ kind: 'finite', max: 4 })
    expect(result.coverage.overflow.lowerBound).toBe(3)

    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.displayWindow)).toBe(true)
    expect(Object.isFrozen(result.coverage)).toBe(true)
    expect(Object.isFrozen(result.coverage.missingSegments)).toBe(true)
    expect(Object.isFrozen(result.coverage.knownZero)).toBe(true)
  })

  it('rejects malformed displays, windows, and policies before planning', () => {
    const display = createDisplay()
    expect(() => planDisplayRange(display, {
      displayWindow: { min: 2, max: 1 },
    })).toThrow(DisplayRangePlannerError)
    expect(() => planDisplayRange(display, {
      displayWindow: { min: -1, max: 1 },
    })).toThrow(DisplayRangePlannerError)
    expect(() => planDisplayRange({
      explicit: { offset: 0, probabilities: [1] },
      explicitMax: 1,
      support: { kind: 'finite', max: 1 },
      overflow: null,
    }, { min: 0, max: 0 })).toThrow(DisplayRangePlannerError)
    expect(() => planDisplayRange(display, {
      displayWindow: { min: 0, max: 0 },
      policy: {
        warning: { pointCount: 2 },
        hard: { pointCount: 1 },
      },
    })).toThrow(DisplayRangePlannerError)
  })

  it('requires the canonical display kind and version own data properties', () => {
    const display = createDisplay()
    const missingKind = { ...display }
    delete missingKind.kind
    const missingVersion = { ...display }
    delete missingVersion.version
    const wrongKind = { ...display, kind: 'other-display' }
    const wrongVersion = { ...display, version: 999 }
    const accessorKind = { ...display }
    Object.defineProperty(accessorKind, 'kind', {
      configurable: true,
      enumerable: true,
      get() {
        return display.kind
      },
    })
    const accessorVersion = { ...display }
    Object.defineProperty(accessorVersion, 'version', {
      configurable: true,
      enumerable: true,
      get() {
        return display.version
      },
    })

    expect(() => plan(missingKind, { min: 0, max: 0 }))
      .toThrow(DisplayRangePlannerError)
    expect(() => plan(missingVersion, { min: 0, max: 0 }))
      .toThrow(DisplayRangePlannerError)
    expect(() => plan(wrongKind, { min: 0, max: 0 }))
      .toThrow(DisplayRangePlannerError)
    expect(() => plan(wrongVersion, { min: 0, max: 0 }))
      .toThrow(DisplayRangePlannerError)
    expect(() => plan(accessorKind, { min: 0, max: 0 }))
      .toThrow(DisplayRangePlannerError)
    expect(() => plan(accessorVersion, { min: 0, max: 0 }))
      .toThrow(DisplayRangePlannerError)
  })

  it('exposes an immutable policy-bound planner without reusing legacy limits', () => {
    const display = createDisplay({
      values: [1],
      support: { kind: 'finite', max: 10 },
    })
    const planner = createDisplayRangePlanner({
      warning: { pointCount: 1 },
      hard: { pointCount: 2 },
    })
    const result = planner.plan(display, { min: 0, max: 1 })

    expect(DEFAULT_DISPLAY_RANGE_PLANNER_POLICY.hard.pointCount)
      .toBeGreaterThan(1000)
    expect(planner.policy).toEqual({
      warning: {
        pointCount: 1,
        float64Bytes: 32 * 1024 * 1024,
        chartPoints: 4_096,
      },
      hard: {
        pointCount: 2,
        float64Bytes: 64 * 1024 * 1024,
        chartPoints: 16_384,
      },
    })
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: 'display-point-count',
      severity: 'warning',
    }))
    expect(Object.isFrozen(planner)).toBe(true)
    expect(Object.isFrozen(planner.policy)).toBe(true)
  })
})
