import { describe, expect, it, vi } from 'vitest'

import {
  calculateFinalEncroachment,
} from '../src/calculation/BacktrackCalculator'
import {
  calculateDamageOnDemand,
} from '../src/calculation/DamageCalculator'
import {
  createDistributionResult,
} from '../src/calculation/DistributionResult'
import {
  calculateScore,
  getScoreSummary,
} from '../src/calculation/ScoreCalculator'
import {
  generateMixedDamageDistribution,
} from '../src/calculation/RuntimeDamageRollCalculator'
import { planCalculationRanges } from '../src/calculation/RangePlanner'
import {
  createBacktrackPresentation,
} from '../src/features/backtrack/model/BacktrackPresentation'

const SCORE_PARAMS = {
  dice: 1,
  critical: 10,
  skill: 0,
  yousei: 0,
  shihai: 0,
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

function ScoreEnvelope(entries, failureProbability = 0) {
  const maxValue = Math.max(...entries.map(([value]) => value))
  const values = new Float64Array(maxValue + 1)
  for (const [value, probability] of entries) {
    values[value] = probability
  }

  return {
    result: createDistributionResult({
      values,
      offset: 0,
      support: { kind: 'finite', max: maxValue },
      overflow: null,
    }),
    metadata: {
      modeledDistribution: true,
      failureProbability,
    },
  }
}

function fixedScore(value) {
  return ScoreEnvelope([[value, 1]])
}

function calculateRuleScore(params, getDxDistribution) {
  return calculateScore(
    params,
    { getDxDistribution }
  )
}

function independentD10Provider(dice, size) {
  const source = independentD10Sum(dice)
  const result = new Float64Array(size)
  for (let value = 0; value < source.length; value += 1) {
    if (value >= result.length) {
      throw new RangeError('D10 provider size is smaller than its support')
    }
    result[value] = source[value]
  }
  return result
}

function nextPowerOfTwo(value) {
  let result = 1
  while (result < value) {
    result *= 2
  }
  return result
}

function createRuleDamageRangePlan(score, attack, defence) {
  const maxScore = score.action.result.support.max
  const maxDamageDice = Math.floor(maxScore / 10) + 1 + attack.dice
  const rawSupportMax = maxDamageDice * 10
  const fixedDifference = attack.value - defence.value
  const workingMax = Math.max(
    0,
    rawSupportMax + Math.max(0, fixedDifference)
  )
  const workingLength = workingMax + 2
  const defenceMax = defence.dice * 10

  return {
    accepted: true,
    operation: 'attack',
    propagation: { score: 'full-tail' },
    scores: [
      { tail: { kind: 'dx-tail', bound: 0, modeledMax: maxScore } },
      { tail: { kind: 'dx-tail', bound: 0, modeledMax: score.reaction.result.support.max } },
    ],
    damage: {
      fixedDifference,
      maxDamageDice,
      rawSupportMax,
      rawMax: rawSupportMax,
      workingMax,
      workingLength,
      defenceMax,
      fftLength: nextPowerOfTwo(rawSupportMax + 1),
      defenceFftLength: defence.dice > 0
        ? nextPowerOfTwo(workingLength + defenceMax)
        : 0,
      scoreValueMode: 'full-tail',
    },
  }
}

async function calculateRuleDamage(score, attack, defence) {
  const rangePlan = createRuleDamageRangePlan(score, attack, defence)
  const canonical = await calculateDamageOnDemand(
    score,
    attack,
    defence,
    {
      getDamageRollDistribution: generateMixedDamageDistribution,
      getD10Distribution: independentD10Provider,
    },
    {},
    rangePlan
  )
  return canonical
}

function expectDistributionClose(actual, expected, tolerance = 1e-10) {
  expect(actual).toHaveLength(expected.length)
  for (let value = 0; value < expected.length; value += 1) {
    expect(Math.abs(actual[value] - expected[value])).toBeLessThanOrEqual(
      tolerance
    )
  }
}

function expectPercentagesClose(actual, expected, tolerance = 0.1) {
  for (const key of ['single', 'double', 'second']) {
    expect(actual[key]).toHaveLength(expected[key].length)
    for (let index = 0; index < expected[key].length; index += 1) {
      expect(Math.abs(actual[key][index] - expected[key][index]))
        .toBeLessThanOrEqual(tolerance)
    }
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
    const result = calculateRuleScore(
      { ...SCORE_PARAMS, skill: 5 },
      () => distribution
    )

    expect(result.result.values[0]).toBe(0.5)
    expect(result.result.values[7]).toBe(0.5)
    expect(result.metadata.failureProbability).toBe(0.5)
  })

  it('retains a non-fumble score clamped to zero as a successful result', () => {
    const result = calculateRuleScore(
      { ...SCORE_PARAMS, critical: 11, skill: -3 },
      () => sparseDistribution([[2, 1]])
    )
    const summary = getScoreSummary(
      {
        action: result,
        reaction: ScoreEnvelope([[0, 1]]),
      },
      { opposed: false, target: 0 }
    )

    expect(result.result.values[0]).toBe(1)
    expect(result.metadata.failureProbability).toBe(0)
    expect(summary.action.successRate).toEqual({ kind: 'exact', value: 100 })
  })

  it('excludes automatic failure and fumble from difficulty zero success', () => {
    const result = calculateRuleScore(
      { ...SCORE_PARAMS, critical: 11 },
      () => sparseDistribution([
        [0, 0.2],
        [1, 0.3],
        [2, 0.5],
      ])
    )
    const summary = getScoreSummary(
      {
        action: result,
        reaction: ScoreEnvelope([[0, 1]]),
      },
      { opposed: false, target: 0 }
    )

    expect(result.result.values[0]).toBe(0.5)
    expect(result.result.values[2]).toBe(0.5)
    expect(result.metadata.failureProbability).toBe(0.5)
    expect(summary.action.successRate).toEqual({ kind: 'exact', value: 50 })
  })

  it('keeps zero dice as automatic failure when yousei is specified', () => {
    const getDistribution = (shihai, dice) =>
      dice === 0
        ? sparseDistribution([[0, 1]])
        : sparseDistribution([[3, 1]])
    const result = calculateRuleScore(
      { ...SCORE_PARAMS, dice: 0, skill: 999, yousei: 9 },
      getDistribution
    )

    expect(result.result.values[0]).toBe(1)
    expect(result.metadata.failureProbability).toBe(1)
  })

  it('consumes one complete DX distribution when yousei is present', () => {
    const getDistribution = vi.fn((shihai, dice, critical, options, yousei) => {
      expect(shihai).toBe(0)
      expect(dice).toBe(4)
      expect(critical).toBe(10)
      expect(options).toBeUndefined()
      expect(yousei).toBe(2)
      return sparseDistribution([[23, 1]])
    })
    const result = calculateRuleScore(
      { ...SCORE_PARAMS, dice: 4, yousei: 2 },
      getDistribution
    )

    expect(result.result.values[23]).toBeCloseTo(1, 10)
    expect(getDistribution).toHaveBeenCalledOnce()
  })

  it('awards opposed ties to the reaction side', () => {
    const action = ScoreEnvelope([
      [0, 0.1],
      [5, 0.4],
      [10, 0.5],
    ])
    const reaction = ScoreEnvelope([
      [0, 0.2],
      [5, 0.3],
      [10, 0.5],
    ])
    const summary = getScoreSummary({ action, reaction })

    expect(summary.action.successRate).toEqual({ kind: 'exact', value: 33 })
    expect(summary.reaction.successRate).toEqual({ kind: 'exact', value: 67 })
  })
})

