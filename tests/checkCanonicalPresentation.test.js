import { describe, expect, it } from 'vitest'

import {
  createDistributionResult,
  isDistributionResultError,
} from '../src/calculation/DistributionResult'
import {
  CANONICAL_CHART_SERIES_NOT_PROJECTABLE_REASONS,
  CANONICAL_CHART_SERIES_NOT_READY_REASONS,
} from '../src/presentation'
import {
  CHECK_CANONICAL_PRESENTATION_ERROR_CODES,
  CheckCanonicalPresentationError,
  createCheckCanonicalPresentation,
  isCheckCanonicalPresentationError,
} from '../src/application/CheckCanonicalPresentation'
import { getChartColor } from '../src/data/ColorSetter'

function createScoreResult({
  values = [1],
  offset = 0,
  support = { kind: 'finite', max: 0 },
  overflow = null,
} = {}) {
  return createDistributionResult({ values, offset, support, overflow })
}

function createCheckResult(action, reaction = action) {
  return { score: { action, reaction } }
}

function present(
  checkResult,
  {
    min = 0,
    max = 0,
    mode = 'pmf',
    opposed = true,
    policy,
  } = {}
) {
  return createCheckCanonicalPresentation(checkResult, {
    displayWindow: { min, max },
    mode,
    opposed,
    ...(policy === undefined ? {} : { policy }),
  })
}

