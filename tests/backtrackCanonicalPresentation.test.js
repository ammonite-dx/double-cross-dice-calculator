import { describe, expect, it } from 'vitest'

import {
  calculateFinalEncroachmentCanonical,
} from '../src/calculation/BacktrackCalculator'
import { createDistributionResult } from '../src/calculation/DistributionResult'
import { getFinalEncroachment } from '../src/data/BacktrackCalculator'
import {
  registerD10Asset,
  registerLivingdeadAsset,
} from '../src/data/PrecomputedDataRepository'
import { planCalculationRanges } from '../src/calculation/RangePlanner'
import {
  BACKTRACK_CANONICAL_PRESENTATION_ERROR_CODES,
  BacktrackCanonicalPresentationValidationError,
  createBacktrackCanonicalPresentation,
  isBacktrackCanonicalPresentationError,
} from '../src/presentation/BacktrackCanonicalPresentation'
import {
  getFinalEncroachmentChartData,
} from '../src/components/Backtrack/ChartSetter'
import d10 from '../public/data/schema-v2/revision-1/d10.json'
import livingdead from '../public/data/schema-v2/revision-1/livingdead.json'

registerD10Asset(d10)
registerLivingdeadAsset(livingdead)

const RESULT_KEYS = ['single', 'double', 'second']
const BACKTRACK_DLOIS_VALUES = [
  'なし',
  '戦闘用人格・生きる伝説',
  '生還者',
  '不死者・悪夢',
  '屍人',
  '戦友(通常)',
  '戦友(強化)',
]

function createPointResult(finalEncroachment) {
  return createDistributionResult({
    values: [1],
    offset: finalEncroachment,
    support: { kind: 'finite', max: finalEncroachment },
    overflow: null,
  })
}