describe('runtime damage rules', () => {
  it('uses floor(score / 10) + 1 damage dice after a hit', async () => {
    const oneDieScore = {
      action: fixedScore(9),
      reaction: fixedScore(0),
    }
    const twoDiceScore = {
      action: fixedScore(10),
      reaction: fixedScore(0),
    }
    const attack = { dice: 0, value: 0, kazanari: 0 }
    const defence = { dice: 0, value: 0 }
    const oneDieDamage = await calculateRuleDamage(
      oneDieScore,
      attack,
      defence
    )
    const twoDiceDamage = await calculateRuleDamage(
      twoDiceScore,
      attack,
      defence
    )

    expectDistributionClose(
      oneDieDamage.result.values,
      Float64Array.from(independentD10Sum(1))
    )
    expectDistributionClose(
      twoDiceDamage.result.values,
      Float64Array.from(independentD10Sum(2))
    )
  })

  it('deals zero damage when the reaction ties the action', async () => {
    const damage = await calculateRuleDamage(
      {
        action: fixedScore(10),
        reaction: fixedScore(10),
      },
      { dice: 0, value: 0, kazanari: 0 },
      { dice: 0, value: 0 }
    )

    expect(damage.result.values[0]).toBe(1)
  })

  it('subtracts dice reduction after adding a positive fixed value', async () => {
    const damage = await calculateRuleDamage(
      {
        action: fixedScore(1),
        reaction: fixedScore(0),
      },
      { dice: 0, value: 5, kazanari: 0 },
      { dice: 1, value: 0 }
    )

    expect(damage.result.values[0]).toBeCloseTo(0.15, 10)
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

      const plan = planCalculationRanges({
        operation: 'backtrack',
        completeSupportBacktrack: true,
        backtrack: params,
      })
      const canonical = calculateFinalEncroachment(
        params,
        {},
        {},
        plan.backtrack
      )
      const presentation = createBacktrackPresentation(
        canonical,
        params
      )

      expectPercentagesClose(
        presentation.finalEncroachment,
        independentBacktrack(params, rule)
      )
    }
  )
})
