import { describe, expect, it } from 'vitest'

import { calculateDxDistribution } from '../src/calculation/DxCalculator'
import {
  calculateScoreCanonical,
  getCanonicalScoreSummary,
} from '../src/calculation/ScoreCalculator'
import { planCalculationRanges } from '../src/calculation/RangePlanner'
import {
  CANONICAL_SUMMARY_UNAVAILABLE,
  formatCanonicalScoreSummaryExpectedValue,
  formatCanonicalScoreSuccessRate,
  formatCanonicalScoreSuccessRateDisplay,
} from '../src/shared/presentation'

function scoreParams(overrides = {}) {
  return {
    dice: 1,
    critical: 10,
    skill: 0,
    yousei: 0,
    shihai: 0,
    ...overrides,
  }
}

function getCanonicalSummary(params, difficulty) {
  const plan = planCalculationRanges({
    operation: 'score',
    score: params,
  }).scores[0]
  const envelope = calculateScoreCanonical(
    params,
    {
      getDxDistribution: (shihai, dice, critical, options, yousei = 0) =>
        calculateDxDistribution({ dice, critical, shihai, yousei }, options),
    },
    plan
  )
  return getCanonicalScoreSummary({
    action: envelope,
    reaction: envelope,
  }, difficulty)
}

describe('Check canonical summary formatter', () => {
  it.each([
    [
      'exact normal value',
      { kind: 'exact', value: 6.04 },
      6,
    ],
    [
      'exact critical-11 value',
      { kind: 'exact', value: 6.05 },
      6.1,
    ],
    [
      'bounded values with the same rounded bound',
      { kind: 'bounded', lowerBound: 6.011, upperBound: 6.012 },
      6,
    ],
    [
      'bounded values with different rounded bounds',
      { kind: 'bounded', lowerBound: 6.04, upperBound: 6.06 },
      CANONICAL_SUMMARY_UNAVAILABLE,
    ],
    [
      'lower-bound tail',
      { kind: 'lower-bound', lowerBound: 6 },
      CANONICAL_SUMMARY_UNAVAILABLE,
    ],
    [
      'unavailable summary',
      { kind: 'unavailable' },
      CANONICAL_SUMMARY_UNAVAILABLE,
    ],
  ])('formats %s expected values without pointifying uncertainty', (
    _label,
    expectedValue,
    formatted
  ) => {
    expect(formatCanonicalScoreSummaryExpectedValue(expectedValue))
      .toBe(formatted)
  })

  it('formats opposed and non-opposed success rates with a suffix only when numeric', () => {
    expect(formatCanonicalScoreSuccessRateDisplay({
      kind: 'exact',
      value: 45.5,
    })).toBe('45.5%')
    expect(formatCanonicalScoreSuccessRate({
      kind: 'exact',
      value: 54.5,
    })).toBe(54.5)
    expect(formatCanonicalScoreSuccessRateDisplay({
      kind: 'bounded',
      lowerBound: 45.4545,
      upperBound: 45.4546,
    })).toBe('45.5%')
    expect(formatCanonicalScoreSuccessRateDisplay({
      kind: 'bounded',
      lowerBound: 45.04,
      upperBound: 45.06,
    })).toBe(CANONICAL_SUMMARY_UNAVAILABLE)
    expect(formatCanonicalScoreSuccessRateDisplay({
      kind: 'lower-bound',
      lowerBound: 45,
    })).toBe(CANONICAL_SUMMARY_UNAVAILABLE)
    expect(formatCanonicalScoreSuccessRateDisplay(45.5))
      .toBe(CANONICAL_SUMMARY_UNAVAILABLE)
  })

  it.each([
    {
      label: 'ordinary opposed',
      params: scoreParams(),
      difficulty: { opposed: true, target: 0 },
      expectedValueKind: 'bounded',
      successRateKind: 'bounded',
    },
    {
      label: 'non-opposed dice zero critical eleven',
      params: scoreParams({ dice: 0, critical: 11 }),
      difficulty: { opposed: false, target: 0 },
      expectedValueKind: 'exact',
      successRateKind: 'exact',
    },
    {
      label: 'critical eleven',
      params: scoreParams({ dice: 1, critical: 11 }),
      difficulty: { opposed: true, target: 0 },
      expectedValueKind: 'exact',
      successRateKind: 'exact',
    },
    {
      label: 'critical two dice ninety-nine tail',
      params: scoreParams({ dice: 99, critical: 2 }),
      difficulty: { opposed: true, target: 0 },
      expectedValueKind: 'bounded',
      successRateKind: 'bounded',
    },
    {
      label: 'negative skill tail',
      params: scoreParams({ skill: -1 }),
      difficulty: { opposed: true, target: 0 },
      expectedValueKind: 'lower-bound',
      successRateKind: 'bounded',
    },
    {
      label: 'positive skill',
      params: scoreParams({ skill: 7 }),
      difficulty: { opposed: true, target: 0 },
      expectedValueKind: 'bounded',
      successRateKind: 'bounded',
    },
    {
      label: 'yousei tail',
      params: scoreParams({ yousei: 1 }),
      difficulty: { opposed: true, target: 0 },
      expectedValueKind: 'lower-bound',
      successRateKind: 'bounded',
    },
    {
      label: 'shihai tail',
      params: scoreParams({ dice: 2, critical: 2, shihai: 1 }),
      difficulty: { opposed: true, target: 0 },
      expectedValueKind: 'lower-bound',
      successRateKind: 'bounded',
    },
  ])('keeps $label in the typed canonical summary contract', ({
    params,
    difficulty,
    expectedValueKind,
    successRateKind,
  }) => {
    const summary = getCanonicalSummary(params, difficulty)

    expect(summary.action.expectedValue.kind).toBe(expectedValueKind)
    expect(summary.action.successRate.kind).toBe(successRateKind)
    expect(summary.reaction.expectedValue.kind).toBe(expectedValueKind)
    expect(summary.reaction.successRate.kind).toBe(successRateKind)

    const expectedValue = formatCanonicalScoreSummaryExpectedValue(
      summary.action.expectedValue
    )
    const successRate = formatCanonicalScoreSuccessRateDisplay(
      summary.action.successRate
    )
    expect(expectedValue).not.toBeUndefined()
    expect(successRate).not.toBeUndefined()
    if (expectedValueKind === 'lower-bound') {
      expect(expectedValue).toBe(CANONICAL_SUMMARY_UNAVAILABLE)
    }
  })
})
