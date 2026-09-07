import { describe, expect, it } from 'vitest'

import { calculateDxDistribution } from '../src/calculation/DxCalculator'
import {
  calculateScore,
  getScoreStatistics,
} from '../src/calculation/ScoreCalculator'
import { planCalculationRanges } from '../src/calculation/RangePlanner'

function calculateScoreEnvelope(params) {
  const plan = planCalculationRanges({
    operation: 'score',
    score: params,
  }).scores[0]
  return calculateScore(params, {
    getDxDistribution: (shihai, dice, critical, options, yousei = 0) =>
      calculateDxDistribution({ dice, critical, shihai, yousei }, options),
  }, plan)
}

function oneDieCriticalTenFixedDifficultyOracle(target) {
  if (target <= 1) {
    return 0.9
  }
  if (target <= 9) {
    return (10 - target) / 10 + 0.1
  }
  return 0.1
}

function maxDieOracle(dice, target) {
  let success = 0
  let total = 0
  const visit = (index, maximum) => {
    if (index === dice) {
      total += 1
      if (maximum >= target) {
        success += 1
      }
      return
    }
    for (let face = 1; face <= 10; face += 1) {
      visit(index + 1, Math.max(maximum, face))
    }
  }
  visit(0, 0)
  return success / total
}

function opposedMaxDieOracle(dice) {
  let actionWins = 0
  let reactionWins = 0
  let total = 0
  const visit = (actionIndex, actionMaximum, reactionIndex, reactionMaximum) => {
    if (actionIndex === dice && reactionIndex === dice) {
      total += 1
      if (actionMaximum > reactionMaximum) {
        actionWins += 1
      } else {
        reactionWins += 1
      }
      return
    }
    if (actionIndex < dice) {
      for (let face = 1; face <= 10; face += 1) {
        visit(
          actionIndex + 1,
          Math.max(actionMaximum, face),
          reactionIndex,
          reactionMaximum
        )
      }
      return
    }
    for (let face = 1; face <= 10; face += 1) {
      visit(
        actionIndex,
        actionMaximum,
        reactionIndex + 1,
        Math.max(reactionMaximum, face)
      )
    }
  }
  visit(0, 0, 0, 0)
  return {
    action: actionWins / total,
    reaction: reactionWins / total,
  }
}

describe('certified score statistics independent oracles', () => {
  it.each([0, 5, 10])(
    'contains the exact 1D10 critical=10 fixed-difficulty probability for target %s',
    (target) => {
      const params = {
        dice: 1,
        critical: 10,
        skill: 0,
        yousei: 0,
        shihai: 0,
      }
      const envelope = calculateScoreEnvelope(params)
      const statistics = getScoreStatistics(
        { action: envelope, reaction: envelope },
        { opposed: false, target }
      )
      const probability = statistics.action.successProbability
      const expected = oneDieCriticalTenFixedDifficultyOracle(target)

      expect(probability.kind).toBe('bounded')
      expect(probability.lowerBound).toBeLessThanOrEqual(expected + 1e-12)
      expect(probability.upperBound).toBeGreaterThanOrEqual(expected - 1e-12)
      expect(probability.upperBound - probability.lowerBound)
        .toBeLessThan(1e-6)
      expect(statistics.action.automaticFailureProbability.kind).toBe('exact')
      expect(statistics.action.automaticFailureProbability.value)
        .toBeCloseTo(0.1, 12)
    }
  )

  it('matches independent enumeration for finite 2D10 critical=11 statistics', () => {
    const params = {
      dice: 2,
      critical: 11,
      skill: 0,
      yousei: 0,
      shihai: 0,
    }
    const envelope = calculateScoreEnvelope(params)
    const statistics = getScoreStatistics(
      { action: envelope, reaction: envelope },
      { opposed: false, target: 5 }
    )

    expect(statistics.action.successProbability.kind).toBe('exact')
    expect(statistics.action.successProbability.value)
      .toBeCloseTo(maxDieOracle(2, 5), 12)
    expect(statistics.action.automaticFailureProbability.kind).toBe('exact')
    expect(statistics.action.automaticFailureProbability.value)
      .toBeCloseTo(0.01, 12)
  })

  it('matches independent finite opposed enumeration and assigns ties to reaction', () => {
    const params = {
      dice: 1,
      critical: 11,
      skill: 0,
      yousei: 0,
      shihai: 0,
    }
    const action = calculateScoreEnvelope(params)
    const reaction = calculateScoreEnvelope(params)
    const statistics = getScoreStatistics({ action, reaction })
    const expected = opposedMaxDieOracle(1)

    expect(statistics.action.successProbability.kind).toBe('exact')
    expect(statistics.action.successProbability.value)
      .toBeCloseTo(expected.action, 12)
    expect(statistics.reaction.successProbability.kind).toBe('exact')
    expect(statistics.reaction.successProbability.value)
      .toBeCloseTo(expected.reaction, 12)
    expect(statistics.action.automaticFailureProbability.kind).toBe('exact')
    expect(statistics.action.automaticFailureProbability.value)
      .toBeCloseTo(0.1, 12)
    expect(statistics.reaction.automaticFailureProbability.kind).toBe('exact')
    expect(statistics.reaction.automaticFailureProbability.value)
      .toBeCloseTo(0.1, 12)
  })
})