describe('createCheckCanonicalPresentation', () => {
  it('connects finite action and reaction distributions through every shared contract', () => {
    const action = createScoreResult({
      values: [0.123456, 0.876544],
      support: { kind: 'finite', max: 1 },
    })
    const reaction = createScoreResult({
      values: [0.2, 0.8],
      support: { kind: 'finite', max: 1 },
    })

    const presentation = present(createCheckResult(action, reaction), {
      min: 0,
      max: 1,
    })

    expect(presentation).toMatchObject({
      kind: 'check-canonical-presentation',
      version: 1,
      status: 'ready',
      mode: 'pmf',
      opposed: true,
      action: {
        plan: {
          status: 'ready',
          decision: 'reuse',
        },
        status: 'ready',
        reason: null,
      },
      reaction: {
        plan: { status: 'ready', decision: 'reuse' },
        status: 'ready',
        reason: null,
      },
    })
    expect(presentation.action).not.toHaveProperty('display')
    expect(presentation.action).not.toHaveProperty('series')
    expect(Object.keys(presentation.action).sort()).toEqual([
      'plan',
      'reason',
      'status',
    ])
    expect(presentation.chart.labels).toEqual([0, 1])
    expect(presentation.chart.datasets).toHaveLength(2)
    expect(presentation.chart.datasets[0]).toMatchObject({
      label: 'アクション側',
      backgroundColor: getChartColor(0),
      borderColor: getChartColor(0),
      parsing: true,
    })
    expect(presentation.chart.datasets[1]).toMatchObject({
      label: 'リアクション側',
      backgroundColor: getChartColor(1),
      borderColor: getChartColor(1),
      parsing: true,
    })
    expect(presentation.chart.datasets[0].data)
      .toEqual(new Float64Array([12.3, 87.7]))
    expect(presentation.chart.datasets[1].data)
      .toEqual(new Float64Array([20, 80]))
  })

  it('keeps exact overflow out of a projected window and preserves bounded expectation', () => {
    const action = createScoreResult({
      values: [0.4, 0.2],
      support: { kind: 'finite', max: 3 },
      overflow: {
        kind: 'exact',
        lowerBound: 1,
        probability: 0.4,
        errorBound: 0,
      },
    })

    const presentation = present(createCheckResult(action), {
      min: 0,
      max: 1,
    })

    expect(presentation.status).toBe('not-projectable')
    expect(presentation.action.plan.decision).toBe('reuse')
    expect(presentation.action.status).toBe('not-projectable')
    expect(presentation.action.reason)
      .toBe(CANONICAL_CHART_SERIES_NOT_PROJECTABLE_REASONS.EXACT_OVERFLOW_OVERLAP)
    expect(presentation.action).not.toHaveProperty('display')
    expect(presentation.action).not.toHaveProperty('series')
    expect(presentation.chart).toBeNull()
  })

  it('reuses infinite-support explicit coverage while retaining a lower-bound expectation', () => {
    const action = createScoreResult({
      values: [0.25, 0.5],
      support: { kind: 'infinite' },
      overflow: {
        kind: 'exact',
        lowerBound: 5,
        probability: 0.25,
        errorBound: 0.01,
      },
    })

    const presentation = present(createCheckResult(action), {
      min: 0,
      max: 1,
    })

    expect(presentation.status).toBe('ready')
    expect(presentation.action.plan.decision).toBe('reuse')
    expect(Array.from(presentation.chart.datasets[0].data))
      .toEqual([25, 50])

    const upperTailPresentation = present(createCheckResult(action), {
      min: 0,
      max: 1,
      mode: 'upper-tail',
    })
    expect(upperTailPresentation.status).toBe('ready')
    expect(Array.from(upperTailPresentation.chart.datasets[0].data))
      .toEqual([100, 75])
  })

  it('marks a window requiring missing score coverage as recalculation, without partial chart data', () => {
    const action = createScoreResult({
      values: [0.5, 0.5],
      offset: 5,
      support: { kind: 'finite', max: 8 },
    })
    const reaction = createScoreResult({
      values: [1],
      support: { kind: 'finite', max: 0 },
    })

    const presentation = present(createCheckResult(action, reaction), {
      min: 4,
      max: 6,
    })

    expect(presentation.status).toBe('not-ready')
    expect(presentation.action.plan).toMatchObject({
      status: 'ready',
      decision: 'recalculate',
      coverage: {
        missingSegments: [{ min: 4, max: 4, pointCount: 1 }],
      },
    })
    expect(presentation.action.status).toBe('not-ready')
    expect(presentation.action.reason)
      .toBe(CANONICAL_CHART_SERIES_NOT_READY_REASONS.RECALCULATE)
    expect(presentation.reaction.status).toBe('ready')
    expect(presentation.chart).toBeNull()
  })

  it('prioritizes non-projectable status over a recalculating side', () => {
    const action = createScoreResult({
      values: [0.4, 0.2],
      support: { kind: 'finite', max: 3 },
      overflow: {
        kind: 'exact',
        lowerBound: 1,
        probability: 0.4,
        errorBound: 0,
      },
    })
    const reaction = createScoreResult({
      values: [1],
      offset: 5,
      support: { kind: 'finite', max: 8 },
    })

    const presentation = present(createCheckResult(action, reaction), {
      min: 0,
      max: 1,
    })

    expect(presentation.status).toBe('not-projectable')
    expect(presentation.action.status).toBe('not-projectable')
    expect(presentation.reaction.status).toBe('not-ready')
    expect(presentation.reaction.reason)
      .toBe(CANONICAL_CHART_SERIES_NOT_READY_REASONS.RECALCULATE)
    expect(presentation.chart).toBeNull()
  })

  it('keeps resource rejection typed and injectable without a fixed display ceiling', () => {
    const action = createScoreResult({
      values: [1],
      support: { kind: 'finite', max: 0 },
    })
    const policy = {
      warning: { pointCount: 1, float64Bytes: 8, chartPoints: 1 },
      hard: { pointCount: 2, float64Bytes: 16, chartPoints: 2 },
    }

    const presentation = present(createCheckResult(action), {
      min: 0,
      max: 2,
      policy,
    })

    expect(presentation.status).toBe('not-ready')
    expect(presentation.action.plan).toMatchObject({
      status: 'resource-rejected',
      accepted: false,
      rejectionReasons: [
        'display-point-count',
        'display-float64-memory',
        'chart-point-count',
      ],
    })
    expect(presentation.action.status).toBe('not-ready')
    expect(presentation.action.reason)
      .toBe(CANONICAL_CHART_SERIES_NOT_READY_REASONS.RESOURCE_REJECTED)
    expect(presentation.chart).toBeNull()
  })

  it('supports upper-tail mode and does not pointify an upper-bound overflow', () => {
    const action = createScoreResult({
      values: [0.4, 0.4],
      support: { kind: 'finite', max: 3 },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 2,
        probabilityUpperBound: 0.2,
        errorBound: 0,
      },
    })
    const reaction = createScoreResult({
      values: [0.5, 0.5],
      support: { kind: 'finite', max: 1 },
    })

    const presentation = present(createCheckResult(action, reaction), {
      min: 0,
      max: 1,
      mode: 'upper-tail',
    })

    expect(presentation.mode).toBe('upper-tail')
    expect(presentation.status).toBe('not-projectable')
    expect(presentation.action.status).toBe('not-projectable')
    expect(presentation.action.reason)
      .toBe(CANONICAL_CHART_SERIES_NOT_PROJECTABLE_REASONS.UPPER_BOUND_OVERFLOW)
    expect(presentation.reaction.status).toBe('ready')
    expect(presentation.chart).toBeNull()
  })

  it('omits the reaction side and returns one action dataset for action-only checks', () => {
    const action = createScoreResult({
      values: [0.25, 0.75],
      support: { kind: 'finite', max: 1 },
    })

    const presentation = present(createCheckResult(action, null), {
      min: 0,
      max: 3,
      opposed: false,
    })

    expect(presentation.opposed).toBe(false)
    expect(presentation).not.toHaveProperty('reaction')
    expect(presentation.action.plan.decision).toBe('reuse')
    expect(presentation.action.status).toBe('ready')
    expect(presentation.chart.datasets).toHaveLength(1)
    expect(presentation.chart.datasets[0].label).toBe('アクション側')
  })

  it('does not mutate the calculation result or display-window input', () => {
    const action = createScoreResult({
      values: [0.25, 0.75],
      support: { kind: 'finite', max: 1 },
    })
    const reaction = createScoreResult({
      values: [0.5, 0.5],
      support: { kind: 'finite', max: 1 },
    })
    const input = createCheckResult(action, reaction)
    const window = { min: 0, max: 1 }
    const inputBefore = {
      score: { action, reaction },
    }
    const actionBefore = Array.from(action.values)
    const reactionBefore = Array.from(reaction.values)

    createCheckCanonicalPresentation(input, {
      displayWindow: window,
      mode: 'pmf',
      opposed: true,
    })

    expect(input).toEqual(inputBefore)
    expect(window).toEqual({ min: 0, max: 1 })
    expect(Array.from(action.values)).toEqual(actionBefore)
    expect(Array.from(reaction.values)).toEqual(reactionBefore)
  })

  it('accepts only the options-object invocation', () => {
    const action = createScoreResult({
      values: [1],
      support: { kind: 'finite', max: 0 },
    })

    expect(() => createCheckCanonicalPresentation(
      createCheckResult(action),
      { min: 0, max: 0 }
    )).toThrow(expect.objectContaining({
      code: CHECK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_OPTIONS,
    }))
    expect(() => createCheckCanonicalPresentation(
      createCheckResult(action),
      { displayWindow: { min: 0, max: 0 } },
      'pmf',
      false
    )).toThrow(expect.objectContaining({
      code: CHECK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_OPTIONS,
    }))

    const presentation = createCheckCanonicalPresentation(
      createCheckResult(action, null),
      {
        displayWindow: { min: 0, max: 0 },
        mode: 'pmf',
        opposed: false,
      }
    )
    expect(presentation.action.status).toBe('ready')
    expect(presentation).not.toHaveProperty('reaction')
  })

  it('preserves typed validation errors and never falls back to legacy data', () => {
    const invalid = {
      score: {
        action: { version: 1 },
        reaction: { version: 1 },
      },
    }

    expect(() => present(invalid)).toThrow(
      expect.objectContaining({ name: 'DistributionResultValidationError' })
    )
    try {
      present(invalid)
    } catch (error) {
      expect(isDistributionResultError(error)).toBe(true)
      expect(error.name).toBe('DistributionResultValidationError')
    }

    expect(() => createCheckCanonicalPresentation({ score: {} }, {
      displayWindow: { min: 0, max: 0 },
      opposed: true,
    })).toThrow(expect.objectContaining({
      code: CHECK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_SCORE,
    }))
    expect(isCheckCanonicalPresentationError(new CheckCanonicalPresentationError(
      'test',
      'test'
    ))).toBe(true)
  })
})
