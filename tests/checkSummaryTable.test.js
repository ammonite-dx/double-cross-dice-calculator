import { describe, expect, it } from 'vitest'

import { calculateDxDistribution } from '../src/calculation/DxCalculator'
import {
  calculateScore,
  getScoreStatistics,
} from '../src/calculation/ScoreCalculator'
import { planCalculationRanges } from '../src/calculation/RangePlanner'
import {
  SUMMARY_UNAVAILABLE,
  formatCertifiedExpectedValue,
  formatScoreStatisticsExpectedValue,
  formatCertifiedProbabilityPercent,
  formatCertifiedProbabilityPercentDisplay,
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

function getSummary(params, difficulty) {
  const plan = planCalculationRanges({
    operation: 'score',
    score: params,
  }).scores[0]
  const envelope = calculateScore(
    params,
    {
      getDxDistribution: (shihai, dice, critical, options, yousei = 0) =>
        calculateDxDistribution({ dice, critical, shihai, yousei }, options),
    },
    plan
  )
  return getScoreStatistics({
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
      SUMMARY_UNAVAILABLE,
    ],
    [
      'lower-bound tail',
      { kind: 'lower-bound', lowerBound: 6 },
      SUMMARY_UNAVAILABLE,
    ],
    [
      'unavailable summary',
      { kind: 'unavailable' },
      SUMMARY_UNAVAILABLE,
    ],
    [
      'non-finite exact value',
      { kind: 'exact', value: Number.NaN },
      SUMMARY_UNAVAILABLE,
    ],
    [
      'non-finite bounded value',
      { kind: 'bounded', lowerBound: 1, upperBound: Number.POSITIVE_INFINITY },
      SUMMARY_UNAVAILABLE,
    ],
    [
      'reversed bounded value',
      { kind: 'bounded', lowerBound: 2, upperBound: 1 },
      SUMMARY_UNAVAILABLE,
    ],
  ])('formats %s expected values without pointifying uncertainty', (
    _label,
    expectedValue,
    formatted
  ) => {
    expect(formatScoreStatisticsExpectedValue(expectedValue))
      .toBe(formatted)
  })

  it('uses one shared formatter for score and damage summaries', () => {
    const expectedValue = {
      kind: 'bounded',
      lowerBound: 6.011,
      upperBound: 6.012,
    }
    expect(formatCertifiedExpectedValue(expectedValue)).toBe(6)
    expect(formatScoreStatisticsExpectedValue(expectedValue))
      .toBe(formatCertifiedExpectedValue(expectedValue))
  })

  it('formats opposed and non-opposed success rates with a suffix only when numeric', () => {
    expect(formatCertifiedProbabilityPercentDisplay({
      kind: 'exact',
      value: 0.455,
    })).toBe('45.5%')
    expect(formatCertifiedProbabilityPercent({
      kind: 'exact',
      value: 0.545,
    })).toBe(54.5)
    expect(formatCertifiedProbabilityPercentDisplay({
      kind: 'bounded',
      lowerBound: 0.454545,
      upperBound: 0.454546,
    })).toBe('45.5%')
    expect(formatCertifiedProbabilityPercentDisplay({
      kind: 'bounded',
      lowerBound: 0.4504,
      upperBound: 0.4506,
    })).toBe(SUMMARY_UNAVAILABLE)
    expect(formatCertifiedProbabilityPercentDisplay({
      kind: 'lower-bound',
      lowerBound: 45,
    })).toBe(SUMMARY_UNAVAILABLE)
    expect(formatCertifiedProbabilityPercentDisplay(0.455))
      .toBe(SUMMARY_UNAVAILABLE)
  })

  it.each([
    {
      label: 'ordinary opposed',
      params: scoreParams(),
      difficulty: { opposed: true, target: 0 },
      expectedValueKind: 'bounded',
      successProbabilityKind: 'bounded',
    },
    {
      label: 'non-opposed dice zero critical eleven',
      params: scoreParams({ dice: 0, critical: 11 }),
      difficulty: { opposed: false, target: 0 },
      expectedValueKind: 'exact',
      successProbabilityKind: 'exact',
    },
    {
      label: 'critical eleven',
      params: scoreParams({ dice: 1, critical: 11 }),
      difficulty: { opposed: true, target: 0 },
      expectedValueKind: 'exact',
      successProbabilityKind: 'exact',
    },
    {
      label: 'critical two dice ninety-nine tail',
      params: scoreParams({ dice: 99, critical: 2 }),
      difficulty: { opposed: true, target: 0 },
      expectedValueKind: 'bounded',
      successProbabilityKind: 'bounded',
    },
    {
      label: 'negative skill tail',
      params: scoreParams({ skill: -1 }),
      difficulty: { opposed: true, target: 0 },
      expectedValueKind: 'lower-bound',
      successProbabilityKind: 'bounded',
    },
    {
      label: 'positive skill',
      params: scoreParams({ skill: 7 }),
      difficulty: { opposed: true, target: 0 },
      expectedValueKind: 'bounded',
      successProbabilityKind: 'bounded',
    },
    {
      label: 'yousei tail',
      params: scoreParams({ yousei: 1 }),
      difficulty: { opposed: true, target: 0 },
      expectedValueKind: 'lower-bound',
      successProbabilityKind: 'bounded',
    },
    {
      label: 'shihai tail',
      params: scoreParams({ dice: 2, critical: 2, shihai: 1 }),
      difficulty: { opposed: true, target: 0 },
      expectedValueKind: 'lower-bound',
      successProbabilityKind: 'bounded',
    },
  ])('keeps $label in the typed canonical summary contract', ({
    params,
    difficulty,
    expectedValueKind,
    successProbabilityKind,
  }) => {
    const summary = getSummary(params, difficulty)

    expect(summary.action.expectedValue.kind).toBe(expectedValueKind)
    expect(summary.action.successProbability.kind).toBe(successProbabilityKind)
    expect(summary.reaction.expectedValue.kind).toBe(expectedValueKind)
    expect(summary.reaction.successProbability.kind).toBe(successProbabilityKind)

    const expectedValue = formatScoreStatisticsExpectedValue(
      summary.action.expectedValue
    )
    const successProbability = formatCertifiedProbabilityPercentDisplay(
      summary.action.successProbability
    )
    expect(expectedValue).not.toBeUndefined()
    expect(successProbability).not.toBeUndefined()
    if (expectedValueKind === 'lower-bound') {
      expect(expectedValue).toBe(SUMMARY_UNAVAILABLE)
    }
  })
})
