import { describe, expect, it } from 'vitest'

import { calculateFinalEncroachment } from '../src/calculation/BacktrackCalculator'
import { createDistributionResult } from '../src/calculation/DistributionResult'
import { planCalculationRanges } from '../src/calculation/RangePlanner'
import {
  BACKTRACK_PRESENTATION_ERROR_CODES,
  BacktrackPresentationValidationError,
  createBacktrackPresentation,
  isBacktrackPresentationError,
} from '../src/features/backtrack/model/BacktrackPresentation'
const RESULT_KEYS = ['single', 'double', 'second']

function createPointResult(finalEncroachment) {
  return createDistributionResult({
    values: [1],
    offset: finalEncroachment,
    support: { kind: 'finite', max: finalEncroachment },
    overflow: null,
  })
}

function createResultsFromPoint(finalEncroachment) {
  const result = createPointResult(finalEncroachment)
  return {
    single: result,
    double: result,
    second: result,
  }
}

function createResultFromEntries(entries) {
  const offset = Math.min(...entries.map(([value]) => value))
  const supportMax = Math.max(...entries.map(([value]) => value))
  const values = new Float64Array(supportMax - offset + 1)
  for (const [value, probability] of entries) {
    values[value - offset] = probability
  }
  return createDistributionResult({
    values,
    offset,
    support: { kind: 'finite', max: supportMax },
    overflow: null,
  })
}

function createResult(result) {
  return {
    single: result,
    double: result,
    second: result,
  }
}

function createFromProducer(params) {
  const plan = planCalculationRanges({
    operation: 'backtrack',
    backtrack: params,
  })
  return calculateFinalEncroachment(
    params,
    {},
    plan.backtrack
  )
}

function expectPresentationError(callback, code) {
  let error
  try {
    callback()
  } catch (caught) {
    error = caught
  }

  expect(error).toBeInstanceOf(BacktrackPresentationValidationError)
  expect(isBacktrackPresentationError(error)).toBe(true)
  expect(error.code).toBe(code)
  return error
}

