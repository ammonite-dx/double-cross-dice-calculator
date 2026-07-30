import { describe, expect, it } from 'vitest'

import { getFinalEncroachment } from '../src/data/BacktrackCalculator'
import {
  getDamage,
} from '../src/data/DamageCalculator'
import {
  OUTPUT_DISTRIBUTION_SIZE,
  getUpperTailProbability,
} from '../src/data/Distribution'
import {
  registerD10Asset,
  registerDrAsset,
  registerLivingdeadAsset,
} from '../src/data/PrecomputedDataRepository'
import {
  calculateScore,
  getScoreSummary,
} from '../src/data/ScoreCalculator'
import d10 from '../public/data/schema-v2/revision-1/d10.json'
import drKazanari0 from '../public/data/schema-v2/revision-1/dr/kazanari-0.json'
import livingdead from '../public/data/schema-v2/revision-1/livingdead.json'

registerD10Asset(d10)
registerDrAsset(drKazanari0)
registerLivingdeadAsset(livingdead)

const SCORE_PARAMS = {
  dice: 1,
  critical: 10,
  skill: 0,
  yousei: 0,
  shihai: 0,
}

function pointDistribution(value, size = OUTPUT_DISTRIBUTION_SIZE) {
  const distribution = Array(size).fill(0)
  distribution[value] = 1
  return distribution
}

function probabilityResult(distribution, failureProbability = 0) {
  return {
    distribution,
    upperTailProbability: getUpperTailProbability(distribution),
    failureProbability,
  }
}

function fixedScore(value) {
  return probabilityResult(pointDistribution(value))
}

function sparseDistribution(entries) {
  const first = Math.min(...entries.map(([value]) => value))
  const last = Math.max(...entries.map(([value]) => value))
  const values = Array(last - first + 1).fill(0)

  for (const [value, probability] of entries) {
    values[value - first] = probability
  }

  return { offset: first, values }
}

function expectDistributionClose(actual, expected, tolerance = 1e-10) {
  expect(actual).toHaveLength(expected.length)
  for (let value = 0; value < expected.length; value += 1) {
    expect(Math.abs(actual[value] - expected[value])).toBeLessThanOrEqual(
      tolerance
    )
  }
}

function independentD10Sum(dice) {
  let distribution = [1]

  for (let count = 0; count < dice; count += 1) {
    const next = Array(distribution.length + 10).fill(0)
    for (let total = 0; total < distribution.length; total += 1) {
      for (let roll = 1; roll <= 10; roll += 1) {
        next[total + roll] += distribution[total] / 10
      }
    }
    distribution = next
  }

  return distribution
}

function independentLivingdead(dice) {
  if (dice === 0) {
    return [1]
  }

  const distribution = Array(10 * dice + 1).fill(0)
  const rolls = Array(dice).fill(1)
  const visit = (index) => {
    if (index === dice) {
      const total = rolls.reduce((sum, roll) => sum + roll, 0)
      const result = total - Math.max(...rolls) + 1
      distribution[result] += 10 ** -dice
      return
    }

    for (let roll = 1; roll <= 10; roll += 1) {
      rolls[index] = roll
      visit(index + 1)
    }
  }

  visit(0)
  return distribution
}

function toPercentage(probability) {
  return Math.round(probability * 1000) / 10
}

function categorizeSingle(distribution, params, nightmare) {
  const probabilities = Array(nightmare ? 6 : 5).fill(0)

  for (let reduction = 0; reduction < distribution.length; reduction += 1) {
    const finalEncroachment =
      params.encroachment - params.value - reduction
    let category

    if (nightmare) {
      if (finalEncroachment >= 120) category = 0
      else if (finalEncroachment >= 100) category = 1
      else if (finalEncroachment >= 71) category = 2
      else if (finalEncroachment >= 51) category = 3
      else if (finalEncroachment >= 31) category = 4
      else category = 5
    } else {
      if (finalEncroachment >= 100) category = 0
      else if (finalEncroachment >= 71) category = 1
      else if (finalEncroachment >= 51) category = 2
      else if (finalEncroachment >= 31) category = 3
      else category = 4
    }

    probabilities[category] += distribution[reduction]
  }

  return probabilities.map(toPercentage)
}

function categorizeBinary(distribution, params, nightmare) {
  const threshold = nightmare ? 119 : 99
  let failureProbability = 0

  for (let reduction = 0; reduction < distribution.length; reduction += 1) {
    if (params.encroachment - params.value - reduction > threshold) {
      failureProbability += distribution[reduction]
    }
  }

  return [
    toPercentage(failureProbability),
    toPercentage(1 - failureProbability),
  ]
}

const BACKTRACK_RULES = [
  ['なし', { diceModifier: 0 }],
  ['戦闘用人格・生きる伝説', { diceModifier: -1 }],
  ['生還者', { diceModifier: 3 }],
  ['不死者・悪夢', { diceModifier: 0, nightmare: true }],
  ['屍人', { diceModifier: 0, livingdead: true }],
  ['戦友(通常)', { diceModifier: 2 }],
  ['戦友(強化)', { diceModifier: 4 }],
]

function independentBacktrack(params, rule) {
  const getDistribution = rule.livingdead
    ? independentLivingdead
    : independentD10Sum
  const diceCount = (multiplier) =>
    Math.max(
      0,
      params.lois * multiplier +
        params.elois +
        params.dice +
        rule.diceModifier
    )
  const single = getDistribution(diceCount(1))
  const double = getDistribution(diceCount(2))
  const second = getDistribution(diceCount(3))

  return {
    single: categorizeSingle(single, params, rule.nightmare),
    double: categorizeBinary(double, params, rule.nightmare),
    second: categorizeBinary(second, params, rule.nightmare),
  }
}