function createCanonicalPointResult(finalEncroachment) {
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

function createCanonicalResult(result) {
  return {
    single: result,
    double: result,
    second: result,
  }
}

function createCanonicalFromProducer(params) {
  const plan = planCalculationRanges({
    operation: 'backtrack',
    canonicalBacktrack: true,
    backtrack: params,
  })
  return calculateFinalEncroachmentCanonical(
    params,
    {},
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

  expect(error).toBeInstanceOf(BacktrackCanonicalPresentationValidationError)
  expect(isBacktrackCanonicalPresentationError(error)).toBe(true)
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
    const presentation = createBacktrackCanonicalPresentation(
      createCanonicalPointResult(finalEncroachment),
      { encroachment: 100, value: 0, dlois: 'なし' }
    )

    const expected = Array(5).fill(0)
    expected[bucket] = 100
    expect(presentation.finalEncroachment.single).toEqual(expected)
    expect(presentation.finalEncroachment.double).toEqual(
      finalEncroachment >= 100 ? [100, 0] : [0, 100]
    )
    expect(presentation.finalEncroachment.second).toEqual(
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
    const presentation = createBacktrackCanonicalPresentation(
      createCanonicalPointResult(finalEncroachment),
      { encroachment: 100, value: 0, dlois: '不死者・悪夢' }
    )

    const expected = Array(6).fill(0)
    expected[bucket] = 100
    expect(presentation.finalEncroachment.single).toEqual(expected)
  })

  it.each([
    ['なし', 99, [0, 100]],
    ['なし', 100, [100, 0]],
    ['不死者・悪夢', 119, [0, 100]],
    ['不死者・悪夢', 120, [100, 0]],
  ])('uses the %s success boundary at %i', (dlois, finalEncroachment, expected) => {
    const presentation = createBacktrackCanonicalPresentation(
      createCanonicalPointResult(finalEncroachment),
      { encroachment: 100, value: 0, dlois }
    )

    expect(presentation.finalEncroachment.double).toEqual(expected)
    expect(presentation.finalEncroachment.second).toEqual(expected)
  })

  it('walks signed coordinates and keeps negative final encroachment in the lowest category', () => {
    const result = createResultFromEntries([
      [-7, 0.25],
      [30, 0.25],
      [31, 0.25],
      [100, 0.25],
    ])
    const presentation = createBacktrackCanonicalPresentation(
      createCanonicalResult(result),
      { encroachment: 100, value: 0, dlois: 'なし' }
    )

    expect(presentation.finalEncroachment.single).toEqual([
      25,
      0,
      0,
      25,
      50,
    ])
    expect(presentation.finalEncroachment.double).toEqual([25, 75])
    expect(presentation.finalEncroachment.second).toEqual([25, 75])
    expect(presentation.finalEncroachment.single.some((value) =>
      Object.is(value, -0)
    )).toBe(false)
  })

  it('rounds only after category aggregation', () => {
    const result = createResultFromEntries([
      [-1, 0.0006],
      [0, 0.0006],
      [100, 0.9988],
    ])
    const presentation = createBacktrackCanonicalPresentation(
      createCanonicalResult(result),
      { encroachment: 100, value: 0, dlois: 'なし' }
    )

    expect(presentation.finalEncroachment.single).toEqual([
      99.9,
      0,
      0,
      0,
      0.1,
    ])
  })

  it.each(BACKTRACK_DLOIS_VALUES)(
    'matches legacy 0.1%% categories for every D-lois rule: %s',
    (dlois) => {
      const params = {
        encroachment: 100,
        lois: 0,
        elois: 0,
        dice: 0,
        value: 0,
        dlois,
      }
      const canonical = createCanonicalFromProducer(params)
      const presentation = createBacktrackCanonicalPresentation(
        canonical,
        params
      )

      // The adapter rounds only after aggregation, matching the legacy
      // ChartSetter payload. This fixture keeps the sparse asset differences
      // away from a displayed 0.1% boundary while exercising every rule.
      expect(presentation.finalEncroachment).toEqual(
        getFinalEncroachment(params)
      )
    }
  )

  it('matches the rounded legacy categories from an on-demand d10[7] result', () => {
    const params = {
      encroachment: 100,
      lois: 0,
      elois: 0,
      dice: 7,
      value: 0,
      dlois: 'なし',
    }
    const canonical = createCanonicalFromProducer(params)
    const presentation = createBacktrackCanonicalPresentation(canonical, params)

    // d10[7] in the legacy sparse asset omits a tiny endpoint mass. The
    // comparison intentionally checks the existing 0.1% display contract.
    expect(presentation.finalEncroachment).toEqual(
      getFinalEncroachment(params)
    )
  })

  it('supports zero-dice producer output and preserves ChartSetter payload shape', () => {
    const params = {
      encroachment: 100,
      lois: 0,
      elois: 0,
      dice: 0,
      value: 0,
      dlois: 'なし',
    }
    const presentation = createBacktrackCanonicalPresentation(
      createCanonicalFromProducer(params),
      params
    )

    expect(presentation).toMatchObject({
      kind: 'backtrack-canonical-presentation',
      version: 1,
    })
    expect(Object.isFrozen(presentation)).toBe(true)
    expect(Object.isFrozen(presentation.finalEncroachment)).toBe(true)
    expect(Object.keys(presentation.finalEncroachment)).toEqual(RESULT_KEYS)
    expect(presentation.finalEncroachment).toEqual({
      single: [100, 0, 0, 0, 0],
      double: [100, 0],
      second: [100, 0],
    })

    const standardChart = getFinalEncroachmentChartData(
      presentation.finalEncroachment,
      'single'
    )
    const doubleChart = getFinalEncroachmentChartData(
      presentation.finalEncroachment,
      'double'
    )
    expect(standardChart.labels).toEqual([
      '100%〜',
      '71〜99%',
      '51〜70%',
      '31〜50%',
      '0〜30%',
    ])
    expect(standardChart.datasets[0].data)
      .toBe(presentation.finalEncroachment.single)
    expect(doubleChart.labels).toEqual(['失敗', '成功'])
    expect(doubleChart.datasets[0].data)
      .toBe(presentation.finalEncroachment.double)
  })

  it('uses the undead ChartSetter mode for the six-category payload', () => {
    const presentation = createBacktrackCanonicalPresentation(
      createCanonicalPointResult(120),
      { encroachment: 120, value: 0, dlois: '不死者・悪夢' }
    )
    const chart = getFinalEncroachmentChartData(
      presentation.finalEncroachment,
      'undead'
    )

    expect(chart.labels).toEqual([
      '120%～',
      '100〜119%',
      '71〜99%',
      '51〜70%',
      '31〜50%',
      '0〜30%',
    ])
    expect(chart.datasets[0].data)
      .toBe(presentation.finalEncroachment.single)
  })

  it('rejects missing result keys as a typed presentation error', () => {
    const result = createCanonicalPointResult(50)
    delete result.second

    expectPresentationError(
      () => createBacktrackCanonicalPresentation(
        result,
        { dlois: 'なし' }
      ),
      BACKTRACK_CANONICAL_PRESENTATION_ERROR_CODES.MISSING_RESULT
    )
  })

  it('rejects invalid DistributionResult values as a typed presentation error', () => {
    const result = createCanonicalPointResult(50)
    result.double = null

    expectPresentationError(
      () => createBacktrackCanonicalPresentation(result, { dlois: 'なし' }),
      BACKTRACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_RESULT
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
      () => createBacktrackCanonicalPresentation(
        createCanonicalResult(infinite),
        { dlois: 'なし' }
      ),
      BACKTRACK_CANONICAL_PRESENTATION_ERROR_CODES.INCOMPLETE_SUPPORT
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
      () => createBacktrackCanonicalPresentation(
        createCanonicalResult(overflow),
        { dlois: 'なし' }
      ),
      BACKTRACK_CANONICAL_PRESENTATION_ERROR_CODES.UNSUPPORTED_OVERFLOW
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
      () => createBacktrackCanonicalPresentation(
        createCanonicalResult(incomplete),
        { dlois: 'なし' }
      ),
      BACKTRACK_CANONICAL_PRESENTATION_ERROR_CODES.INCOMPLETE_SUPPORT
    )
  })
})