describe('backtrack canonical presentation adapter', () => {
  it.each([
    [30, 4],
    [31, 3],
    [50, 3],
    [51, 2],
    [70, 2],
    [71, 1],
    [99, 1],
    [100, 0],
  ])('uses standard single boundary %i exactly', (finalEncroachment, bucket) => {
    const presentation = createBacktrackPresentation(
      createResultsFromPoint(finalEncroachment),
      { encroachment: 100, value: 0, dlois: 'なし' }
    )

    const expected = Array(5).fill(0)
    expected[bucket] = 100
    expect(presentation.charts.single.probabilities).toEqual(expected)
    expect(presentation.charts.double.probabilities).toEqual(
      finalEncroachment >= 100 ? [100, 0] : [0, 100]
    )
    expect(presentation.charts.second.probabilities).toEqual(
      finalEncroachment >= 100 ? [100, 0] : [0, 100]
    )
  })

  it.each([
    [30, 5],
    [31, 4],
    [50, 4],
    [51, 3],
    [70, 3],
    [71, 2],
    [99, 2],
    [100, 1],
    [119, 1],
    [120, 0],
  ])('uses nightmare single boundary %i exactly', (finalEncroachment, bucket) => {
    const presentation = createBacktrackPresentation(
      createResultsFromPoint(finalEncroachment),
      { encroachment: 100, value: 0, dlois: '不死者・悪夢' }
    )

    const expected = Array(6).fill(0)
    expected[bucket] = 100
    expect(presentation.charts.single.probabilities).toEqual(expected)
  })

  it.each([
    ['なし', 99, [0, 100]],
    ['なし', 100, [100, 0]],
    ['不死者・悪夢', 119, [0, 100]],
    ['不死者・悪夢', 120, [100, 0]],
  ])('uses the %s success boundary at %i', (dlois, finalEncroachment, expected) => {
    const presentation = createBacktrackPresentation(
      createResultsFromPoint(finalEncroachment),
      { encroachment: 100, value: 0, dlois }
    )

    expect(presentation.charts.double.probabilities).toEqual(expected)
    expect(presentation.charts.second.probabilities).toEqual(expected)
  })

  it('walks signed coordinates and keeps negative final encroachment in the lowest category', () => {
    const result = createResultFromEntries([
      [-7, 0.25],
      [30, 0.25],
      [31, 0.25],
      [100, 0.25],
    ])
    const presentation = createBacktrackPresentation(
      createResult(result),
      { encroachment: 100, value: 0, dlois: 'なし' }
    )

    expect(presentation.charts.single.probabilities).toEqual([
      25,
      0,
      0,
      25,
      50,
    ])
    expect(presentation.charts.double.probabilities).toEqual([25, 75])
    expect(presentation.charts.second.probabilities).toEqual([25, 75])
    expect(presentation.charts.single.probabilities.some((value) =>
      Object.is(value, -0)
    )).toBe(false)
  })

  it('rounds only after category aggregation', () => {
    const result = createResultFromEntries([
      [-1, 0.0006],
      [0, 0.0006],
      [100, 0.9988],
    ])
    const presentation = createBacktrackPresentation(
      createResult(result),
      { encroachment: 100, value: 0, dlois: 'なし' }
    )

    expect(presentation.charts.single.probabilities).toEqual([
      99.9,
      0,
      0,
      0,
      0.1,
    ])
  })

  it('supports zero-dice producer output and preserves chart presentation metadata', () => {
    const params = {
      encroachment: 100,
      lois: 0,
      elois: 0,
      dice: 0,
      value: 0,
      dlois: 'なし',
    }
    const presentation = createBacktrackPresentation(
      createFromProducer(params),
      params
    )

    expect(presentation).toMatchObject({
      kind: 'backtrack-canonical-presentation',
      version: 2,
    })
    expect(Object.isFrozen(presentation)).toBe(true)
    expect(Object.isFrozen(presentation.charts)).toBe(true)
    expect(Object.keys(presentation.charts)).toEqual(RESULT_KEYS)
    for (const chart of Object.values(presentation.charts)) {
      expect(Object.isFrozen(chart)).toBe(true)
      expect(Object.isFrozen(chart.labels)).toBe(true)
      expect(Object.isFrozen(chart.probabilities)).toBe(true)
      expect(Object.isFrozen(chart.backgroundColors)).toBe(true)
    }
    expect(presentation.charts.single).toMatchObject({
      key: 'single',
      labels: ['100%〜', '71〜99%', '51〜70%', '31〜50%', '0〜30%'],
      probabilities: [100, 0, 0, 0, 0],
      backgroundColors: ['#EC1D2C', '#FE6F2F', '#F9A829', '#FAD23C', '#5EBB68'],
      title: '一倍振り',
      accessibleName: '最終侵蝕率分布 一倍振り',
    })
    expect(presentation.charts.double).toMatchObject({
      key: 'double',
      labels: ['失敗', '成功'],
      probabilities: [100, 0],
      backgroundColors: ['#EC1D2C', '#5EBB68'],
      title: '二倍振り',
      accessibleName: '最終侵蝕率分布 二倍振り',
    })
    expect(presentation.charts.second).toMatchObject({
      key: 'second',
      labels: ['失敗', '成功'],
      probabilities: [100, 0],
      backgroundColors: ['#EC1D2C', '#5EBB68'],
      title: '二倍振り+追加振り',
      accessibleName: '最終侵蝕率分布 二倍振りと追加振り',
    })

  })

  it('provides nightmare chart metadata without a visual title', () => {
    const presentation = createBacktrackPresentation(
      createResultsFromPoint(120),
      { encroachment: 120, value: 0, dlois: '不死者・悪夢' }
    )
    const chart = presentation.charts.single

    expect(chart.labels).toEqual([
      '120%～',
      '100〜119%',
      '71〜99%',
      '51〜70%',
      '31〜50%',
      '0〜30%',
    ])
    expect(chart.backgroundColors).toEqual([
      '#EC1D2C',
      '#ED551B',
      '#FE6F2F',
      '#F9A829',
      '#FAD23C',
      '#5EBB68',
    ])
    expect(chart).not.toHaveProperty('title')
    expect(chart.accessibleName).toBe('最終侵蝕率分布 一倍振り（屍人・悪夢）')
  })

  it('rejects missing result keys as a typed presentation error', () => {
    const result = createPointResult(50)
    delete result.second

    expectPresentationError(
      () => createBacktrackPresentation(
        result,
        { dlois: 'なし' }
      ),
      BACKTRACK_PRESENTATION_ERROR_CODES.MISSING_RESULT
    )
  })

  it('rejects invalid DistributionResult values as a typed presentation error', () => {
    const result = {
      ...createResultsFromPoint(50),
      double: null,
    }

    expectPresentationError(
      () => createBacktrackPresentation(result, { dlois: 'なし' }),
      BACKTRACK_PRESENTATION_ERROR_CODES.INVALID_RESULT
    )
  })

  it('rejects infinite support instead of estimating a chart category', () => {
    const infinite = createDistributionResult({
      values: [1],
      offset: -5,
      support: { kind: 'infinite' },
      overflow: null,
    })

    expectPresentationError(
      () => createBacktrackPresentation(
        createResult(infinite),
        { dlois: 'なし' }
      ),
      BACKTRACK_PRESENTATION_ERROR_CODES.INCOMPLETE_SUPPORT
    )
  })

  it('rejects a non-null overflow even when the DistributionResult is valid', () => {
    const overflow = createDistributionResult({
      values: [0.5],
      offset: 0,
      support: { kind: 'finite', max: 1 },
      overflow: {
        kind: 'exact',
        lowerBound: 1,
        probability: 0.5,
        errorBound: 0,
      },
    })

    expectPresentationError(
      () => createBacktrackPresentation(
        createResult(overflow),
        { dlois: 'なし' }
      ),
      BACKTRACK_PRESENTATION_ERROR_CODES.UNSUPPORTED_OVERFLOW
    )
  })

  it('rejects finite support that extends beyond explicit coverage', () => {
    const incomplete = createDistributionResult({
      values: [1],
      offset: -1,
      support: { kind: 'finite', max: 1 },
      overflow: null,
    })

    expectPresentationError(
      () => createBacktrackPresentation(
        createResult(incomplete),
        { dlois: 'なし' }
      ),
      BACKTRACK_PRESENTATION_ERROR_CODES.INCOMPLETE_SUPPORT
    )
  })
})