describe('runtime score rules', () => {
  it('does not apply the skill value to automatic failure or fumble', () => {
    const distribution = sparseDistribution([
      [0, 0.25],
      [1, 0.25],
      [2, 0.5],
    ])
    const result = calculateScore(
      { ...SCORE_PARAMS, skill: 5 },
      () => distribution
    )

    expect(result.distribution[0]).toBe(0.5)
    expect(result.distribution[7]).toBe(0.5)
    expect(result.failureProbability).toBe(0.5)
  })

  it('retains a non-fumble score clamped to zero as a successful result', () => {
    const result = calculateScore(
      { ...SCORE_PARAMS, skill: -3 },
      () => sparseDistribution([[2, 1]])
    )
    const summary = getScoreSummary(
      { action: result },
      { opposed: false, target: 0 }
    )

    expect(result.distribution[0]).toBe(1)
    expect(result.failureProbability).toBe(0)
    expect(summary.action.successRate).toBe(100)
  })

  it('excludes automatic failure and fumble from difficulty zero success', () => {
    const result = calculateScore(
      SCORE_PARAMS,
      () => sparseDistribution([
        [0, 0.2],
        [1, 0.3],
        [2, 0.5],
      ])
    )
    const summary = getScoreSummary(
      { action: result },
      { opposed: false, target: 0 }
    )

    expect(result.distribution[0]).toBe(0.5)
    expect(result.distribution[2]).toBe(0.5)
    expect(result.failureProbability).toBe(0.5)
    expect(summary.action.successRate).toBe(50)
  })

  it('keeps zero dice as automatic failure when yousei is specified', () => {
    const getDistribution = (shihai, dice) =>
      dice === 0
        ? sparseDistribution([[0, 1]])
        : sparseDistribution([[3, 1]])
    const result = calculateScore(
      { ...SCORE_PARAMS, dice: 0, skill: 999, yousei: 9 },
      getDistribution
    )

    expect(result.distribution[0]).toBe(1)
    expect(result.failureProbability).toBe(1)
  })

  it('applies each yousei use by rounding up and adding one die', () => {
    const getDistribution = (shihai, dice) =>
      dice === 1 && shihai === 0
        ? sparseDistribution([[3, 1]])
        : sparseDistribution([[5, 1]])
    const result = calculateScore(
      { ...SCORE_PARAMS, dice: 4, yousei: 2 },
      getDistribution
    )

    expect(result.distribution[23]).toBeCloseTo(1, 10)
  })

  it('awards opposed ties to the reaction side', () => {
    const action = probabilityResult(
      sparseDistribution([
        [0, 0.1],
        [5, 0.4],
        [10, 0.5],
      ]).values.concat(Array(1013).fill(0))
    )
    const reaction = probabilityResult(
      sparseDistribution([
        [0, 0.2],
        [5, 0.3],
        [10, 0.5],
      ]).values.concat(Array(1013).fill(0))
    )
    const summary = getScoreSummary({ action, reaction })

    expect(summary.action.successRate).toBe(33)
    expect(summary.reaction.successRate).toBe(67)
  })
})

describe('runtime damage rules', () => {
  it('uses floor(score / 10) + 1 damage dice after a hit', () => {
    const oneDieDamage = getDamage(
      { action: fixedScore(9), reaction: fixedScore(0) },
      { dice: 0, value: 0, kazanari: 0 },
      { dice: 0, value: 0 }
    )
    const twoDiceDamage = getDamage(
      { action: fixedScore(10), reaction: fixedScore(0) },
      { dice: 0, value: 0, kazanari: 0 },
      { dice: 0, value: 0 }
    )
    const expectedOneDie = Array(OUTPUT_DISTRIBUTION_SIZE).fill(0)
    const expectedTwoDice = Array(OUTPUT_DISTRIBUTION_SIZE).fill(0)
    independentD10Sum(1).forEach((probability, value) => {
      expectedOneDie[value] = probability
    })
    independentD10Sum(2).forEach((probability, value) => {
      expectedTwoDice[value] = probability
    })

    expectDistributionClose(oneDieDamage.distribution, expectedOneDie)
    expectDistributionClose(twoDiceDamage.distribution, expectedTwoDice)
  })

  it('deals zero damage when the reaction ties the action', () => {
    const damage = getDamage(
      { action: fixedScore(10), reaction: fixedScore(10) },
      { dice: 0, value: 999, kazanari: 0 },
      { dice: 0, value: -999 }
    )

    expect(damage.distribution[0]).toBe(1)
  })

  it('subtracts dice reduction after adding a positive fixed value', () => {
    const damage = getDamage(
      { action: fixedScore(1), reaction: fixedScore(0) },
      { dice: 0, value: 5, kazanari: 0 },
      { dice: 1, value: 0 }
    )

    expect(damage.distribution[0]).toBeCloseTo(0.15, 10)
  })
})

describe('runtime backtrack rules', () => {
  it.each(BACKTRACK_RULES)(
    'matches independent enumeration for %s',
    (dlois, rule) => {
      const params = {
        encroachment: rule.nightmare ? 122 : 102,
        lois: 1,
        elois: 0,
        dice: 0,
        value: 0,
        dlois,
      }

      expect(getFinalEncroachment(params)).toEqual(
        independentBacktrack(params, rule)
      )
    }
  )
})
